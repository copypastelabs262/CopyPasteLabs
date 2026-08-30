import type { Metadata } from "next";
import { LegalPage, H2, P, UL, Callout } from "@/app/_components/Legal";

export const metadata: Metadata = {
  title: "Terms of Service · ClassMind",
  description: "The terms under which ClassMind may be used, and what it does not promise.",
};

export default function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="22 August 2026"
      intro={
        <>
          These terms cover your use of ClassMind, a pre-release service built by CopyPasteLabs.
          By creating an account or using the service you agree to them. They have not been
          reviewed by a lawyer. The two sections that carry real obligations are{" "}
          <strong>If you are faculty</strong> and <strong>If you are a student</strong>.
        </>
      }
    >
      <H2>What ClassMind is</H2>
      <P>
        Faculty upload a recorded lecture. ClassMind transcribes it, then proposes items of
        academic information found in the transcript &mdash; assignments, deadlines, exam scope,
        announcements, guidance &mdash; each attached to the moment in the recording it came from.
        A faculty member reviews each proposal and confirms, edits or rejects it. Only confirmed
        items are shown to students.
      </P>
      <Callout>
        Nothing extracted from a lecture reaches a student until a human has confirmed it. That
        gate is the product. It is enforced in the software, not by policy &mdash; a student
        account has no route to unconfirmed proposals even with a direct link.
      </Callout>

      <H2>Pre-release status</H2>
      <P>
        ClassMind is provided <strong>as is</strong>, without warranties of any kind. It is an
        engineering project under active development. Features may change or be removed, the
        service may be unavailable, and data may be lost. Do not use it as a system of record, and
        do not make it the only place any important information exists.
      </P>

      <H2>Accounts</H2>
      <UL>
        <li>Provide accurate information when you register.</li>
        <li>Keep your credentials to yourself; you are responsible for activity on your account.</li>
        <li>
          Course join codes let anyone holding them enrol in a course. Share them with your class,
          not publicly.
        </li>
      </UL>

      <H2>If you are faculty</H2>
      <UL>
        <li>
          <strong>You must have the right to record and upload the session,</strong> and you must
          tell the people in it that it is being recorded and uploaded here. ClassMind cannot
          obtain or verify that consent for you.
        </li>
        <li>
          <strong>Confirming an item publishes it to your students.</strong> The proposals come
          from automated pattern matching over an automatic transcript. They are frequently wrong.
          Confirmation is a judgment you are making and are responsible for &mdash; read the
          evidence, not just the title.
        </li>
        <li>
          Do not upload recordings containing content you do not have the rights to distribute,
          or material that is confidential to someone else.
        </li>
      </UL>

      <H2>If you are a student</H2>
      <Callout>
        Confirmed information reflects one faculty member&rsquo;s judgment at one moment about one
        sentence in one recording. <strong>It is not an official notice.</strong> Where it
        disagrees with your institution&rsquo;s official channels &mdash; the notice board, the
        LMS, the department office &mdash; the official channel is right and this is wrong. Do not
        rely on ClassMind alone for a deadline, an exam date or an assessment rule.
      </Callout>

      <H2>Accuracy</H2>
      <P>
        Transcription is automatic and makes mistakes, particularly with code-switched speech,
        accents, names and technical terms. Extraction is automatic and has not been measured
        against any benchmark; the confidence score shown to faculty orders a review queue and
        means nothing more than that. Timestamps point at the segment a sentence sits in, not at
        an exact instant.
      </P>

      <H2>Acceptable use</H2>
      <UL>
        <li>Do not upload unlawful, harassing or deliberately misleading material.</li>
        <li>Do not attempt to access another person&rsquo;s account, course or data.</li>
        <li>Do not probe, scan or attempt to circumvent the service&rsquo;s access controls.</li>
        <li>Do not scrape the service or use it in an automated way we have not agreed to.</li>
      </UL>

      <H2>Your content</H2>
      <P>
        You keep ownership of the recordings and course material you upload. You grant
        CopyPasteLabs the permission needed to store, process, transcribe and display that content
        for the purpose of operating the service for you and the students enrolled in your course
        &mdash; and no other purpose. We do not use your content to train models.
      </P>
      <P>
        Retention is described in the <a className="underline" href="/privacy">Privacy Policy</a>{" "}
        and is unusual: raw audio and raw transcription output are kept permanently by design.
        Read that section before uploading.
      </P>

      <H2>Suspension and termination</H2>
      <P>
        You may stop using the service at any time and ask us to delete your account and its
        content. We may suspend or remove an account that breaches these terms or puts other
        users&rsquo; data at risk.
      </P>

      <H2>Liability</H2>
      <P>
        To the maximum extent permitted by law, CopyPasteLabs is not liable for indirect or
        consequential loss, for loss of data, or for any consequence of relying on information
        presented in the service &mdash; including a missed deadline or an incorrect exam scope.
        Nothing in these terms limits liability that cannot be limited by law.
      </P>

      <H2>Governing law</H2>
      <P>These terms are governed by the laws of India.</P>

      <H2>Changes</H2>
      <P>
        We may update these terms. The date at the top will change, and continued use after a
        change means you accept the updated terms.
      </P>

      <H2>Contact</H2>
      <P>
        CopyPasteLabs &mdash; ClassMind. <a className="underline" href="mailto:shyamworks06@gmail.com">shyamworks06@gmail.com</a>.
      </P>
    </LegalPage>
  );
}
