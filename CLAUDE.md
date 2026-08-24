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

- `docs/session-workflow.md` — セッションのワークフロー定義（store・スキル・配線・実測で確定した制約）
- `docs/known-issues.md` — まだ change に起こしていない未解消事項
- `docs/question-flow.md` — 問いの往復（誰がいつ何を送り、状態がどう動くか）を図で示す
- `docs/schema.md` — 入れ物の形と検証の規定（長さ・件数の上限）
- `docs/stroke-modules.md` — stroke のモジュール（`useAgentQuestion` / `AgentQuestionModal`）の使い方
- `docs/next-agent-run.md` — エージェント実行の3区分への汎用化案（未着手）
