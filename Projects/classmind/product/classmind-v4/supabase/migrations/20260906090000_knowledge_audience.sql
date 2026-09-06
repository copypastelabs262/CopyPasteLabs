-- WHO an obligation applies to, exactly as the lecturer stated it.
--
-- WRITTEN 2026-09-06. NOT APPLIED. Apply deliberately.
-- Until it is applied the code degrades rather than breaks: storeKnowledge
-- retries the insert without the optional columns and readKnowledge serves
-- audience as null, so Ask keeps naming the gap honestly.
--
-- WHY THIS EXISTS
--
-- The Robotics trial lecture names, in the transcript, exactly which students
-- the transformation assignment was for. The stored knowledge item could not
-- carry that fact because the reconstruction contract had no field for it, so
-- "who is this assignment for?" was unanswerable from stored knowledge BY
-- CONSTRUCTION -- a grounded Q&A system's quality ceiling is its extraction
-- contract (roadmap, 2026-09-02). The contract gains an `audience` field at
-- reconstruction v1.2.0; this column is where it lands.
--
-- Null means "the lecturer never said" OR "the item predates v1.2.0". The
-- distinction between those two lives in reconstruction_version, not here.
alter table public.knowledge_items add column audience text;

comment on column public.knowledge_items.audience is
  'Who the obligation applies to, verbatim from the lecturer (reconstruction v1.2.0+). Null: not stated, or the item predates the field.';
