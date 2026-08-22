import type { Metadata } from "next";
import { LegalPage, H2, P, UL, Callout } from "@/app/_components/Legal";

export const metadata: Metadata = {
  title: "Privacy Policy · ClassMind",
  description: "What ClassMind collects, who it is shared with, and how long it is kept.",
};

// Written from what the code actually does, not from a template. Where the
// software has a gap -- no age verification, no automatic deletion, no external
// security audit -- this says so. A policy that describes a system nobody built
// is worse than no policy, because it is a promise that will be broken.
export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="22 August 2026"
      intro={
        <>
          ClassMind is a pre-release engineering project built by CopyPasteLabs. This policy
          describes what the software actually does today, written by the people who built it.
          It has not been reviewed by a lawyer. If you are deciding whether to put real student
          data into this system, read the <strong>Retention</strong> and{" "}
          <strong>Children&rsquo;s data</strong> sections first.
        </>
      }
    >
      <H2>What we collect</H2>
      <UL>
        <li>
          <strong>Account information.</strong> Your email address, and your name if you provide
          one. If you sign in with Google we receive your email address, name and profile picture
          URL from your Google account. We never receive your Google password, and we request no
          access to Gmail, Drive, Calendar or any other Google service.
        </li>
        <li>
          <strong>Course information.</strong> Course codes, titles, terms, and any course context
          a faculty member adds &mdash; syllabus text, policies, schedules, notes.
        </li>
        <li>
          <strong>Lecture recordings.</strong> Audio files uploaded by faculty. These contain the
          voice of whoever is speaking, which in a classroom recording may include students as
          well as the lecturer.
        </li>
        <li>
          <strong>Material derived from those recordings.</strong> The transcription provider&rsquo;s
          raw response, the readable transcript derived from it, extracted candidate items, and
          every confirm, edit or reject decision a faculty member makes, recorded with the
          identity of the person who made it.
        </li>
        <li>
          <strong>Technical logs.</strong> Standard request logs kept by our hosting provider.
        </li>
      </UL>
      <P>
        We do not collect payment details, location data, or anything from other applications on
        your device.
      </P>

      <H2>How we use it</H2>
      <P>
        Only to operate the service: to transcribe lectures, to propose academic information for a
        faculty member to review, and to show confirmed information to students enrolled in that
        course. We do not sell personal data, and we do not use it for advertising or profiling.
      </P>

      <H2>Who else processes it</H2>
      <UL>
        <li>
          <strong>Supabase</strong> &mdash; database, file storage and authentication. Data is
          stored in AWS <code>ap-south-1</code> (Mumbai, India).
        </li>
        <li>
          <strong>Vercel</strong> &mdash; application hosting. Server functions run in Mumbai.
        </li>
        <li>
          <strong>Sarvam AI</strong> &mdash; speech recognition. When live transcription is
          enabled, <strong>the lecture audio file is uploaded to Sarvam for processing</strong>.
          At the time of writing this deployment runs in replay mode and sends no audio to any
          transcription provider; that will change when live transcription is switched on.
        </li>
        <li>
          <strong>Google</strong> &mdash; only if you choose to sign in with Google.
        </li>
      </UL>

      <H2>Retention &mdash; please read this one</H2>
      <Callout>
        <strong>This system is designed not to delete.</strong> Raw lecture audio and the
        transcription provider&rsquo;s raw response are preserved permanently, deliberately: every
        item a student reads traces back to the second it was spoken, and that trace breaks if the
        source is thrown away. Rejected extractions are kept too, rather than deleted. There is no
        automatic expiry of anything. Assume that what is uploaded stays until a person removes it
        on request.
      </Callout>

      <H2>Consent to being recorded</H2>
      <P>
        Uploading a recording of other people is a decision the uploader makes. If you are a
        faculty member, you are responsible for having the right to record the session and for
        telling the people in it that it is being recorded and uploaded here. ClassMind does not
        obtain that consent for you and has no way to verify that you have it.
      </P>

      <H2>Children&rsquo;s data</H2>
      <Callout>
        Classroom recordings may include the voices of students under 18. India&rsquo;s Digital
        Personal Data Protection Act, 2023 imposes additional obligations on processing
        children&rsquo;s personal data, including verifiable parental consent.{" "}
        <strong>
          ClassMind currently implements no age verification and no parental consent mechanism.
        </strong>{" "}
        It should not be used in settings involving minors until that is addressed.
      </Callout>

      <H2>Your rights</H2>
      <P>
        You can ask us for a copy of the personal data we hold about you, ask us to correct it, or
        ask us to delete it. Contact us using the details below and we will act on the request.
        Deleting a recording also destroys the evidence trail behind any confirmed item that came
        from it, so we will tell you what will be lost before we do it.
      </P>
      <P>
        If you are in India, the Digital Personal Data Protection Act, 2023 gives you rights of
        access, correction, erasure and grievance redressal. We will honour those requests through
        the same contact address.
      </P>

      <H2>Security</H2>
      <P>
        Lecture audio is held in a private storage bucket and is only reachable through short-lived
        signed links issued after we check who is asking. Every database table has row-level
        security enabled with no public policies, so the browser-side key can read nothing
        directly; all access goes through server code that checks permissions first. Extracted
        information is not readable by students at all until a faculty member confirms it.
      </P>
      <P>
        No system is perfectly secure, and this one has not had an external security audit.
      </P>

      <H2>Changes to this policy</H2>
      <P>
        If this changes we will update the date at the top. Material changes to how we use lecture
        recordings will be communicated to account holders.
      </P>

      <H2>Contact</H2>
      <P>
        CopyPasteLabs &mdash; ClassMind. Questions, access requests and deletion requests:{" "}
        <a className="underline" href="mailto:shyamworks06@gmail.com">shyamworks06@gmail.com</a>.
      </P>
    </LegalPage>
  );
}
