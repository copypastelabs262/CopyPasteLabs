// RETIRED IN V4 — types only.
//
// The component that lived here was v3's course page: one screen carrying the
// upload, the lectures, the context form, the knowledge dump and the ask
// panel. The v4 class shell (`shell/ClassShell.tsx` + the tab surfaces under
// `src/app/courses/[id]/`) replaced it; the single course fetch it owned moved
// to `shell/ClassContext.tsx`, and its JoinCode moved into the shell's context
// header.
//
// The row types survive because every course surface still speaks them.

export interface CourseLecture {
  id: string; title: string; status: string; provider_status: string | null;
  original_filename: string; file_size_bytes: number; created_at: string;
  completed_at: string | null; error_message: string | null;
  // Optional because it arrived later than the rest of the row: the course
  // route already selects it, and nothing that consumes this type may assume
  // an older payload carried it.
  recorded_on?: string | null;
}
export interface CourseContextDoc {
  id: string; kind: string; title: string; body: string; created_at: string;
}
export interface CourseHeader {
  id: string; code: string; title: string; term: string | null;
  join_code?: string; transcription_language?: string;
}
