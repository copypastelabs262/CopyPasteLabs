# Projects

One directory per project. Every project contains a `.knowledge/` directory.

## Starting a new project

```bash
cp -r Projects/_TEMPLATE Projects/<new-project-name>
```

Then fill in `.knowledge/project.md` first — scope and the "why it exists" section before
any code. Add the project to the catalogue below.

`_TEMPLATE/` is the canonical scaffold. Improve it whenever a project reveals a gap;
that improvement then reaches every future project for free.

## Catalogue

| Project | Status | Started | Summary |
|---|---|---|---|
| `builderos` | Supporting | 2026-07-28 | The knowledge system itself, tracked as a project. Feature-frozen. |
| `classmind` | Building | 2026-07-29 | Extracts assignments, deadlines and exam topics from code-switched Indian lecture speech — the capstone product |

A project may add directories beside `.knowledge/` once it starts building. ClassMind splits
code into `lab/` (disposable experiments) and `product/` (production, gated) — see
`Projects/classmind/README.md`. That split is project-specific and deliberately **not** in
`_TEMPLATE/`; a second project has to prove it generalises first.
