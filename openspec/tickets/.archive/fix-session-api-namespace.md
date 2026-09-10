---
status: Wait-for-archive
origin: agent
triage:
  - bug
change: fix-session-api-namespace
date: 2026-09-09
tags:
  - proposal
  - specs
  - design
  - tasks
  - fix-session-api-namespace/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
---

# fix-session-api-namespace

`docs/specs/api/overview.md` を基準に、セッションの endpoint（`docs/specs/api/contract.md` の `U1`〜`U15`）と WS の `W1` / `W2` を `/api/strokes/` から `/api/sessions/` へ移設する。handler は #13 で `index.<method>.ts` に揃っているので、移動はディレクトリ単位の `git mv` で済む。画面・サーバ内の参照・テスト・E2E・`wsPathPattern`・`useAgentQuestion` の基底・`.claude/settings.json`・spec `server/session-management`・関連 docs 4 ページを追随させる。基準の docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示）から派生。Gitea issue [#17](http://192.168.1.202/gitea/grrowapp/stroke/issues/17) の内容を1本の子 change にしたもの。移動表・参照の一覧・完了条件は issue の本文が持つ。旧 ticket `fix-session-api-path`・`fix-agent-question-api-path` をこの change に吸収する（親 change design.md「旧 ticket の吸収」）。

関連 docs 4 ページの書き換えはユーザー承認済み（2026-09-09、1 ページずつ確認）:

- `docs/specs/structure/system-structure.md` — §1 `routes/` の行と §4 「セッション系（`/api/strokes/**`）」の 2 箇所
- `docs/specs/architecture/session-workflow.md` — 「畳み方」の 1 行（`GET /api/sessions`・`DELETE /api/sessions/:id`）
- `docs/specs/core/settings-reference.md` — `wsPathPattern` 既定値の 1 箇所
- `docs/specs/structure/file-composables.md` — `useWaitingRetry`・`useSessionChannel`・`useAgentQuestion` の 5 箇所

## 畳む方向

`grep -rn "api/strokes" app server shared test .claude` に残るのがエージェントが叩く endpoint と MCP tools だけで、問い返しの回答送信（`useAgentQuestion`）が 404 にならず、`yarn test`・`yarn test:e2e`・`openspec validate --all` が通ること。PR が `pre3` にマージされ、親が archive すること。旧 ticket 2 本が `.archive/` へ移り、README だけの change ディレクトリが消えていること。
