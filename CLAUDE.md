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

- `docs/structure.md` — 何をどこに置き、どう名付けるかの規則（領域名・区分・URL・置き場）
- `docs/session-workflow.md` — セッションのワークフロー定義（store・スキル・配線・実測で確定した制約）
- `docs/settings-reference.md` — 設定の**正**。ここに無いものは設定ではない（`docs/adr/0004-settings-reference-is-authoritative.md`）。編集には change とユーザー承認が要る
- `docs/mainline-merge.md` — `stroke-board` への統合の道筋（change 一覧・依存・区分の基準・終了条件）
- `docs/question-flow.md` — 問いの往復（誰がいつ何を送り、状態がどう動くか）を図で示す
- `docs/schema.md` — 入れ物の形と検証の規定（長さ・件数の上限）
- `docs/stroke-modules.md` — stroke のモジュール（`useAgentQuestion` / `AgentQuestionModal`）の使い方
- `docs/next-agent-run.md` — エージェント実行の3区分への汎用化案（未着手）
