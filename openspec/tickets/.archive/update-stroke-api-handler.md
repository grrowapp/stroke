---
status: Wait-for-archive
origin: agent
triage:
  - enhancement
change: update-stroke-api-handler
date: 2026-09-09
tags:
  - proposal
  - specs
  - design
  - tasks
  - update-stroke-api-handler/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
---

# update-stroke-api-handler

capability `server/api-handler`（`update-session-api-handler` が新設）を、**エージェントが叩く endpoint（A1・A4・A5・A7・A8）と WS 配信（W1・W2）**に適用する。api と route は HTTP・WS 固有の準備と後始末だけを持ち、実処理は `server/handler/` に切り出す。URL・入出力・挙動・配信の順序は変えない。docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示 2026-09-08「api は handler を持つ、REST コール受付のインターフェースとする」）から派生。Gitea issue [#18](http://192.168.1.202/gitea/grrowapp/stroke/issues/18) の内容を1本の子 change にしたもの。現状の判定・修正するファイル・完了条件は issue の本文が持つ。物差しは `openspec/specs/server/api-handler`（新しい capability は作らない）。

## 直すもの

- `server/api/strokes/[id]/{overview,send-back,question,proposal,submission}/index.<method>.ts` の 5 本
- `server/routes/api/sessions/[id]/ws/{question,proposal}.ts` の 2 本。接続時配信の判定（phase と現在分の読み出し）を handler へ出し、route は register / send / unregister だけにする
- A7 の順序（残す → phase を進める → W2 配信）は handler が守る。A5 の 400 の文言（`問いの構造として読み取れない。`）は契約と既存テストが見ているので変えない
- 実処理のテストを `test/server/handler/` へ寄せ、api のテストは返し方だけにする

## 畳む方向

`server/api/strokes/**` と WS route が capability `server/api-handler` の Scenario を満たし、`yarn test`・`yarn test:e2e` が通って W1 / W2 の接続時配信と A7 の順序が変わらないこと。PR が `pre3` にマージされ、親が archive すること。
