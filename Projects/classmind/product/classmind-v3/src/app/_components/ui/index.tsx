"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from "react";
import { CloseIcon } from "./icons";
import { STATUS_LABEL } from "../Input";

// The shared vocabulary of the interface.
//
// Everything here exists because more than one screen needs it and the screens
// must not be allowed to disagree -- what a "primary action" looks like, how
// far apart two sections sit, what colour "needs your attention" is. A
// component that only one screen uses does not belong here; it belongs beside
// that screen, where it can change without a survey of the whole app.
//
// The whole module is a client module. Almost none of it needs to be -- only
// Dialog and the labelled inputs hold state -- but splitting a two-hundred-line
// primitive set into a server half and a client half buys a few kilobytes and
// costs every caller a decision about which half a component lives in.

/* ---------------------------------------------------------------------------
   cx
--------------------------------------------------------------------------- */

export type ClassValue = string | false | null | undefined;

// Conditional class names, and nothing else. No object syntax and no dedupe:
// both invite building class strings out of data, which is how a component ends
// up with styles no one can find by searching for the literal.
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------------------
   Layout
--------------------------------------------------------------------------- */

// Vertical rhythm for a whole screen. Sections do NOT set their own outer
// margins -- spacing between siblings is the parent's business, or two sections
// written months apart end up a few pixels out and no one can say which is
// wrong.
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("space-y-14 sm:space-y-16", className)}>{children}</div>;
}

// The top of a screen: a quiet eyebrow, one large title, one optional sentence,
// and at most ONE action. The action slot is singular by design. Two equally
// weighted buttons here is the fastest way to stop answering the only question
// this header exists to answer -- what is this page, and what should I do on it.
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow-mono">{eyebrow}</p> : null}
        <h1 className="font-display mt-2 text-[2.35rem] leading-[1.06] font-medium tracking-[-0.015em] text-balance text-ink sm:text-[3rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-ink-soft">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

// A titled band of content. Sections carry no border and no background: the
// heading and the whitespace do the grouping. Boxing every section is what makes
// an interface look like a dashboard, and it costs the page its hierarchy --
// when everything is in a card, nothing is emphasised.
export function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id}>
      {title || description || action ? (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-lg font-semibold tracking-[-0.012em] text-ink">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// A real surface: something that is grouped, liftable, or clickable as a unit.
// `padded={false}` is for a card whose children are rows and want to own their
// own padding (a divided list, for instance).
export function Card({
  children,
  interactive,
  padded = true,
  className,
}: {
  children: ReactNode;
  interactive?: boolean;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl",
        // L2 at rest; interactive cards move up one material level and answer
        // hover with light. focus-within so a card reached by keyboard shows
        // the same "this one" a mouse gets for free.
        interactive ? "glass-3 focus-within:border-accent" : "glass-2",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Actions
--------------------------------------------------------------------------- */

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// Four tones, and the tone is the meaning. `primary` is the one thing this
// screen is for and should appear once; `secondary` is everything else that is
// still a real action; `ghost` is for actions that are noise until you want
// them; `danger` is reserved for irreversible.
const BUTTON_TONE: Record<ButtonTone, string> = {
  // The primary action is allowed to emit light — it may be the screen's one
  // glowing element, so its glow stays inside the app-wide 0.16 alpha budget.
  primary:
    "bg-accent-fill text-accent-ink shadow-[0_0_0_1px_rgba(94,141,255,0.25),0_10px_30px_-10px_rgba(94,141,255,0.16)] hover:bg-accent-strong",
  secondary: "glass-3 text-ink",
  ghost: "text-ink-soft hover:bg-surface-sunken hover:text-ink",
  danger: "bg-danger text-danger-ink hover:bg-danger-strong",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2.5 rounded-xl px-5 text-[15px] sm:px-6",
};

export function buttonClass(
  tone: ButtonTone = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cx(
    "inline-flex shrink-0 select-none items-center justify-center font-medium transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    BUTTON_TONE[tone],
    BUTTON_SIZE[size],
    className,
  );
}

// `type` defaults to "button". A button inside a form defaults to submit in
// HTML, and an action button that quietly submits the form it happens to sit in
// is a bug that only shows up in production. Forms pass type="submit" and mean
// it.
export function Button({
  tone = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(tone, size, className)} {...rest} />;
}

// The same four tones on a link. Navigation is a link, not a button with a
// router push: middle-click, open-in-new-tab and "where does this go" in the
// status bar all stop working the moment an anchor becomes a click handler.
export function ButtonLink({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: ButtonSize }) {
  return <Link className={buttonClass(tone, size, className)} {...rest} />;
}

/* ---------------------------------------------------------------------------
   State
--------------------------------------------------------------------------- */

// The screen a new user sees most. It gets the same care as a full screen,
// because "nothing here yet" is the moment someone decides whether the product
// is worth the next five minutes -- so it names the next action rather than
// reporting the absence.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  // Compact and solid on purpose. A dashed full-viewport void is the visual
  // language of an unfinished mock, and a new account sees more empty states
  // than full ones — they should read as a calm system awaiting input, not as
  // a missing feature, and they should never dominate the screen they sit on.
  // The action sits beside the text only when there is room for both; on a
  // phone it drops below, because a fixed-width button beside a fluid column
  // crushes the sentence into a ten-character ribbon.
  return (
    <div className="glass-2 rounded-2xl px-5 py-5 text-left sm:px-6">
      <div className="flex items-center gap-4">
        {icon ? (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft"
            style={{
              background: "rgba(148,163,184,0.09)",
              boxShadow: "0 0 24px -6px rgba(94,141,255,0.14)",
            }}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-medium tracking-[-0.008em] text-ink">
            {title}
          </p>
          {description ? (
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">{description}</p>
          ) : null}
        </div>
        {action ? <div className="hidden shrink-0 sm:block">{action}</div> : null}
      </div>
      {action ? <div className={cx("mt-4 sm:hidden", icon && "pl-14")}>{action}</div> : null}
    </div>
  );
}

export type PillTone = "neutral" | "ok" | "warn" | "danger" | "busy";

// Pigment, not light: status chips are tinted fills with a matching border,
// and they never glow. Colour states change hue, never intensity.
const PILL_TONE: Record<PillTone, string> = {
  neutral: "bg-surface-sunken text-ink-soft border border-line",
  ok: "bg-ok-soft text-ok border border-ok/25",
  warn: "bg-warn-soft text-warn border border-warn/25",
  danger: "bg-danger-soft text-danger border border-danger/25",
  busy: "bg-accent-soft text-accent border border-accent/25",
};

const PILL_DOT: Record<PillTone, string> = {
  neutral: "bg-ink-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  busy: "bg-accent animate-pulse",
};

// State, in words. The dot repeats the tone and never replaces the label: if the
// colour is the only thing carrying the meaning, the pill says nothing to a
// colour-blind reader or a screen reader, which is most of the reason status
// badges get misread at all.
export function StatusPill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        PILL_TONE[tone],
      )}
    >
      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", PILL_DOT[tone])} />
      {children}
    </span>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cx("animate-spin", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.2} />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

// Loading placeholders are shaped like the content they stand in for, so the
// page does not reflow when the data lands. `aria-hidden` because "grey
// rectangle" is not information -- the region that owns them announces the wait.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-lg bg-surface-sunken", className)} />;
}

/* ---------------------------------------------------------------------------
   Forms
--------------------------------------------------------------------------- */

// The visual shell of a labelled control. Exported for controls this file does
// not wrap (a file picker, a segmented control), which is why it takes ids
// rather than generating them: the caller owns the control, so the caller owns
// the wiring between the control and the text describing it.
export function Field({
  label,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  hintId?: string;
  error?: ReactNode;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-ink-faint">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASS =
  "w-full rounded-xl border border-line bg-surface-sunken/70 px-3.5 py-2.5 text-[15px] text-ink transition-colors " +
  "placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent disabled:opacity-50 " +
  "aria-[invalid=true]:border-danger";

interface ControlProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  name?: string;
  autoFocus?: boolean;
}

// `onChange` hands over the value, not the event. Every call site in this app
// wants the string, and a hundred `e.target.value`s is a hundred chances to
// read the wrong field off the wrong event.
export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  hint,
  error,
  name,
  autoFocus,
  type = "text",
  inputMode,
  autoComplete,
}: ControlProps & {
  type?: string;
  inputMode?: "text" | "numeric" | "email" | "search";
  autoComplete?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <Field label={label} htmlFor={id} hint={hint} hintId={hintId} error={error} errorId={errorId}>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        // Set only on the single control inside a dialog the reader just chose
        // to open. Autofocusing anything on a page they did not ask for moves
        // the cursor out from under them.
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(hintId, errorId) || undefined}
        className={CONTROL_CLASS}
      />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  hint,
  error,
  name,
  rows = 4,
}: ControlProps & { rows?: number }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <Field label={label} htmlFor={id} hint={hint} hintId={hintId} error={error} errorId={errorId}>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(hintId, errorId) || undefined}
        className={cx(CONTROL_CLASS, "resize-y leading-relaxed")}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
  name,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  name?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <Field label={label} htmlFor={id} hint={hint} hintId={hintId} error={error} errorId={errorId}>
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={cx(hintId, errorId) || undefined}
        className={cx(CONTROL_CLASS, "appearance-none bg-surface pr-9")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ---------------------------------------------------------------------------
   Dialog
--------------------------------------------------------------------------- */

// A modal for the two things that deserve one: confirming something
// irreversible, and a short form that would otherwise clutter the page it is
// launched from.
//
// Not a focus trap. A trap that is almost right is worse than none -- it strands
// keyboard users inside a box they cannot leave -- and the three exits that
// actually matter are all here: Escape, the backdrop, and a real close button.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind a modal must not scroll: on a phone, a backdrop that
    // scrolls the page is indistinguishable from a broken dialog.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Deliberately keyed on `open` alone. Folding this into the effect above
  // would re-run it whenever an inline `onClose` identity changed -- which is
  // every render -- and yank focus back to the panel on every keystroke typed
  // into a field inside it.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      // `m-0!` is load-bearing, not tidiness. There is no portal here, so the
      // overlay is a child of whatever rendered it -- and a `space-y` parent
      // would hand a fixed, inset-0 box a top margin, which pushes the backdrop
      // down the screen and shortens it. Neutralising the margin means where a
      // Dialog is declared in the tree stops being a layout decision.
      // Scrim is opacity-only — blur belongs to the panel (L4), never to a
      // full-viewport layer.
      className="motion-fade fixed inset-0 z-50 m-0! flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      // mousedown, not click: a click fires on the element the pointer is
      // released over, so selecting text inside the panel and releasing on the
      // backdrop would close the dialog and discard what was typed.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-overlay motion-rise max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl p-6 outline-none sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.012em] text-ink">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1.5 -mr-1.5 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
        {footer ? <div className="mt-7 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Lecture status

   A lecture's status is shown on the home screen, on a course, and on the
   lecture itself. The words for it already live in `../Input` for exactly that
   reason; re-declaring them here would recreate the disagreement that comment
   exists to prevent, so this imports them and adds the two things a label
   cannot carry: what colour the state is, and what it means for the reader.
--------------------------------------------------------------------------- */

const QUARANTINED_LABEL = "Quarantined — transcript rejected";

export function lectureStatusLabel(status: string): string {
  if (status === "quarantined") return QUARANTINED_LABEL;
  return STATUS_LABEL[status] ?? status;
}

export function lectureStatusTone(status: string): PillTone {
  switch (status) {
    case "ready":
      return "ok";
    case "transcribing":
    case "extracting":
      return "busy";
    // Both are stalls rather than failures: a transcript exists and a human has
    // to do something before it becomes anything. Amber, not red.
    case "transcribed":
    case "quarantined":
      return "warn";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

// One sentence about what the system has actually captured so far. Written from
// the reader's side -- "waiting for your review" rather than "status=ready" --
// and never claiming more than the row can prove.
export function lectureStatusNote(status: string, errorMessage?: string | null): string | null {
  switch (status) {
    case "pending_upload":
      return "Waiting for the audio file.";
    case "uploaded":
      return "Audio stored. Transcription has not started.";
    case "transcribing":
      return "Turning the recording into a transcript.";
    case "transcribed":
      return "Transcribed. Nothing has been read out of it yet.";
    case "extracting":
      return "Reading the transcript for what was taught.";
    case "ready":
      return "What was taught is live. Anything actionable is waiting for your review.";
    case "quarantined":
      return friendlyLectureError(errorMessage).message;
    case "failed":
      return friendlyLectureError(errorMessage).message;
    default:
      return errorMessage ? friendlyLectureError(errorMessage).message : null;
  }
}

/* ---------------------------------------------------------------------------
   Failure, in human words.

   The database stores whatever the provider threw — a raw 402 payload with a
   request id, at worst — because losing the evidence would be worse. But raw
   payloads are machine exhaust, and rendering one as body copy is how a
   product tells its reader "something you cannot understand went wrong".
   Every screen renders the sentence; the payload stays one disclosure away
   (TechnicalDisclosure below) with the request id extracted for support.
--------------------------------------------------------------------------- */

export interface FriendlyError {
  message: string;
  /** Short support reference pulled out of the raw payload, when one exists. */
  ref: string | null;
  /** The untouched original, for the disclosure. Null when it IS the message. */
  raw: string | null;
}

export function friendlyLectureError(raw: string | null | undefined): FriendlyError {
  if (!raw) return { message: "Processing failed.", ref: null, raw: null };

  // Short on purpose: the ref is for a human to read to support, and the full
  // id is always in the raw payload below it. A 40-character token wraps
  // mid-string on a phone, which is worse than a shorter handle.
  const ref = raw.match(/request_id"?\s*[:=]\s*"?([A-Za-z0-9_-]{6,})/)?.[1]?.slice(0, 12) ?? null;
  const lower = raw.toLowerCase();

  if (lower.includes("insufficient_quota") || lower.includes("no credits")) {
    return {
      message:
        "Transcription is paused — the transcription service has run out of credits. " +
        "Your recording is stored safely and nothing was lost; it can be transcribed " +
        "once credits are restored.",
      ref,
      raw,
    };
  }
  if (lower.includes("sarvam") || lower.includes("transcri")) {
    return {
      message:
        "Transcription failed partway. Your recording is stored safely — it can be " +
        "re-run without uploading again.",
      ref,
      raw,
    };
  }
  // Anything that looks like a payload rather than a sentence gets the generic
  // sentence; anything that already reads as human (the transcript guard's
  // verdicts, for instance) passes through untouched.
  if (raw.includes("{") || raw.includes("_error") || raw.length > 200) {
    return {
      message:
        "Processing hit a technical problem. Your recording is safe, and the details " +
        "are preserved below for support.",
      ref,
      raw,
    };
  }
  return { message: raw, ref, raw: null };
}

// The raw payload, one click away, in the machine voice. Never ambient.
export function TechnicalDisclosure({ error }: { error: FriendlyError }) {
  if (!error.raw && !error.ref) return null;
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer text-ink-faint transition-colors hover:text-ink-soft">
        Technical details{error.ref ? <> &middot; ref <code className="chip-mono whitespace-nowrap">{error.ref}</code></> : null}
      </summary>
      {error.raw ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-sunken/80 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink-faint">
          {error.raw}
        </pre>
      ) : null}
    </details>
  );
}

/* ---------------------------------------------------------------------------
   The pipeline, as a track.

   Upload → transcribe → read → review → live is the product's core drama, and
   a corner pill reduces it to a database enum. Five segments make state
   narrative: lit is done, breathing is in progress, red says exactly where it
   broke. Labels are mono — stage names are machine facts.
--------------------------------------------------------------------------- */

const STAGES = ["upload", "transcribe", "read", "review", "live"] as const;

type SegmentState = "done" | "active" | "danger" | "idle";

function stageStates(status: string, errorMessage?: string | null): {
  segments: SegmentState[];
  caption: string;
} {
  const seg = (fill: number, mark?: { at: number; as: SegmentState }): SegmentState[] =>
    STAGES.map((_, i) => {
      if (mark && i === mark.at) return mark.as;
      return i < fill ? "done" : "idle";
    });

  switch (status) {
    case "pending_upload":
      return { segments: seg(0, { at: 0, as: "active" }), caption: "upload · waiting for audio" };
    case "uploaded":
      return { segments: seg(1), caption: "transcribe · not started" };
    case "transcribing":
      return { segments: seg(1, { at: 1, as: "active" }), caption: "transcribe · in progress" };
    case "transcribed":
      return { segments: seg(2), caption: "read · nothing read out yet" };
    case "extracting":
      return { segments: seg(2, { at: 2, as: "active" }), caption: "read · in progress" };
    case "ready":
      return { segments: seg(5), caption: "live" };
    case "quarantined":
      return { segments: seg(1, { at: 1, as: "danger" }), caption: "transcribe · transcript rejected" };
    case "failed": {
      const lower = (errorMessage ?? "").toLowerCase();
      const at = lower.includes("sarvam") || lower.includes("transcri") || lower.includes("credit") ? 1 : 2;
      return { segments: seg(at, { at, as: "danger" }), caption: `${STAGES[at]} · failed here` };
    }
    default:
      return { segments: seg(0), caption: status };
  }
}

const SEGMENT_CLASS: Record<SegmentState, string> = {
  done: "bg-accent/55",
  active: "bg-accent cm-breathe",
  danger: "bg-danger",
  idle: "bg-line",
};

// Decorative on purpose: the StatusPill beside it carries the words, and a
// screen reader gets state from the pill, not from five coloured bars.
export function PipelineTrack({
  status,
  errorMessage,
  className,
}: {
  status: string;
  errorMessage?: string | null;
  className?: string;
}) {
  const { segments, caption } = stageStates(status, errorMessage);
  return (
    <div className={cx("min-w-0", className)} aria-hidden="true">
      <div className="flex gap-1">
        {segments.map((state, i) => (
          <span key={i} className={cx("h-1 flex-1 rounded-full", SEGMENT_CLASS[state])} />
        ))}
      </div>
      <p className="eyebrow-mono mt-1.5 truncate !text-[10px]">{caption}</p>
    </div>
  );
}
