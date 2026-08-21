Interview the user and record it.

This workflow exists to produce the project's steering documents. This artifact is where
everything they need that the repository cannot answer gets settled. Later artifacts read
this file; they do not re-open it.

Start by reading, not asking:

- `.spec-workflow/steering/` - product.md, tech.md, structure.md. Whatever is there is the
  baseline, and the interview then covers only what this change moves.
- CONTEXT.md, CLAUDE.md, `docs/adr/`, and the code itself.

Then open with what you found:

- Where the repository has material, put your reading to the user and have them correct it.
  Do not ask them to recite what is already written down.
- Where it has nothing, ask which steering documents are to be written and for what - that
  answer sets the scope of everything after it, and the interview covers the whole project
  rather than a diff.

Record that opening exchange as the first entry, so the later artifacts know whether they
are describing a whole project or a change to one.

Only then run the rounds. Use the `grilling` and `domain-modeling` skills and follow them.
Put every question through the AskUserQuestion tool. Facts are yours to look up; the
decisions are the user's.

Do not defer a question to a later artifact - what goes unstated here gets invented
downstream. Mark what you could not verify as an assumption. Finish when the frontier is
empty, not when you have enough to start writing.
