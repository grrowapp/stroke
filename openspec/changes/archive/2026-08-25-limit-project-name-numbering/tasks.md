# Tasks

## 1. 事実確認

- [x] 1.1 `resolveAvailableProjectName()` の呼び出し元を全文検索し、定義以外に無いことを確かめる（`grep -rn` の結果は定義1件のみ）
- [x] 1.2 ループが有限回で終わることを確かめる（`existing` は `readdir()` の有限スナップショットで不変、生成名は相異なる → 遅くとも `|existing| + 2` 回で `return`）。「無限ループ」という起票時の前提は成立しない
- [x] 1.3 承認の配線を追い、A7 の候補提出 → 画面での編集 → U10 の確定 → 409 `name-conflict` の経路に採番が挟まらないことを確かめる
- [x] 1.4 `openspec/specs/` 全体を「採番 / 連番 / サフィックス」で検索し、対応する Requirement が存在しないことを確かめる（ヒット0件）

## 2. 削除

- [x] 2.1 `server/utils/stroke/project.ts` から `resolveAvailableProjectName()` を削除する
- [x] 2.2 同関数でのみ使っていた import を落とす（`node:fs/promises` の `readdir`、`./settings` の `resolveProjectsRoot`）
- [x] 2.3 衝突時の挙動（409 `name-conflict`）に手を入れていないことを確かめる

## 3. 検証

- [x] 3.1 `vitest run` — 10 files / 120 tests passed
- [x] 3.2 `nuxt typecheck` — エラーなし
- [x] 3.3 `playwright test` — 149 passed

## 4. 後始末

- [x] 4.1 `specs/project-generation/spec.md` を削除する（delta が出ないため）
- [x] 4.2 delta 無しを宣言する。`.openspec.yaml` は `Edit(/openspec/changes/**/.openspec.yaml)` が deny で触れないため、`openspec archive --skip-specs` で同じ結果を得た（`.openspec.yaml` の `note` は起票時の旧前提のまま残っている）
