---
name: get-send-back
description: >-
  差し戻しの指摘一式を取得する。実行形: /get-send-back（引数なし）。詳細は /guidance を参照。
allowed-tools:
  - Bash(curl *)
  - Bash(printenv *)
---

```!
curl "$(printenv STROKE_BASEURL)/api/${CLAUDE_SESSION_ID}/send-back"
```

ユーザーが proposal を承認せず返した差し戻しの指摘一式だ（404 なら差し戻しは無い）。
対応方法は指摘を読んで自分で判断する。
確認したい事があれば `/question '<header>' '<detail>' '<question>' '<options>'` で問い返し、
直し終えたら `/proposal '<filepath>' '<projectName>'` で再提出する。
