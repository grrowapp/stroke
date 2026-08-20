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
jq -n \
  --rawfile p '$filepath' \
  --arg n '$projectname' \
  '{proposal: $p} + (if $n == "" then {} else {projectName: $n} end)' \
| curl -X POST "$(printenv STROKE_BASEURL)/api/${CLAUDE_SESSION_ID}/proposal" -H 'Content-Type: application/json' --data-binary @-
```
