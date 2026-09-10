---
status: Wait-for-archive
origin: agent
triage:
  - enhancement
change: update-session-api-handler
date: 2026-09-09
tags:
  - proposal
  - specs
  - design
  - tasks
  - update-session-api-handler/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
---

# update-session-api-handler

**api は REST コール受付のインターフェースであり、handler を持つ。** `server/api/sessions/**` のセッションの endpoint（U1〜U15）を、HTTP 固有の準備（パラメータ・本文の読み取りと検証、id の解決）と後始末（status・本文の返し方、エラーの HTTP 化）だけの薄い層にし、実処理を `server/handler/` に切り出す。共通化した実処理は handler の名で統一する（`core` / `service` / `util` と呼び分けない）。`server/utils/stroke/session-core.ts` を handler に取り込む。切り出しの物差しとなる capability を新設し、`docs/specs/structure/system-structure.md`・`server-structure.md` を追随させる。基準の docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示 2026-09-08「api は handler を持つ、REST コール受付のインターフェースとする」）から派生。Gitea issue [#15](http://192.168.1.202/gitea/grrowapp/stroke/issues/15) の内容を1本の子 change にしたもの。現状の判定・修正するファイル・完了条件は issue の本文が持つ。エージェントが叩く endpoint と WS route は #18、プロジェクトの endpoint は #19 が同じ判定で行う。

関連 docs の書き換え（`system-structure.md` §1 の構造に `server/handler/` を足す、§4 の api の説明、`server-structure.md` の棚卸しから `session-core` を外す）は、design.md で案を示し、親がユーザーの承認を 1 件ずつ取ってから反映する。

## 畳む方向

`server/api/sessions/**` の各ファイルが「読む → handler を呼ぶ → 返す」の形で実処理の関数を持たず（capability の Scenario）、`session-core.ts` が無く、`yarn test`・`yarn test:e2e` が通り E2E の応答が変わらないこと。PR が `pre3` にマージされ、親が archive すること。
