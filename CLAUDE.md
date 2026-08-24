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

## Docs

`docs/specs/` は**定義としての specs** の置き場（要素で区分）。機能的 specs（Requirement + Scenario）は `openspec/specs/` にある。

### `docs/specs/core/`

- `structure.md` — ストローク側: 何をどこに置き、どう名付けるかの規則（領域名・区分・URL・置き場）
- `structure-design.md` — ポータル側: 層の積み方と部品の配置
- `schema.md` — 入れ物の形と検証の規定（長さ・件数の上限）
- `settings-reference.md` — ストローク側設定の**正**。ここに無いものは設定ではない（`docs/adr/0004-settings-reference-is-authoritative.md`）。編集には change とユーザー承認が要る。ポータル側の環境変数4件は未統合（README 参照）
- `file-component.md` — ポータル側: コンポーネント個別の props と参照元
- `file-components.md` — ストローク側: components の棚卸し
- `file-composables.md` — composable 一覧（ポータル側・ストローク側の2系統）

### `docs/specs/api/`

- `api-contract.md` — サーバ API の契約。画面・エージェントとサーバの境界

### `docs/specs/architecture/`

- `session-workflow.md` — セッションのワークフロー定義（store・スキル・配線・実測で確定した制約）
- `question-flow.md` — 問いの往復（誰がいつ何を送り、状態がどう動くか）を図で示す
- `spec-screen-flow.md` — ポータル側: 仕様書画面の流れ

### `docs/specs/reference/`

- `stroke-modules.md` — stroke のモジュール（`useAgentQuestion` / `AgentQuestionModal`）の使い方

### `docs/specs/plan/`

- `artifact-extension-plan.md` — 拡張 artifact の検討資料（未決定）
- `next-agent-run.md` — エージェント実行の3区分への汎用化案（未着手）
- `mainline-merge.md` — 旧 stroke-board-frontier 統合の道筋（change 一覧・依存・区分の基準・終了条件）
