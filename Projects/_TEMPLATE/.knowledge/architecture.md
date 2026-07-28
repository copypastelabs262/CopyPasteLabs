# Architecture — <Project Name>

- **Updated:**

## Overview
The system in one paragraph, then a text diagram.

```
[ client ] ──► [ api ] ──► [ store ]
```

## Components
### <Component>
- **Responsibility:** one sentence. If it needs "and", consider splitting it.
- **Depends on:**
- **Owns:** the data/state it is the single source of truth for.

## Boundaries
Where the seams are and why they were placed there. This is the part that is expensive to
change later — document the reasoning, not just the result.

## Data model
## External dependencies
| Service | Used for | Failure mode if unavailable |
|---|---|---|

## Known weaknesses
Honest list. Things we know are wrong but have chosen to live with, with the reason.
Links to `decisions.md` where applicable.
