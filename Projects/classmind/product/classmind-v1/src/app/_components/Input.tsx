"use client";

export function Input({
  label, value, onChange, placeholder, required, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
      />
    </div>
  );
}

export function TextArea({
  label, value, onChange, placeholder, rows = 4,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</label>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
      />
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export const KIND_LABEL: Record<string, string> = {
  // Actionable
  assignment: "Assignment",
  deadline: "Deadline",
  exam_scope: "Exam scope",
  announcement: "Announcement",
  guidance: "Guidance",
  // Teaching
  lesson_scope: "Lesson scope",
  topic: "Topic",
  definition: "Concept",
  enumeration: "Breakdown",
  comparison: "Comparison",
  // Context
  reference: "Reference",
};

// The three questions a reader is actually asking. `kind` says what an item is;
// this says which question it answers, and it is what the review queue and the
// lecture summary group by.
export const CATEGORY_LABEL: Record<string, string> = {
  actionable: "What you have to do",
  teaching: "What was taught",
  reference: "Mentioned in passing",
};

const TEACHING_KINDS = new Set(["lesson_scope", "topic", "definition", "enumeration", "comparison"]);

export function categoryFor(kind: string): "teaching" | "actionable" | "reference" {
  if (kind === "reference") return "reference";
  return TEACHING_KINDS.has(kind) ? "teaching" : "actionable";
}

// Lecture status, in faculty words rather than column values. Lives here rather
// than beside one of its two callers because the course list and the lecture
// page must never disagree about what a lecture is currently doing.
export const STATUS_LABEL: Record<string, string> = {
  pending_upload: "Awaiting upload",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  // Deliberately not "review candidates": at `transcribed` there are none yet.
  // Extraction is a separate step and the UI has to say so, or a stalled
  // lecture looks finished.
  transcribed: "Transcribed — candidates not extracted yet",
  extracting: "Extracting",
  ready: "Published",
  failed: "Failed",
};
