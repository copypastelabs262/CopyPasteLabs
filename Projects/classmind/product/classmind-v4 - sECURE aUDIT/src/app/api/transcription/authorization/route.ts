import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { liveCallIsAllowedHere } from "@/lib/transcription";

// Answers ONE question for the upload UI, before anything is created: would a
// live, billable transcription be permitted on this server right now?
//
// Without this, the browser only learns the answer from the transcribe route's
// refusal -- which arrives AFTER a lecture row exists and the whole recording
// has been uploaded, so every refused attempt leaves an orphaned
// pending_upload row behind. Asking first costs one authenticated GET and
// creates nothing.
//
// This route READS the policy; it must never influence it. The decision stays
// in liveCallIsAllowedHere() -- deployments are always allowed (a live call is
// the product there), developer machines require the per-process
// ALLOW_LIVE_SARVAM=1 opt-in (`npm run dev:spend`). The transcribe route keeps
// its own guard regardless: this is a courtesy check, not the protection.
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ liveTranscriptionAllowed: liveCallIsAllowedHere() });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
