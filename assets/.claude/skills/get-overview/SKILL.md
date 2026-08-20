---
name: get-overview
description: >-
  セッションの概要を取得する。実行形: /get-overview（引数なし）。詳細は /guidance を参照。
allowed-tools:
  - Bash(curl *)
  - Bash(printenv *)
---

```!
curl "$(printenv STROKE_BASEURL)/api/${CLAUDE_SESSION_ID}/overview"
```

何がしたいのか、どんな事を想像しているかをユーザー自身が語った初めの**design tree**だ。
理解が深まるまで何度も読み返し、聞いてない事を見つけたら `/question '<header>' '<detail>' '<question>' '<options>'` を実行する。
