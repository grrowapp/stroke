---
name: proposal
description: >-
  proposal を提出する。実行形: /proposal '<filepath>' '<projectName>'。詳細は /guidance を参照。
arguments:
  - filepath
  - projectname
allowed-tools:
  - Bash(jq *)
  - Bash(curl -X POST *)
  - Bash(printenv *)
---

```!
jq -n -R '{proposal: ([inputs] | join("\n"))} + (if $ARGS.positional[0] == "" then {} else {projectName: $ARGS.positional[0]} end)' --args '$projectname' < '$filepath' | curl -X POST "$(printenv STROKE_BASEURL)/api/strokes/${CLAUDE_SESSION_ID}/proposal" -H 'Content-Type: application/json' --data-binary @-
```
