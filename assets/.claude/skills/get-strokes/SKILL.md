---
name: get-strokes
description: >-
  済んだストロークの記録を取得する。実行形: /get-strokes（引数なし）。詳細は /guidance を参照。
allowed-tools:
  - Bash(curl *)
  - Bash(printenv *)
---

```!
curl "$(printenv STROKE_BASEURL)/api/${CLAUDE_SESSION_ID}/strokes"
```

ここまでにユーザーと重ねたストロークの記録で、末尾が直前の回答だ。
**design tree** のどの枝が既に決まったかをここから読み取り、同じ事を二度聞かないこと。
まだ問えていない枝があれば `/question '<header>' '<detail>' '<question>' '<options>'` を実行する。
