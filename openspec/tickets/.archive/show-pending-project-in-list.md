---
status: ready-for-agent
tags:
  - enhancement
---

# show-pending-project-in-list

承認の直後から、作られつつあるプロジェクトを一覧に出す。作り終わったこと・作りきれなかったことを、その場で知らせて次を選ばせる。

承認はプロジェクトを作る唯一の引き金であり、処理はセッションディレクトリをプロジェクト名へ改名するだけなので、**実体は承認した瞬間に存在している**。にもかかわらず一覧の母集合は `.spec-workflow/` を持つディレクトリに限られていて、それを作るのは承認後に裏で走る steering である。結果として、モーダルを閉じて一覧へ戻ったユーザーが見るのは、さっきまでと変わらない一覧になる。承認が通ったのか、名前が衝突したのか、裏の起動に失敗したのかを画面から区別する手段が無く、できるのは再読み込みを繰り返すことだけである。

## 触るもの

- 一覧の母集合と並び — `server/api/projects.get.ts` / `server/utils/control/directory.ts`
- 承認と、生成の進行の配信 — `server/api/strokes/[id]/approve.post.ts` / `server/utils/control/board.ts`
- 一覧の画面と、決着の知らせ方 — `app/pages/projects/index.vue` / `app/composables/useBoardSocket.ts`
- 削除の口 — 破棄のために `DELETE /api/projects/:projectId` を足し、既存のセッション削除を spec が規定する `DELETE /api/sessions/:id` に揃える
- WS の増やし方 — 配信のたびに endpoint を増やす形をやめ、既にある接続にメッセージ型を足す規約を置く
