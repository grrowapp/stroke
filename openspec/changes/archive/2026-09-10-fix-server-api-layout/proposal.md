## Why

`docs/specs/api/` の規定（`overview.md` の名前空間・`server.md` の置き方・`sessions/promote.md` の挙動）と `server/api/` の実装が食い違ったまま残っている。`connect-portal-and-strokes`（2026-08-26 archive）の移設タスクが未チェックのまま archive され、以後の change が「別 ticket が直す」と書いて先送りしてきたためで、放置すると新しい endpoint がどちらの形に倣うべきか定まらない。docs は規範の正（`docs/agents/issue-tracker.md`「各層の性質」）であり、実装を docs に合わせる。

あわせて、ユーザーの決定（2026-09-08）で判定を1つ足す——**api は REST コール受付のインターフェースであり、handler を持つ。** 実処理は `server/handler/` に切り出し、共通化した実処理を handler の名で統一する（`projects/delete.md`「実装の共有」が先例）。

## What Changes

この change は**親**である。作業は Gitea の issue 8 本（親 #14。grrowapp/stroke）に分解済みで、issue ごとに子 change を切り、1 issue の解消を tasks の1区切りとして最後まで実行する。子 change は change 名のブランチ（worktree）で作業し、完了時に `pre3` へ PR を出してマージする。最後に `pre3` から親ブランチへの PR を出して終える。

| Gitea | 子 change | 内容 | 依存 |
| --- | --- | --- | --- |
| #10 | `fix-api-contract-path-drift` | `docs/specs/api/contract.md`「各 endpoint の入出力」の U 系・W1/W2 の見出し 8 本を `overview.md` の `/api/sessions/…` に追従させる | なし |
| #11 | `fix-promote-name-conflict-withdrawal` | U14 の name-conflict で判断を取り下げてから 409 を返す。画面（`useProposalReview`）が自分で取り下げている補いを外す。spec delta 2 本 | なし |
| #12 | `fix-project-api-layout` | プロジェクト系 handler 9 本を `index.<method>.ts` に（URL 不変）。`server.md` の置き方を capability として新設。`spec-screen-flow.md` の位置表を追随 | なし |
| #13 | `fix-session-api-layout` | セッション系 handler 13 本を `index.<method>.ts` に（URL 不変）。テストの写しを追随 | #11 |
| #17 | `fix-session-api-namespace` | セッション系 U 系と W1/W2 を `/api/sessions/` へ移設（ディレクトリ単位の `git mv`）。画面・サーバ内参照・テスト・E2E・`wsPathPattern`・`useAgentQuestion` の基底・`.claude/settings.json`・spec `server/session-management`・関連 docs 4 ページ。旧 ticket `fix-session-api-path`・`fix-agent-question-api-path` を吸収 | #13 |
| #15 | `update-session-api-handler` | U 系 11 本の api を「読む → handler を呼ぶ → 返す」の薄い層にし、実処理を `server/handler/` へ。`session-core` を handler に統一。物差しの capability を新設。`system-structure.md`・`server-structure.md` を追随 | #17 |
| #18 | `update-stroke-api-handler` | A 系 5 本と WS route 2 本の実処理を `server/handler/` へ | #15 |
| #19 | `update-project-api-handler` | プロジェクト系 api 5 本の実処理を `server/handler/` へ。`toHttp` を1つに | #15・#12 |

- **BREAKING**（#17）: セッション系の endpoint の URL が `/api/strokes/…` から `/api/sessions/…` に変わる。旧 path の互換は残さない（`connect-portal-and-strokes` 7.1 の決め）。呼び手は画面・サーバ内・E2E のみで、すべて同じ change で追随する。A 系（エージェント・MCP tools が叩く `/api/strokes/:id/…`）は変わらない
- 触らないもの: `docs/specs/api/overview.md`・`server.md`（基準）、`server/mcp/tools/*`、A 系の path、`docs/specs/plan/*`・`docs/adr/*`
- `docs/specs/api/` の外の docs は、各子 change がその対応に関係する「事実」のページに限って直す（design.md で提案し承認後）

## Capabilities

### New Capabilities

なし（親 change）。子 change が持つ:

- `server/api-layout`（候補名。#12）— `server.md` の置き方を Requirement + Scenario にした物差し
- `server/api-handler`（候補名。#15）— api は handler を呼ぶ薄いラッパーである物差し

### Modified Capabilities

なし（親 change）。子 change が持つ:

- `api/session/promote`・`project/generation`（#11）— name-conflict 時に判断を取り下げるシナリオ
- `server/session-management`（#17）— シナリオの path を `/api/sessions/…` に

この親 change 自身は spec の delta を持たないので `.openspec.yaml` に `skip_specs: true` を置く。

## Impact

- **コード**: `server/api/**`（24 本）・`server/routes/api/**`・`server/handler/`（新設 10 本前後）・`server/utils/stroke/{invoke,submission-path,ws-channels,session-core}.ts`・`server/plugins/01.*.ts`・`nuxt.config.ts`・`app/pages/strokes/**`・`app/composables/{useSessionChannel,useWaitingRetry,useProjectApi,useProposalReview,useAgentQuestion}.ts`・`.claude/settings.json`
- **テスト**: `test/server/api/**`（写しの構造が変わる）・`test/server/handler/`（新設）・`test/app/composables/useWaitingRetry.test.ts`・`test/server/utils/stroke/sweep.test.ts`・`test/server/middleware/mcp-token.test.ts`・E2E 5 本
- **docs**: `docs/specs/api/contract.md`（#10）、`docs/specs/structure/system-structure.md`・`server-structure.md`・`file-composables.md`、`docs/specs/architecture/session-workflow.md`・`spec-screen-flow.md`、`docs/specs/core/settings-reference.md`（各子 change の関連 docs）
- **openspec**: 子 change 8 本と ticket 8 本の起票・archive。旧 ticket 2 本の `.archive/` 移動と README だけの change ディレクトリの削除
- **運用**: 子 change ごとの worktree（`/home/vagrant/work/stroke-board/<change-id>`）と PR（base `pre3`）。Gitea issue のクローズ
- **外部**: 本家（spec-workflow）との仲介の URL・挙動は変わらない
