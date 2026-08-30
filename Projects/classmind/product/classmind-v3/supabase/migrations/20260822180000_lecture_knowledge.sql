-- Teaching knowledge, alongside actionable knowledge.
--
-- A real 23-minute college lecture produced exactly one candidate: the
-- assignment in its final minute. The matcher was not at fault. Every value the
-- old `kind` constraint allowed -- assignment, deadline, exam_scope,
-- announcement, guidance -- is a category of ACTION, so there was no shape in
-- this schema in which "the lecturer defined a unified manager" could be
-- stored, even if something had detected it. Twenty-two minutes of teaching had
-- nowhere to go.
--
-- This widens the vocabulary. It does not restructure anything: candidates stay
-- immutable proposals, verdicts stay append-only, and confirmed knowledge is
-- still derived from the join of the two.

alter table public.extraction_candidates
  drop constraint if exists extraction_candidates_kind_check;

alter table public.extraction_candidates
  add constraint extraction_candidates_kind_check
  check (kind in (
    -- ACTIONABLE: something is required of, or announced to, students.
    'assignment', 'deadline', 'exam_scope', 'announcement', 'guidance',
    -- TEACHING: what the lecturer explained.
    'lesson_scope', 'topic', 'definition', 'enumeration', 'comparison',
    -- CONTEXT: a resource, tool or technology named in passing.
    'reference'
  ));

-- The same widening for a faculty verdict, which may recategorise an item.
alter table public.candidate_reviews
  drop constraint if exists candidate_reviews_final_kind_check;

alter table public.candidate_reviews
  add constraint candidate_reviews_final_kind_check
  check (final_kind is null or final_kind in (
    'assignment', 'deadline', 'exam_scope', 'announcement', 'guidance',
    'lesson_scope', 'topic', 'definition', 'enumeration', 'comparison',
    'reference'
  ));

-- Ordering the review queue by time is the common read, and a 23-minute
-- lecture now yields ~30 candidates rather than one.
create index if not exists extraction_candidates_lecture_time_idx
  on public.extraction_candidates (lecture_id, evidence_start_ms);
