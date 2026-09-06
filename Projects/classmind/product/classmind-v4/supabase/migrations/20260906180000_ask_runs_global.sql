-- GLOBAL ASKS IN THE METER.
--
-- WRITTEN 2026-09-06. APPLIED by the operator 2026-09-06 (verified live: 15+
-- ask_runs rows carry course_id NULL, which the pre-migration NOT NULL forbade).
-- The note below documents the fail-safe the code keeps on an unmigrated db.
-- Until it is applied the code degrades: a global ask still prints its meter
-- line to the server log, and the API response reports `meter: "unavailable"`
-- for global asks only -- course and lecture asks keep recording as before.
--
-- WHY: the Student Ask surface (scope 'global') answers across every subject
-- the student can access, so its meter rows belong to no single course.
-- course_id was NOT NULL because every ask used to arrive through a course
-- URL; that stops being true the moment the home page can ask. Null now means
-- exactly what null lecture_id has always meant one level up: "scoped wider
-- than this column".
alter table public.ask_runs alter column course_id drop not null;

comment on column public.ask_runs.course_id is
  'The course the ask was scoped to. Null = a global (whole-student) ask; set + null lecture_id = course-wide; set + set = lecture-scoped.';
