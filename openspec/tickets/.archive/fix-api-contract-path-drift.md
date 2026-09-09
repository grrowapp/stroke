---
status: Wait-for-archive
origin: agent
triage:
  - bug
change: fix-api-contract-path-drift
date: 2026-09-09
tags:
  - proposal
  - design
  - tasks
  - fix-api-contract-path-drift/child-10
---

# fix-api-contract-path-drift

`docs/specs/api/overview.md` を基準に、`docs/specs/api/contract.md`「各 endpoint の入出力」の U 系・W1/W2 の見出し 8 本を `/api/sessions/…` に追従させる。スコープは `docs/specs/api/` 配下のみ。基準（`overview.md`・`server.md`）と実装には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示）から派生。Gitea issue [#10](http://192.168.1.202/gitea/grrowapp/stroke/issues/10) の内容を1本の子 change にしたもの。修正するページ・箇所・触らないものは issue の本文が持つ。

## 直すもの

- `contract.md` の見出し: U1 `POST /api/strokes` → `POST /api/sessions`、U2 `GET /api/strokes/:id` → `GET /api/sessions/:id`、U3 → `GET /api/sessions/:id/strokes`、U7 → `POST /api/sessions/:id/answer`、U9 → `POST /api/sessions/:id/send-back`、U12 → `GET /api/sessions`、W1 → `/api/sessions/:id/ws/question`、W2 → `/api/sessions/:id/ws/proposal`
- A1 / A4 / A5 / A7 / A8 と本文はそのまま
- docs の書き換えは design.md で案を示し、親がユーザーの承認を取ってから反映する

## 畳む方向

`grep -rn "api/strokes" docs/specs/api` に残るのが `overview.md` の `strokes/` の表と A 系、`contract.md` の A 系だけになり、PR が `pre3` にマージされ、親が archive すること。
