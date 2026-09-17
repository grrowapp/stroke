---
status: Planning
change: update-screen-flow-responsibility
origin: user
tags:
  - proposal
  - specs
  - design
  - tasks
---

# update-screen-flow-responsibility

`/` を開くと `/projects` へ自動で遷移する実装が、ユーザーの指示も承認も無いまま入っていた。URL と画面の責務範囲を切り分け直し、画面遷移の設計を docs へ書き出す。

## 事実

起票時点で分かっていること。

- `/` を開くと `/projects` へ勝手に遷移する状態が、許可なく実装として入っていた
- 画面と URL の責務範囲を書いた資料が無い。`docs/specs/plan/portal-stroke-entrance.md` / `portal-stroke-exit.md` は入口と出口の接合を個別に扱うだけで、どの URL が何を担うかの全体像を持たない
- 現状の `app/pages/index.vue`（`/`）は通知画面。`app/pages/projects/index.vue`（`/projects`）がプロジェクト一覧、`app/pages/strokes/index.vue`（`/strokes`）が概要入力
- `app/pages/projects/index.vue` の作成ボタンは `navigateTo('/strokes')`

## ユーザーが確定させたこと

- `/` は **AI との応対画面**（stroke 初期画面）
- `/` の中身は **作成ボタン押下の飛び先と同じ**。違うのは Nuxt の page routing 上のパス指定だけ
- `/projects` はプロジェクト画面
- 画面遷移の設計を docs へ書き出す
- `CLAUDE.md` へ「画面遷移・操作アクションの独断変更禁止」を絶対禁止事項として入れる（実施済み。根拠は `docs/adr/0025-no-unilateral-navigation-changes.md`）

## 未決

- 通知画面の移設先 URL。`/` を stroke 初期画面が占めるため、通知はどこかへ移る必要がある。design.md でユーザーへ提案する
