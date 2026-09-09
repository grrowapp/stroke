---
status: Doing
origin: agent
triage:
  - bug
change: fix-promote-name-conflict-withdrawal
tags:
  - proposal
  - specs
  - design
  - tasks
  - fix-promote-name-conflict-withdrawal/child-11
date: 2026-09-09
---

# fix-promote-name-conflict-withdrawal

`docs/specs/api/sessions/promote.md` を基準に、昇格（U14）の name-conflict 時に判断を取り下げてから 409 name-conflict を返すよう実装を合わせる。画面（`useProposalReview.ts`）が自分で判断を取り下げている補いを外す。docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示）から派生。Gitea issue [#11](http://192.168.1.202/gitea/grrowapp/stroke/issues/11) の内容を1本の子 change にしたもの。修正するファイル・各セクション・完了条件は issue の本文が持つ。

## 直すもの

- `server/api/strokes/[id]/promote.post.ts` — 占有の中の衝突確認で、判断を取り下げてから 409 を返す。改名・書き込みの失敗（500）は判断を残す
- `test/server/api/strokes/promote.post.test.ts` — 「判断はそのまま残る」→「取り下げてから 409」
- `app/composables/useProposalReview.ts` — `promote()` の 409 name-conflict 分岐の `DELETE …/approve` を外す
- specs の delta: `api/session/promote`（name-conflict のシナリオ追加）・`project/generation`（THEN に「判断を取り下げる」）

## 畳む方向

衝突する名前で昇格を要求すると 409 name-conflict が返り、その後の U2 応答に `decision` が無いこと。`yarn test`・`openspec validate --all` が通り、PR が `pre3` にマージされ、親が archive すること。
