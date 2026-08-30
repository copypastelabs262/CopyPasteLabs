import { NextResponse } from "next/server";
import { requireUser, requireCourseOwner, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { normalizeRawTranscript } from "@/lib/transcript/normalize";
import { validateTranscript } from "@/lib/provenance/transcript-validation";
import { getExtractionMethod } from "@/lib/extraction";
import { reconstructLecture, RECONSTRUCTION_METHOD, RECONSTRUCTION_VERSION } from "@/lib/reasoning/reconstruct";
import { storeKnowledge } from "@/lib/knowledge/store";
import { decideReadiness } from "@/lib/knowledge/plan";
import { reasoningAvailable, getReasoningProvider, reasoningUnavailableReason } from "@/lib/reasoning";
import {
  transcriptFingerprint, findReusableRun, recordRun,
  type RunKey, type LedgerState,
} from "@/lib/processing/run";
import type { CourseContextDocument } from "@/lib/extraction/types";

// The course_context.kind vocabulary is a faculty-facing one; extraction has its
// own, narrower one. Mapping here keeps the UI free to grow new kinds without
// forcing every extraction method to learn them.
const CONTEXT_KIND: Record<string, CourseContextDocument["kind"]> = {
  syllabus: "syllabus", policy: "policy", schedule: "notes", note: "notes",
};

// Runs the whole processing pipeline for one lecture:
//
//   Layer 1  candidate detection   (rules + teaching structure, offline)
//   Layer 2  contextual reconstruction (a model, over bounded windows)
//   Layer 3  knowledge storage
//
// Layer 1 output is kept as the immutable proposal record, but it is no longer
// the product's knowledge -- a sentence is not a fact. Layer 2 is what turns
// four sentences about a research paper into one assignment with three steps.
//
// Reconstruction calls a model several times over a long lecture, so this can
// take tens of seconds.
export const maxDuration = 300;

// Produces CANDIDATES from a transcribed lecture. Nothing here is visible to a
// student: every row lands in extraction_candidates and needs a human verdict
// before it can appear as course knowledge.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const svc = serviceClient();

    const { data: lecture } = await svc
      .from("lectures")
      .select("id, course_id, status, raw_transcription_response, transcript_validation")
      .eq("id", id)
      .maybeSingle();
    if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
    await requireCourseOwner(lecture.course_id as string, user.id);

    if (!lecture.raw_transcription_response) {
      return NextResponse.json({ error: "Lecture has no transcript yet." }, { status: 409 });
    }

    const transcript = normalizeRawTranscript(lecture.raw_transcription_response);
    if (!transcript) {
      return NextResponse.json(
        { error: "The transcript could not be normalized, so extraction cannot run." },
        { status: 409 },
      );
    }

    // ---- THE TRANSCRIPT GATE -------------------------------------------
    //
    // Nothing below this point may run on a transcript that has not been
    // validated. The poll route already quarantines a rejected transcript, so
    // in the normal flow this never fires -- it is here because "the caller
    // already checked" is precisely the assumption that let a foreign
    // transcript reach a deployed product. Re-validating costs microseconds
    // and removes the assumption.
    //
    // The stored verdict is preferred when present, so a lecture quarantined
    // under one version of the guard stays quarantined; a transcript stored
    // BEFORE the guard existed has no verdict and is validated here, on the
    // spot, rather than being grandfathered in.
    const stored = lecture.transcript_validation as { verdict?: string; reason?: string } | null;
    const validation = stored?.verdict
      ? stored
      : validateTranscript(transcript.text);

    if (validation.verdict === "reject" || lecture.status === "quarantined") {
      await svc.from("lectures").update({
        status: "quarantined",
        error_message: validation.reason ?? "The transcript did not pass validation.",
        transcript_validation: validation,
      }).eq("id", id);
      return NextResponse.json(
        {
          error:
            "This lecture is quarantined and no knowledge was extracted from it. " +
            (validation.reason ?? "Its transcript did not pass validation."),
          lectureId: id,
          status: "quarantined",
          validation,
        },
        { status: 409 },
      );
    }

    const methodId = new URL(request.url).searchParams.get("method") ?? undefined;
    const method = getExtractionMethod(methodId);

    // Re-running must not duplicate proposals. Candidates are immutable, so the
    // guard is "has this exact method+version already read this lecture" rather
    // than a delete-and-reinsert, which would destroy review history.
    const { data: existing } = await svc
      .from("extraction_candidates")
      .select("id")
      .eq("lecture_id", id)
      .eq("extraction_method", method.id)
      .eq("extraction_version", method.version)
      .limit(1);
    // Layer 1 is skipped when this exact method+version has already read the
    // lecture -- candidates are immutable and would only duplicate. Layer 2
    // still runs below, because re-processing exists precisely to apply a
    // better reasoning pass to signals that have not changed.
    const layerOneAlreadyRun = Boolean(existing?.length);

    // Course Context enters HERE and only here. The transcription path never
    // reads it, so context can sharpen interpretation without ever altering the
    // evidence it is interpreting.
    const { data: contextRows } = await svc
      .from("course_context")
      .select("kind, title, body")
      .eq("course_id", lecture.course_id as string);

    const courseContext: CourseContextDocument[] = (contextRows ?? []).map((r) => ({
      kind: CONTEXT_KIND[r.kind as string] ?? "notes",
      title: r.title as string,
      body: r.body as string,
    }));

    const candidates = method.extract({ segments: transcript.segments, courseContext });

    if (candidates.length && !layerOneAlreadyRun) {
      const { error } = await svc.from("extraction_candidates").insert(
        candidates.map((c) => ({
          lecture_id: id,
          course_id: lecture.course_id,
          kind: c.kind, title: c.title, detail: c.detail,
          due_phrase: c.duePhrase, due_resolved: c.dueResolved,
          evidence_start_ms: c.evidenceStartMs, evidence_end_ms: c.evidenceEndMs,
          evidence_char_start: c.evidenceCharStart, evidence_char_end: c.evidenceCharEnd,
          evidence_text: c.evidenceText,
          confidence: c.confidence, matched_cue: c.matchedCue,
          extraction_method: method.id, extraction_version: method.version,
        })),
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ---- Layer 2 + 3: reconstruct meaning, then store it -------------------
    //
    // Runs on every lecture automatically. Nothing here is specific to a
    // subject, a lecturer or a language: the same pass reads any transcript.
    let knowledge: Awaited<ReturnType<typeof storeKnowledge>> | null = null;
    let reconstruction: Awaited<ReturnType<typeof reconstructLecture>>["stats"] | null = null;
    let reasoningError: string | null = null;
    // Assume the worst until a pass says otherwise. `complete` false with zero
    // windows is what "we never looked" looks like, and it is the correct
    // starting point for every branch below that fails to run one.
    let complete = false;
    let windows = 0;
    const available = reasoningAvailable();

    // ---- THE PAID-LAYER GUARD -------------------------------------------
    //
    // Layer 1 has always had an idempotency guard; Layer 2, the layer that
    // costs money, had none. At temperature 0 a re-run over an unchanged
    // transcript with an unchanged reasoner produces byte-identical output at
    // full price, and that is not a hypothetical: dev.log for 2026-08-30
    // records the same lecture reconstructed twice, 63s then 62s.
    //
    // `?force=1` is the deliberate escape hatch. It is a distinct, recorded
    // fact rather than a silent default, because "reuse the existing reading"
    // and "run a new experiment" are different intentions and the ledger has to
    // be able to tell them apart afterwards.
    const force = new URL(request.url).searchParams.get("force") === "1";
    const fingerprint = transcriptFingerprint(transcript.text);

    let reused = false;
    let ledger: LedgerState = "ok";
    let ledgerNote: string | null = null;
    let runKey: RunKey | null = null;
    // Knowledge already attached to this lecture. Read only when a reusable run
    // exists, because it is the second half of that question: a ledger row is a
    // claim that a result was produced, not proof that it is still there.
    let existingKnowledge = 0;
    const startedAt = Date.now();

    if (!available) {
      // Honest degradation. Candidates exist, knowledge does not, and the
      // response says which -- rather than letting sentence fragments pass for
      // understanding.
      //
      // The registry knows WHICH of the five ways this can fail actually
      // happened -- unset, unknown, paid-and-disabled, no key, no model -- and
      // saying "no model is configured" when the real answer is "the model id
      // is missing" sends the reader to the wrong file.
      reasoningError =
        reasoningUnavailableReason() ??
        "No reasoning model is configured, so no knowledge was reconstructed.";
    } else {
      // Naming the provider does not call it -- adapters read their credentials
      // at request time, not at construction -- so this is free and it is what
      // makes provider and model part of the cache key.
      const provider = getReasoningProvider();
      runKey = {
        lectureId: id,
        courseId: lecture.course_id as string,
        transcriptSha256: fingerprint,
        method: RECONSTRUCTION_METHOD,
        version: RECONSTRUCTION_VERSION,
        provider: provider.id,
        model: provider.model,
      };

      const lookup = force
        ? { state: "ok" as LedgerState, run: null, note: null }
        : await findReusableRun(runKey);
      ledger = lookup.state;
      ledgerNote = lookup.note;

      if (lookup.run) {
        const { count } = await svc
          .from("knowledge_items")
          .select("id", { count: "exact", head: true })
          .eq("lecture_id", id);
        existingKnowledge = count ?? 0;
      }

      // Both halves must hold. A ledger row whose knowledge has since been
      // deleted is not a cache hit; it is a run that has to happen again.
      if (lookup.run && existingKnowledge > 0) {
        reused = true;
        complete = true;
        windows = lookup.run.windows;
      } else try { // the else-body is the whole try/catch: reuse, or pay and read.
        const result = await reconstructLecture(transcript, candidates);
        reconstruction = result.stats;
        complete = result.complete;
        windows = result.stats.windows;
        knowledge = await storeKnowledge(
          id, lecture.course_id as string,
          result.items, result.method, result.version,
          result.complete,
        );
        // A WINDOW THAT FAILED IS AN ERROR, EVEN THOUGH NOTHING THREW.
        //
        // These were collected into stats.failures and read by nobody, so a run
        // in which the model returned an empty completion for every window
        // reported success with no knowledge in it. reasoningError is the field
        // the UI surfaces; a failure that never reaches it is a failure the
        // teacher never sees.
        if (result.stats.failures.length) {
          reasoningError =
            `${result.stats.failures.length} of ${result.stats.calls} reasoning calls failed, ` +
            "so this lecture was only partly read. Existing knowledge was left in place where " +
            `there was any. First failure: ${result.stats.failures[0]}`;
        } else if (knowledge.failed > 0) {
          reasoningError =
            `${knowledge.failed} reconstructed item(s) could not be stored with their evidence ` +
            "and were discarded rather than saved without it.";
        }
      } catch (err) {
        reasoningError = err instanceof Error ? err.message : String(err);
      }
    }

    // ---- PUBLICATION --------------------------------------------------
    //
    // 'ready' is what makes a lecture readable course material: every
    // student-facing read filters on it and the UI announces it. It used to be
    // set unconditionally, so a lecture whose reconstruction produced nothing
    // was published as an empty one -- the same failure shape as the Arabic
    // transcript, confident success over an empty result.
    //
    // The rule is now that a lecture is published when it has knowledge to
    // serve, and otherwise carries the reason why not. Note this is deliberately
    // not "the pass succeeded": a pass that lost three windows out of thirty
    // still leaves twenty-seven windows of real knowledge, and withholding all
    // of it would turn a partial failure into a total one.
    //
    // On a REUSED run nothing was stored, so `knowledge` is null and the count
    // has to come from the rows the earlier run left behind. Reading
    // `knowledge?.total ?? 0` here would report zero for a lecture that is
    // fully populated and demote it to `transcribed` -- turning the cost guard
    // into an unpublish bug.
    const knowledgeTotal = reused ? existingKnowledge : (knowledge?.total ?? 0);

    const readiness = decideReadiness({
      reasoningAvailable: available,
      complete,
      windows,
      knowledgeTotal,
    });

    // The invariant is "published implies has knowledge", and it has to hold on
    // a RE-RUN too, not only on the first extract. A lecture published earlier
    // that now holds nothing is demoted back to 'transcribed' -- its transcript
    // is intact and it can be extracted again, but it stops telling students it
    // is searchable when there is nothing in it to search. Quarantined lectures
    // never reach here; the gate above returns first.
    await svc.from("lectures").update(
      readiness.ready
        ? { status: "ready", error_message: null }
        : { status: "transcribed", error_message: readiness.reason },
    ).eq("id", id);

    // ---- THE LEDGER -----------------------------------------------------
    //
    // Recorded AFTER publication, so knowledge_total is the number that was
    // actually true when the run ended rather than the number it hoped for.
    //
    // Reused runs are recorded too. A reuse costs nothing, which is exactly why
    // it is worth a row: it is the only evidence that the guard earned its
    // keep, and without it "we stopped paying twice" is another claim nobody
    // can check.
    //
    // Nothing is recorded when no provider is configured -- no model was named
    // and none was called, so there is no run to meter.
    let runId: string | null = null;
    if (runKey) {
      const outcome =
        reused ? "reused" as const
        : !reconstruction ? "failed" as const
        : reconstruction.failures.length ? "partial" as const
        : "succeeded" as const;

      const usageKnown = (reconstruction?.callsWithUsage ?? 0) > 0;
      const recorded = await recordRun(runKey, {
        outcome,
        complete,
        calls: reconstruction?.calls ?? 0,
        promptTokens: usageKnown ? reconstruction!.promptTokens : null,
        completionTokens: usageKnown ? reconstruction!.completionTokens : null,
        durationMs: Date.now() - startedAt,
        windows,
        failedWindows: reconstruction?.failures.length ?? 0,
        itemsProposed: reconstruction?.itemsProposed ?? null,
        itemsDroppedUnverifiable: reconstruction?.itemsDroppedUnverifiable ?? null,
        knowledgeTotal,
        forced: force,
        error: reasoningError,
        // What the provider actually received, as distinct from what the engine
        // decided to ask for. Absent on a reused run: no requests were made.
        traffic: reconstruction
          ? {
              httpAttempts: reconstruction.httpAttempts,
              successfulCalls: reconstruction.successfulCalls,
              retries: reconstruction.retries,
              rateLimited: reconstruction.rateLimited,
              requestsPerMinute: reconstruction.requestsPerMinute,
              concurrency: reconstruction.concurrency,
            }
          : undefined,
      });
      runId = recorded.runId;
      // A ledger that could not be READ and one that could not be WRITTEN are
      // the same problem to the caller, so the first note found wins and is
      // reported rather than overwritten by a later success.
      if (recorded.state === "unavailable") {
        ledger = "unavailable";
        ledgerNote = ledgerNote ?? recorded.note;
      }
    }

    return NextResponse.json({
      lectureId: id,
      method: method.id, version: method.version,
      candidateCount: candidates.length,
      reconstruction: reconstruction
        ? {
            ...reconstruction,
            complete,
            method: RECONSTRUCTION_METHOD,
            version: RECONSTRUCTION_VERSION,
          }
        : null,
      knowledge,
      // WHAT THIS CALL COST, AND WHY.
      //
      // `reused: true` with `calls: 0` is the guard working. `ledger:
      // "unavailable"` means the migration is not applied, so nothing was
      // reused and nothing was recorded -- said out loud, because a cost
      // control that has silently stopped working looks exactly like one that
      // is working.
      processing: {
        runId,
        reused,
        forced: force,
        provider: runKey?.provider ?? null,
        model: runKey?.model ?? null,
        transcriptSha256: fingerprint,
        calls: reconstruction?.calls ?? 0,
        promptTokens: (reconstruction?.callsWithUsage ?? 0) > 0 ? reconstruction!.promptTokens : null,
        completionTokens: (reconstruction?.callsWithUsage ?? 0) > 0 ? reconstruction!.completionTokens : null,
        durationMs: Date.now() - startedAt,
        // `calls` is windows; these are requests. Test A made 20 of the first
        // and ~60 of the second, and reporting only the first made a total
        // failure look ordinary.
        httpAttempts: reconstruction?.httpAttempts ?? 0,
        successfulCalls: reconstruction?.successfulCalls ?? 0,
        retries: reconstruction?.retries ?? 0,
        rateLimited: reconstruction?.rateLimited ?? 0,
        requestsPerMinute: reconstruction?.requestsPerMinute ?? null,
        concurrency: reconstruction?.concurrency ?? null,
        ledger,
        ledgerNote,
      },
      // Whether the lecture was published, and if not, exactly which of the
      // four reasons applies. "Nothing to find" and "we failed to look" are
      // different states and the caller is told which one it got.
      status: readiness.ready ? "ready" : "transcribed",
      published: readiness.ready,
      readiness: { code: readiness.code, reason: readiness.reason },
      reasoningError,
      transcriptValidation: validation,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
