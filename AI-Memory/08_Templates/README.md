# Templates

Scaffolds reused across projects.

| Template | Location |
|---|---|
| Knowledge entry formats | `FORMATS.md` (this directory) |
| Project `.knowledge` scaffold | `../../Projects/_TEMPLATE/.knowledge/` |

The project scaffold lives under `Projects/_TEMPLATE/` rather than here so a new project is
a single `cp -r`. Treat it as the canonical template and improve it in place — every fix
propagates to all future projects.
