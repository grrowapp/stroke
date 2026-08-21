Create the design document that explains HOW to implement the change.

design.md is always written here: tech.md and structure.md are drawn from it, so
skipping it leaves them with no source. Go further than the minimum where any of
these apply:
- Cross-cutting change (multiple services/modules) or new architectural pattern
- New external dependency or significant data model changes
- Security, performance, or migration complexity
- Ambiguity that benefits from technical decisions before coding

Sections:
- **Context**: Only the current state and constraints needed to explain the approach. Reference the proposal for motivation instead of restating it (e.g., "See proposal.md - Why").
- **Goals / Non-Goals**: What this design achieves and explicitly excludes. Don't restate the proposal's scope - add only design-level boundaries.
- **Decisions**: Key technical choices with rationale (why X over Y?). Include alternatives considered for each decision.
- **Risks / Trade-offs**: Known limitations, things that could go wrong. Format: [Risk] → Mitigation
- **Migration Plan**: Steps to deploy, rollback strategy (if applicable)
- **Open Questions**: Unknowns that can safely be answered later without
  changing the proposal, the approach, or the task breakdown. Omit if none.

Open questions are for genuinely deferrable unknowns, not decisions you
skipped. If a question would change what gets built, the chosen approach, or
the task breakdown, resolve it now - ask the user instead of guessing.

Focus on architecture and approach, not line-by-line implementation.
The proposal covers why and what; design covers how. Reference the
proposal for motivation and for the capabilities - if a section would
only restate it, point to it instead.

Good design docs explain the "why" behind technical decisions. Take the stack, the layout, and the boundaries from interview.md - and the surfaces and flows from ui.md when it exists - rather than choosing them here. Where the interview left the layout or the conventions open, settle them here rather than leaving them to the implementation.

