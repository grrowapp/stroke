## Why

<!-- Explain the motivation. What problem does this solve? Why now?
     State the evidence that the problem is real (observation, data, quotes).
     If there is no evidence, put it under Open Questions rather than asserting it. -->

## Who

<!-- The primary persona this is built for: Role, Context, Pain points, Current behaviour.
     Then the jobs they are hiring this for: what they are trying to get done, how they
     want to feel about it, and how they want to be seen.
     Describe only users you can describe concretely; mark anything unverified as an
     assumption. Neither the codebase nor a later artifact can recover this. -->

## Outcome

<!-- The measurable outcome this produces: metric + target
     (e.g., "time-to-notice drops from whenever-I-remember to the-moment-it-happens").
     An aspiration without a metric does not belong here. -->

## What Gets Built

<!-- Describe what will be built, in bullets. Be specific about capabilities.
     When this touches something that already exists, say so and mark breaking
     changes with **BREAKING**. -->

## Capabilities

<!-- What the project can do, one line each, in the user's terms rather than the
     implementation's. These become product.md's Key Features - name the capability,
     not the module that provides it. -->
- <capability>: <what it lets someone do>

## Out of Scope

<!-- What will NOT be built, and why. The project-level boundary, not the non-goals
     of a single increment. -->

## Principles & Constraints

<!-- The rules the project holds itself to, in three tiers:
     - MUST: non-negotiable. Security, legal and compliance, compatibility promises -
       the ones whose violation is a breaking change.
     - SHOULD: strong recommendations, overridable with a stated reason.
     - MAY: preferences and team conventions.
     One line each, written so a reader can tell whether a given change breaks it. -->

## Technology

<!-- What this is built on, written as decisions rather than an inventory. For each choice
     that had a real alternative: what was picked, what was turned down, and what made the
     difference. Concentrate on the ones that are expensive to walk back - what it runs on,
     where data lives, how the parts talk to each other, how it ships, how anyone can tell
     it is healthy - and give the numbers any of them must hit. Say plainly what is already
     known not to work.
     Growth is a precondition, not a footnote: where the kind of project makes it a real
     question, settle how the system is expected to grow before deciding the shape and the
     targets that hang off it, and ask the user rather than assuming. Where the kind of
     project makes it moot, leave growth out entirely - it is not a heading to leave empty.
     Dependencies below is what this waits on; this is what it is made of. -->

## Structure

<!-- How the code is cut up, and what holds the cuts in place. Where the boundaries sit,
     what each side owns, what may not cross, and the conventions that keep the result
     legible to someone who did not write it - down to how a single file is expected to
     read. Reasons, not a folder listing.
     Standing a project up, these are choices. On one that already exists, this is the
     arrangement as it actually is: read it from the code and say so. -->

## Risks

<!-- What could go wrong, and what would be done about it. One line per risk, paired with
     its mitigation. Project-level risks, not the hazards of a single task. -->

## Open Questions

<!-- Unresolved items carried forward, including anything Why could not evidence.
     A question whose answer would change Who, Outcome, Out of Scope, Principles &
     Constraints, Technology, or Structure is not an open question - resolve it now. -->

## Dependencies

<!-- What this stands on: external services and APIs, libraries and runtimes, existing
     assets it must interoperate with, infrastructure, other people's work it waits on.
     Where an existing system is involved, say what of it this touches. -->
