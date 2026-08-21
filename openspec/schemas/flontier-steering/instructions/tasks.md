Create the task list that breaks down the implementation work.

Before writing tasks, check design.md for Open Questions. If any of them
would change what gets built, resolve them with the user first - do not
bake an unstated assumption into the task list.

**IMPORTANT: Follow the template below exactly.** The apply phase parses
checkbox format to track progress. Tasks not using `- [ ]` won't be tracked.

Guidelines:
- Group related tasks under ## numbered headings
- Each task MUST be a checkbox: `- [ ] X.Y Task description`
- Tasks should be small enough to complete in one session
- Order tasks by dependency (what must be done first?)

Example:
```
## 1. Setup

- [ ] 1.1 Create new module structure
- [ ] 1.2 Add dependencies to package.json

## 2. Core Implementation

- [ ] 2.1 Implement data export function
- [ ] 2.2 Add CSV formatting utilities
```

Reference the proposal for what needs to be built, design for how to build it.
Each task should be verifiable - you know when it's done.

## Steering

The steering documents are what this workflow exists to produce, so their tasks
lead the list - the implementation work follows from what they record, not the
other way round. Do not write product.md, tech.md, or structure.md by hand -
invoke the `write-steering` skill, one task per document, and let it own the
format and the approval it requires.

Where each document draws from:
- product.md - interview.md and the proposal; ui.md where there is a surface
- tech.md - design.md, plus the constraints the interview settled
- structure.md - design.md

Where the project already has steering documents, these tasks are updates, not
rewrites - name which sections change.

