Create the proposal document that establishes WHY this change is needed.

Write this from interview.md. Do not re-open the interview.

product.md is drawn from this document: Who, Outcome, Out of Scope, and Constraints
land there. Write them so they hold for the project, not just for this pass.

Sections:
- **Why**: 1-2 sentences on the problem or opportunity. What problem does this solve? Why now? Name the evidence.
- **Who**: The primary persona - role, context, pain points, current behaviour. Mark unverified traits as assumptions; do not invent users.
- **Outcome**: The measurable outcome - metric plus target.
- **What Gets Built**: Bullet list of what will be built. Be specific about capabilities. Mark breaking changes with **BREAKING**.
- **Capabilities**: What the project can do, one line each, in the user's terms rather than the implementation's. These become product.md's Key Features, so name the capability, not the module that provides it.
- **Out of Scope**: What will not be built, and why. The project-level boundary.
- **Constraints**: Non-negotiable rules - security, legal, compatibility promises - plus fixed technical premises and why they were chosen over the alternatives.
- **Open Questions**: Unresolved items, including anything Why could not evidence. Omit if none.
- **Dependencies**: What this stands on - external services and APIs, libraries and runtimes, existing assets it must interoperate with, infrastructure, work it waits on.

This workflow writes no spec deltas, so each change sets `skip_specs: true` in its
`.openspec.yaml` - `openspec validate` rejects a zero-delta change without it.

Keep it concise (1-2 pages). Focus on the "why" not the "how" -
implementation details belong in design.md.

This is the foundation - design, tasks, and the steering documents all build on this.

