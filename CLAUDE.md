# CLAUDE.md

## Agent skills

### Issue tracker

Work is tracked as OpenSpec changes under `openspec/changes/<change-id>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Subagents

Use fresh agents, not `fork`, when the goal is to keep context out. See `docs/agents/subagents.md`.

## Dev サーバー

- 起動・ビルドなどの実行は **package.json の scripts 経由**（`yarn dev` / `yarn build` / `yarn test` …）で行う。`node .output/server/index.mjs` のような直接起動をしない
- ポートは **3399 固定**（`nuxt.config.ts` の `devServer.port`）。ストロークの `claude.apiBaseUrl` と揃えてあり、変えるときは必ず両方を揃えて変える（値の正は `docs/specs/core/settings-reference.md`）
- 3000 はこのマシンで別のプロセスが使用中。使わない
- E2E の PORT_SLOT（`playwright.config.ts`）で slot 3 は欠番。APP_PORT が 3399 と被るため（base3 は slot 6 = 5699/3699）

## Worktree 運用

- 合流点は各 worktree の**もとになった親ブランチ**。main を直接の合流点にしない
- 成果のマージ先・追随の取り込み元・ユーザー指示で扱う対象は、いずれもworktreeのブランチ
- 各 worktree は親ブランチに更新がはいっていた場合は、**取り込めるタイミングで自主的に** git rebase develop して追随する。親から worktree へ配ることはしない（作業途中の土台を動かさないため）
- 取り込みを先延ばしするほどコンフリクトが育つ。**小さく頻繁に**取り込むこと
- **main, develop へのマージ**は、ユーザー指示を受けてから確認→承認を一回踏んで行
- **change の実装（apply）はこの worktree のブランチ（例: `wt/base2`）へ直接コミットする。

## Docs

`docs/specs/` は**定義としての specs** の置き場（要素で区分）。機能的 specs（Requirement + Scenario）は `openspec/specs/` にある。

### `docs/specs/core/`

- `system-structure.md` — 構造の定義。統合後のあるべき配置の規範（ディレクトリ構造・画面とサーバーの区切り・共有型）
- `schema.md` — 入れ物の形と検証の規定（長さ・件数の上限）
- `settings-reference.md` — ストローク側設定の**正**。ここに無いものは設定ではない（`docs/adr/0004-settings-reference-is-authoritative.md`）。編集には change とユーザー承認が要る。ポータル側の環境変数4件は未統合（README 参照）
- `file-component.md` — ポータル側: コンポーネント個別の props と参照元
- `file-components.md` — ストローク側: components の棚卸し
- `file-composables.md` — composable 一覧（ポータル側・ストローク側の2系統）
- `server-structure.md` — server/utils の棚卸しと規範への対応

### `docs/specs/api/`

- `contract.md` — サーバ API の契約。画面・エージェントとサーバの境界

### `docs/feature/`

- `overview.md` — feature のワークフロー定義（`__` 命名・器・工程・締め。2レーンのうち feature レーンの正）

### `docs/specs/architecture/`

- `session-workflow.md` — セッションのワークフロー定義（store・スキル・配線・実測で確定した制約）
- `question-flow.md` — 問いの往復（誰がいつ何を送り、状態がどう動くか）を図で示す
- `spec-screen-flow.md` — ポータル側: 仕様書画面の流れ
- `data-fetching.md` — 画面のデータ取得と SSR の設計

### `docs/specs/reference/`

- `stroke-modules.md` — stroke のモジュール（`useAgentQuestion` / `AgentQuestionModal`）の使い方
- `upstream-observations.md` — 本家 spec-workflow-mcp をソースから調べた事実（WS メッセージ9種・接続の制約・反映までの遅延）。方針は ADR-0006、基準バージョンは ADR-0008

### `docs/specs/plan/`

- `artifact-extension-plan.md` — 拡張 artifact の検討資料（未決定）
- `portal-stroke-entrance.md` — 入口の接合の対応方法（作成ボタン→ストローク概要入力。ADR-0009/0010 の俯瞰）
- `portal-stroke-exit.md` — 出口の接合の対応方法（承認→steering 工程の自動開始。ADR-0011 の俯瞰）
- `composables-library-replacement.md` — composables のライブラリ置換と集約の可否（置換3・集約2→1・据置5。spec-workflow 承認済み）
- `components-library-replacement.md` — components のライブラリ置換・再編・markdown 統一の可否（置換5・部分置換3・再編2→1・削除1・据置8 + MDC 統一。spec-workflow 承認済み）
- `next-agent-run.md` — エージェント実行の3区分への汎用化案（未着手）
- `mainline-merge.md` — 旧 stroke-board-frontier 統合の道筋（change 一覧・依存・区分の基準・終了条件）
- `structure-migration.md` — 構造の規範に対する現状の差分（移行課題）
