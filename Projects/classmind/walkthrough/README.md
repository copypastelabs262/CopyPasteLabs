# Walkthrough working area — Stage A

Created at **step 0** of [`../.knowledge/walkthrough-protocol.md`](../.knowledge/walkthrough-protocol.md),
which is **pre-registered and FROZEN**. Nothing in this directory may add to, soften, or
reinterpret that document. If something here appears to conflict with it, the protocol wins and
the file here is a bug.

This directory holds **no criteria and no guidance**. It holds blank forms, a verbatim extract of
the one reference material annotators are permitted at step 3, and the places where output goes.

## Layout

```
walkthrough/
  00-selection.md                  step 1 output — the four lectures, URLs, durations
  annotator-packet/
    part7-glossary.md              verbatim extract of domain-model.md Part 7. The ONLY
                                   reference permitted at step 3
  transcripts/
    TEMPLATE-transcript.md         continuous prose + [mm:ss] markers
  annotations/
    TEMPLATE-annotation-sheet.csv  the 17 columns, exactly as the protocol specifies
    README.md                      file naming and column meanings. Mechanical only
  measures/
    TEMPLATE-agreement-worksheet.md   steps 4 and 7
  results/
    TEMPLATE-results.md            step 10 — observations, then interpretations, then decisions
```

## The one rule that is easy to break

**No annotation guide exists until step 5, and step 5 comes after step 4's numbers are computed.**

The whole design of steps 3–7 is a before/after measurement: extract without a guide, measure,
write the guide, extract again, measure again. The delta between those two numbers is what
criterion C3 reads. Anything that functions as a guide before step 3 — a worked example, a
decision rule, a "when in doubt, do X" — destroys the *before* number, and with it C3, and there
is no way to recover it afterwards. There is no second first-look.

This is also why annotators must not see each other's sheets before step 9, and why the protocol
puts them in separate rooms.

## Two things to settle before step 3, and to write down when you settle them

Neither is answered by the frozen protocol. Resolve them deliberately and record the answer in
`results/`, as an observation about the protocol rather than a change to it.

1. **Exactly which materials do the annotators hold at step 3?** The protocol says "no guide, no
   discussion. Domain model glossary (Part 7) available; nothing else." It also contains
   segmentation rules and a worked example, and the annotators cannot draw units at all without
   the definition of a unit. Decide whether "nothing else" excludes the protocol's own worked
   example. Note that the worked example is closer to a guide than the segmentation rules are.
2. **Who are the two annotators, and does either already know the domain model well?** Prior
   familiarity is not disqualifying, but it changes what the unguided number means and must be
   recorded alongside it.

## Related constraints, already recorded elsewhere

- Transcripts are served as **continuous prose with `[mm:ss]` markers, never as pre-cut utterance
  rows** — `../lab/v0-ingestion/README.md`. Pre-segmented rows would make both annotators anchor
  on ASR boundaries and inflate boundary agreement into the protocol's own suspicion trigger.
- Citations anchor to **time in the audio**, not to derived structure — `../.knowledge/capture-contract.md` Article 7.
- Public recordings only. The graded research dataset is a different thing and still needs
  consented recordings from a partner institution. Do not blur the two.
