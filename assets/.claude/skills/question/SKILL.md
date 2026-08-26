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
  - Bash(jq -n *)
  - Bash(curl -X POST *)
  - Bash(printenv *)
---

```!
jq -n '{header: $ARGS.positional[0], detail: $ARGS.positional[1], question: $ARGS.positional[2], options: ($ARGS.positional[3]|fromjson)}' --args '$header' '$detail' '$question' '$options' | curl -X POST "$(printenv STROKE_BASEURL)/api/strokes/${CLAUDE_SESSION_ID}/question" -H 'Content-Type: application/json' --data-binary @-
```
