---
status: Wait-for-archive
origin: agent
triage:
  - bug
change: fix-promote-name-conflict-withdrawal
tags:
  - proposal
  - specs
  - design
  - tasks
  - fix-promote-name-conflict-withdrawal/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
date: 2026-09-09
---

# fix-promote-name-conflict-withdrawal

`docs/specs/api/sessions/promote.md` を基準に、昇格（U14）の name-conflict 時に判断を取り下げてから 409 name-conflict を返すよう実装を合わせる。画面（`useProposalReview.ts`）が自分で判断を取り下げている補いを外す。docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示）から派生。Gitea issue [#11](http://192.168.1.202/gitea/grrowapp/stroke/issues/11) の内容を1本の子 change にしたもの。修正するファイル・各セクション・完了条件は issue の本文が持つ。

## 直すもの

- `server/api/strokes/[id]/promote.post.ts` — 占有の中の衝突確認で、判断を取り下げてから 409 を返す。改名・書き込みの失敗（500）は判断を残す
- `test/server/api/strokes/promote.post.test.ts` — 「判断はそのまま残る」→「取り下げてから 409」
- `test/server/utils/stroke/project.test.ts` — 衝突の 409 に理由の印（`data.reason`）が乗ることを実物に対して固定する
- `app/composables/useProposalReview.ts` — `promote()` の 409 name-conflict 分岐の `DELETE …/approve` を外す
- specs の delta: 2 capability × 各 2 Requirement。`api/session/promote`（「U14 …」に衝突時の取り下げと、取り下げの対象・例外を足す／「後始末は段ごとに閉じる」の「判断は残る」を条件付きへ）・`project/generation`（「昇格の直前に既存名との衝突を確認する」に取り下げの主体・対象・例外を足す／「昇格に失敗したら承認を確定させず…」の「判断もそのまま残る」を条件付きへ）。片方だけ直すと archive 後に spec 同士が矛盾する

## 畳む方向

衝突する名前で昇格を要求すると 409 name-conflict が返り、その後**セッションに記録された判断が無い**こと。**U2（`GET /api/strokes/:id`）は `phase`・`invocation`・`path` しか返さず `decision` を載せない**ので、確かめる先は `state.json` と、U10（`POST …/approve`）が重ねての判断で 409 phase を返さずに受理することである。`yarn test`・`openspec validate` が通り、PR が `pre3` にマージされ、親が archive すること。
