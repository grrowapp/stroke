# Overview

Version: 1.0.0
Last Updated: [date]


## Purpose

> **Section Instructions:**
> This section provides a **one-paragraph overview** that any stakeholder can read in 30 seconds and understand what you're building, for whom, and why it matters. Write it first to force clarity, but refine it last after all other sections are complete.

> **Section Steps:**
> 1. **Name the solution**: What are you building?
> 2. **Name the user**: Who is it for?
> 3. **Name the problem**: What does it solve?
> 4. **Name the impact**: What measurable outcome will it produce?

**Format:** "We're building [solution] for [persona] to solve [problem], which will result in [impact]."

- [Write a one-paragraph executive summary *(e.g., "We're building a guided onboarding checklist for non-technical small business owners to solve the problem of 60% drop-off in the first 24 hours due to lack of guidance, which will increase activation rate from 40% to 60% and reduce churn by 10%.")*]

> **Before moving on next
> Review what you just wrote. The executive summary names a persona, a problem, and an impact. Check:
> - Does the **problem** you named have evidence behind it, or is it an 🔶 Assumption? If assumption, escalate it to an 🔵 Open Question.
> - Does the **persona** you named match a real customer segment you can describe in detail? If not, Target User Section will expose the gap — be ready for it.
> - Is the **impact** a measurable outcome or a vague aspiration? If vague, should explain to the name metric and a target.


## Target Users

> **Section Instructions:**
> This section identifies **who the product is for** — their responsibilities, pain points, and current behaviour. It ensures the team builds for a specific person, not an abstraction.

> **Section Steps:**
> 1. **Define the primary persona**: The person whose problem you are solving. Include their role, pain points, and current behaviour.
> 2. **Capture jobs-to-be-done**: What functional, emotional, and social jobs is the user trying to accomplish?

### Primary Persona

- **Role**: [Job title and responsibilities *(e.g., freelance consultant, solopreneur)*]
- **Context**: [Company size, tech savviness, relevant constraints *(e.g., 1-person business, no IT support, uses email and spreadsheets)*]
- **Pain points**: [What makes their current situation difficult *(e.g., overwhelmed by complex UIs, no time to watch tutorials, needs immediate value)*]
- **Current behaviour**: [How they handle the problem today *(e.g., signs up for products, tries for 1 day, churns if not immediately useful)*]

### Jobs-to-Be-Done

- **Functional job**: [What the user is trying to accomplish *(e.g., set up the product and complete a first meaningful task within 30 minutes)*]
- **Emotional job**: [How the user wants to feel *(e.g., confident that the product is worth the investment, not stupid for not figuring it out)*]
- **Social job**: [How the user wants to be perceived *(e.g., seen by their team as someone who picks good tools)*]

> **Before moving on next
> The persona and JTBD define who you're building for. Check:
> - Does the **persona's pain point** match the problem you stated in Purpose Section? If the persona's biggest frustration is something different from Purpose Section's problem, one of them is wrong.
> - Is the persona **a real customer of your product**, or did you accidentally describe your own team, your PM audience, or a generic archetype? The persona is the person who uses or buys the product — not the person writing this document.
> - Are the **jobs-to-be-done** grounded in observed behaviour or inferred? Tag any inferred JTBD as 🔶 Assumption.
 

## Solution Description

> **Section Instructions:**
> This section describes the **proposed solution at a high level** — enough for stakeholders to understand what the product will do and how it works, without prescribing UI details or implementation specifics. Keep it high-level. Let design own the UI.

> **Section Steps:**
> 1. **Write a solution description**: 2–3 paragraphs explaining what the product does and how.
> 2. **List key features**: The capabilities the solution provides.

- [Write a high-level description of what you're building and how it works *(e.g., "We're building a guided onboarding checklist that walks new users through core workflows step-by-step when they first log in. A modal appears on first login showing 3 steps: Create your first project, Invite a teammate (optional), Complete a sample task. As each step is completed, the checklist updates with checkmarks and a progress bar.")*]

### Key Features

- [Feature 1 *(e.g., "Minimal: Only 3 core steps — not overwhelming")*]
- [Feature 2 *(e.g., "Dismissible: Users can skip if they prefer to explore")*]
- [Feature 3 *(e.g., "Progress tracking: Visual progress bar showing 1/3, 2/3, 3/3")*]
- [Feature 4 *(e.g., "Celebration: Positive reinforcement modal on completion")*]

> **Before moving on next
> The solution overview describes what you're building. Check:
> - Does every **key feature** trace back to a pain point or a job-to-be-done in Target User Section? A feature that doesn't solve a stated problem is scope creep — move it to Section 8 (Out of Scope) or justify why it's here.
> - Is the solution **high-level enough** for this stage? If you've specified button labels, pixel dimensions, or implementation details, you've gone too far — pull back and let design own the UI.
> - Can you name a **metric that will move** if this solution works? If not, Section 6 will be difficult — and that's a signal the solution may not be focused enough.

## Project Principles

> **Section Instructions:**

> **Section Steps:**
> 1. **List Non-negotiable requirements【MUST Rules】**: security-critical constraints, legal/compliance requirements, and rules whose violation would be a breaking change.
> 2. **List Strong recommendations requirements【SHOULD Rules】**ː best practices and performance optimizations, overridable with a good reason
> 3. **List optional Guidelines【MAY Rules】**: Suggestions and preferences, nice-to-haves, team conventions, and flexible guidelines

-【Must rule 1 *(e.g., `[MUST] All API endpoints require authentication`) 】
-【Should rule 1 *(e.g., `[SHOULD] Functions should be under 50 lines`)】
-【May rule 1 *(e.g., `[MAY] Use TypeScript strict mode`)】


## Out of Scope

> **Section Instructions:**
> This section explicitly documents **what is excluded** from this initiative and why. Without it, scope creep is inevitable — stakeholders will assume features are included unless you say otherwise.

> **Section Steps:**
> 1. **List excluded features**: Name specific capabilities that are NOT part of this release.
> 2. **Explain the rationale**: For each exclusion, state why it's not included now.
> 3. **Flag future considerations**: Note which excluded items may be revisited in a later release.

### Not Included in This Release

- [Excluded feature + rationale *(e.g., "Advanced onboarding personalisation — different checklists per persona. Adds complexity; test the simple version first.")*]
- [Excluded feature + rationale *(e.g., "Video tutorials embedded in checklist. Resource-intensive; validate the checklist concept first.")*]
- [Excluded feature + rationale *(e.g., "Gamification — badges, points. Nice-to-have; focus on core workflow guidance.")*]

### Future Considerations

- [Items that may be revisited *(e.g., "Mobile-optimised onboarding — desktop-first for now, mobile in a future release.")*]

> **Before moving on next
> Out of scope defines what you're NOT building. Check:
> - Did stakeholders **actually ask for** any of the excluded items, or is this a preemptive list? The most valuable out-of-scope entries are the ones someone will be disappointed about — those need the strongest rationale.
> - Are any excluded items actually **dependencies in disguise**? If "mobile support" is out of scope but 40% of your persona's usage is mobile, that's a risk for Section 9, not just a scope boundary.
> - Does the out-of-scope list **match the solution overview** in Solution Description Section? Features mentioned in Solution Description Section should not also appear here. Features NOT mentioned in Solution Description Section but expected by stakeholders should appear here.


## Dependencies & Risks

> **Section Instructions:**
> This section identifies **dependencies** that must be in place before or during execution, and **risks** that could derail the initiative. For each risk, define a mitigation strategy.

> **Section Steps:**
> 1. **Map technical dependencies**: Platform upgrades, API changes, infrastructure requirements.
> 2. **Map external dependencies**: Third-party integrations, partnerships, vendor timelines.
> 3. **Map team dependencies**: Design handoffs, data pipeline work, cross-team coordination.
> 4. **Identify risks**: What could go wrong? Consider value, usability, feasibility, and viability risks.
> 5. **Define mitigations**: For each risk, state a specific, actionable mitigation strategy.

### Dependencies

- **Technical**: [Platform or infrastructure requirements *(e.g., no technical dependencies — uses existing modals framework)*]
- **External**: [Third-party integrations or partnerships *(e.g., analytics provider must support custom event tracking for checklist interactions)*]
- **Team**: [Cross-team handoffs *(e.g., design: wireframes for checklist UI, ETA Week 1)*]

### Risks & Mitigations

- **Risk**: [What could go wrong *(e.g., users dismiss the checklist immediately and never see it)*]
  - **Mitigation**: [How you'll address it *(e.g., track dismissal rate; if >50%, iterate on messaging or timing)*]
- **Risk**: [What could go wrong *(e.g., checklist steps are too generic and don't resonate with all personas)*]
  - **Mitigation**: [How you'll address it *(e.g., start with primary persona, personalise later based on usage data)*]

> **Before moving on next
> Dependencies and risks surface what could block or derail you. Check:
> - Have you accounted for **all four of Cagan's risks** — value (will customers want this?), usability (can they use it?), feasibility (can we build it?), and viability (does the business case hold)? Most PRDs overweight feasibility and underweight value risk.
> - For each risk, is the **mitigation actionable** — with an owner and a trigger? "Monitor closely" is not a mitigation strategy.
> - Do any of your 🔶 Assumptions from earlier sections appear here as risks? They should — an unvalidated assumption IS a risk. If they don't appear, either the assumption is low-stakes (fine) or you've lost track of it (not fine).


## Open Questions

> **Section Instructions:**
> This section captures **unresolved decisions** and **areas requiring further discovery**. Every PRD has open questions — documenting them is a sign of intellectual honesty, not incompleteness. The goal is to make the unknowns visible so they can be resolved deliberately, not accidentally.

> **Section Steps:**
> 1. **List unresolved decisions**: Questions that need answers before or during development.
> 2. **Assign owners**: Who is responsible for resolving each question?
> 3. **Set deadlines**: When must each question be answered to avoid blocking development?

| Question | Owner | Deadline | Status |
|----------|-------|----------|--------|
| [Unresolved question *(e.g., should the checklist be mandatory or optional?)*] | [Name] | [Date] | [Open / Resolved] |
| [Unresolved question *(e.g., should we A/B test checklist vs. no checklist?)*] | [Name] | [Date] | [Open / Resolved] |
| [Unresolved question *(e.g., what happens if the user completes steps out of order?)*] | [Name] | [Date] | [Open / Resolved] |


## Changelog

### 1.0.0 - [date]
- 
```
