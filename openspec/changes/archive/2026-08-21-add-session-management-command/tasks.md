# add-session-management-command — Tasks

## 1. 通し実測

- [x] 1.1 空ディレクトリで `openspec init --tools none` → `config.yaml` を `schema: flontier-strokeflow` で上書き → `openspec new change <uuid>`（cwd = そのディレクトリ・store 無し）→ `openspec instructions`（同 cwd）が通ることを通しで確認する
- [x] 1.2 同じ環境で `openspec status --change draft-proposal --json` の `applyRequires` を確認する。空で ff スキルが artifacts 作成に進めない場合は、`flontier-strokeflow` の schema.yaml に `apply.requires: [proposal]` を足す（実測: `["stroke","proposal"]` で空でなく、修正不要）
- [x] 1.3 登録簿に別ワークツリーを指す登録が残ったままでも、上記が登録簿を参照せず成立することを確認する（workflow-definition の残置登録シナリオ）
- [x] 1.4 実測結果を `docs/session-workflow.md` の「実測で確定していること」に版数つきで反映する

## 2. 設定と core の切り出し

- [x] 2.1 `server/utils/claude-config.ts` / `nuxt.config.ts`: `storeId` と `opsxCommand` を削除し、`workflowSchema`（既定 `flontier-strokeflow`、`NUXT_CLAUDE_WORKFLOW_SCHEMA` で上書き）を追加する
- [x] 2.2 `server/utils/session-core.ts` を新設し、セッションの作成・削除・列挙の実体を置く。`useRuntimeConfig` / `createError` に依存しない形（値は引数、失敗は種別を持つ Error）にする
- [x] 2.3 `server/utils/session-store.ts` と既存 endpoint を core 経由に組み替える（外から見える挙動は変えない）

## 3. セッション作成の配線

- [x] 3.1 `server/utils/openspec.ts`: change 作成の実行を廃し、「`init --tools none` → `config.yaml` 上書き」（cwd = セッションディレクトリ）に置き換える。途中で失敗したら作りかけのセッションディレクトリごと消して失敗を返す
- [x] 3.2 `server/utils/prompt.ts` `firstPrompt`: 固定文言（`/openspec-ff-change draft-proposal` — change 名はスキルの引数で渡す・スキルの指示に従って作業を実施する）に変更し、store の一文と `opsxCommand` 参照を外す

## 4. 削除と一覧

- [x] 4.1 core にセッション削除を実装する。存在検査 → `fs-extra` の `remove(sessionDir)`。存在しない id は何も消さず失敗。`fs-extra` を dependencies に追加する
- [x] 4.2 core にセッション列挙（`{ id, phase, updatedAt }`、`updatedAt` は `state.json` の mtime）を実装する
- [x] 4.3 `server/api/[id]/delete.post.ts`: 削除 endpoint。`running.ts` が実行中を示すときは busy（409）で拒否する
- [x] 4.4 `server/api/sessions.get.ts`: 一覧 endpoint
- [x] 4.5 `docs/api-contract.md` に削除と一覧を追記する

## 5. script

- [x] 5.1 `tsx` を devDependencies に追加し、`package.json` に `"session": "tsx scripts/session.ts"` を登録する
- [x] 5.2 `scripts/session.ts` に create（概要必須）/ delete / list を実装する。core を呼び、schema 名は「`NUXT_CLAUDE_WORKFLOW_SCHEMA` → 既定」で解決する。delete は `state.json` の `invocation: running` なら拒否する
- [x] 5.3 サーバを止めた状態で `yarn session create / list / delete` の成立を確認する（tools/session-cli の各シナリオ）

## 6. 撤去と docs

- [x] 6.1 `workflow/` を撤去する
- [x] 6.2 リポジトリ内に `--store` / `storeId` / `opsxCommand` / `store register` への参照が残っていないことを検索で確認する（openspec/changes 配下の記録は除く）
- [x] 6.3 `docs/session-workflow.md` を新構成（セッション自前 root・user レベル schema・登録不要・畳み方の手順）で書き直す
- [x] 6.4 `README.md`: 登録手順を外し、`~/.local/share/openspec/schemas/` への schema 配置手順と `yarn session` の使い方を書く

## 7. 検証

- [x] 7.1 `yarn check`（typecheck / `openspec validate --all`）が通る
- [x] 7.2 store が1つも登録されていない状態で dev サーバー（port 3001）からセッションを作成し、init・初回呼び出し（ff スキルによる change 作成）・ストロークの成立を通しで確認する（workflow-definition の登録なしシナリオ）
- [x] 7.3 endpoint 経由で一覧 → 削除 → 何も残らないことを確認する（api/session の各シナリオ。実行中の削除拒否を含む）
- [x] 7.4 user レベル schema の template を編集し、次回の呼び出しから反映されることを確認する（workflow-definition の既存要件）
