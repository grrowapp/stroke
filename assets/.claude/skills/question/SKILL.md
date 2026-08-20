---
name: question
description: >-
  ストロークの問いを提出する。実行形: /question '<header>' '<detail>' '<question>' '<options>'。
  引数の詳細と例は /guidance を参照。
arguments:
  - header
  - detail
  - question
  - options
allowed-tools:
  - Bash(jq *)
  - Bash(curl -X POST *)
  - Bash(printenv *)
---

```!
jq -n \
  --arg h '$header' \
  --arg d '$detail' \
  --arg q '$question' \
  --argjson o '$options' \
  '{header: $h, detail: $d, question: $q, options: $o}' \
| curl -X POST "$(printenv STROKE_BASEURL)/api/${CLAUDE_SESSION_ID}/question" -H 'Content-Type: application/json' --data-binary @-
```
