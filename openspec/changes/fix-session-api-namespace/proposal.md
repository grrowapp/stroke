# fix-session-api-namespace

## Why

`docs/specs/api/overview.md` はセッション系の 11 本（U1〜U15）を `/api/sessions/…`、WS の W1 / W2 を `/api/sessions/:id/ws/…` と定め、エージェント向けの A 系 5 本だけを `/api/strokes/:id/…` に置いている。実装はこの名前空間の分けに追随しておらず、`/api/sessions/` に在るのは U11（`DELETE /api/sessions/:id`）と U15（`POST /api/sessions/:id/activate`）の 2 本だけで、残りの U 系 9 本と W1 / W2 は `/api/strokes/` に在る。docs が規範の正である（`docs/agents/issue-tracker.md`「各層の性質」）以上、実装を docs に合わせる。

移設は `connect-portal-and-strokes`（2026-08-26 archive）の tasks 7.1 / 7.2 / 7.6 に載っていたが、7.2 に当たる U11 だけが済んで残りは未チェックのまま archive された。以後の change は「別 ticket が直す」と書いて先送りしており（`server/utils/stroke/submission-path.ts` の docblock がその 1 例）、名前空間の分けが実装から読み取れない状態が続いている。

**同じ食い違いが 1 つのバグとして表に出ている。** `useAgentQuestion.ts` の API の基底が `/api/${sessionId}` で、セッションの名前空間そのものを落としている。問い返しの回答送信（U7）と、その直後の AI の起動要求（U13）がどちらも実在しない path を叩き、404 になる。他の composable が `/api/strokes/${id}` を組み立てているのに対しここだけが例外で、直し先は `overview.md` どおり `/api/sessions/${id}` である（旧 ticket `fix-agent-question-api-path`）。

直前の子 change `fix-session-api-layout`（Gitea [#13](http://192.168.1.202/gitea/grrowapp/stroke/issues/13)）で handler は Endpoint 名のディレクトリ + `index.<method>.ts` に揃っている。名前空間の移設はディレクトリ単位の `git mv` で済み、階層の深さが変わらないので相対 import は 1 行も動かない。残りは path の文字列の差し替えである。

親 change は `fix-server-api-layout`。Gitea issue [#17](http://192.168.1.202/gitea/grrowapp/stroke/issues/17) の範囲を 1 本の子 change にしたもので、旧 ticket `fix-session-api-path`・`fix-agent-question-api-path` を吸収する。

## What Changes

- **BREAKING**: セッション系 U 系 9 本の URL が `/api/strokes/…` から `/api/sessions/…` へ変わる。handler を `server/api/strokes/` から `server/api/sessions/` へディレクトリ単位で `git mv` する。`send-back` は POST（U9）だけを移し、GET（A4）は `server/api/strokes/[id]/send-back/index.get.ts` に残す。A 系 5 本（`overview` / `send-back` の GET / `question` / `proposal` / `submission`）は `/api/strokes/` のままである
- **BREAKING**: W1 / W2 の WS の URL が `/api/sessions/:id/ws/…` へ変わる。route を `server/routes/api/strokes/[id]/ws/` から `server/routes/api/sessions/[id]/ws/` へ移し、`nuxt.config.ts` の `wsPathPattern` の既定値を `/api/sessions/([^/]+)/ws/{channel}(?:$|[/?#])` にする
- **変更**: サーバ内から自分の endpoint を叩いている 5 箇所を追随させる。`server/utils/stroke/invoke.ts` の `invokePath`（U13）と一覧の取得（U12）、`server/plugins/01.reap-running.ts`・`01.activate-approved.ts`・`01.retry-failed.ts` の一覧の取得（U12）
- **変更**: 画面 8 本を追随させる。`app/pages/strokes/index.vue`・`[sessionId]/index.vue`・`[sessionId]/proposal.vue` と、`app/composables/useSessionChannel.ts`・`useWaitingRetry.ts`・`useProjectApi.ts`・`useProposalReview.ts`・`useAgentQuestion.ts`
- **修正**: `useAgentQuestion.ts` の基底を `/api/${sessionId}` から `/api/sessions/${sessionId}` にする。問い返しの回答送信と起動要求が 404 にならなくなる（旧 ticket `fix-agent-question-api-path` の吸収）。**この経路を通る自動テストが 1 本も無い**ので新しく足す（同 ticket の受け入れ条件）
- **変更**: U 系の単体テスト 7 本を `test/server/api/strokes/` から `test/server/api/sessions/` へ移し、`await import()` の path・`describe` の path の表記・docblock を追随させる。`test/server/api/sessions/activate/index.post.test.ts`（U15）は既に移動先の側に在るので動かさない
- **変更**: `test/server/api/sessions/index.delete.test.ts` を `test/server/api/sessions/[id]/index.delete.test.ts` へ移す。`fix-session-api-layout` からの申し送りで、この change で `server/api/sessions/index.get.ts`・`index.post.ts` が実在するようになるため、名前空間の直下に置いたままではどちらの handler を見ているのか読めなくなる
- **変更**: E2E 5 本（`stroke-exit` / `agent-question` / `proposal-annotation` / `proposal-persistence` / `ws-disconnect`）の U 系の path と W1 / W2 の URL。A5 / A7 / A8 の path は変えない
- **変更**: `test/app/composables/useWaitingRetry.test.ts`・`test/server/utils/stroke/sweep.test.ts`・`test/server/middleware/mcp-token.test.ts` の期待値
- **変更**: `.claude/settings.json` の `curl … /api/strokes` の許可行（U1 の疎通用）を `/api/sessions` に
- **変更**: `server/utils/stroke/submission-path.ts` の docblock から「別 ticket（fix-session-api-path）が直す」の 1 文を消す。この change がその ticket である。`submissionPath`（A8）と `activatePath`（U15）の返す path は変わらない
- **変更**: 関連 docs 4 ページ（`docs/specs/structure/system-structure.md`・`docs/specs/architecture/session-workflow.md`・`docs/specs/core/settings-reference.md`・`docs/specs/structure/file-composables.md`）を実装に追随させる。書き換え案は design.md「関連 docs 4 ページの書き換え案」。**ユーザー承認済み**（2026-09-09。ticket に箇所を列挙）

**旧 path の互換は残さない**（`connect-portal-and-strokes` 7.1 の決め。capability `server/api-layout`「移した後に旧 path を残そうとする」）。呼び手は画面・サーバ内・E2E だけで、すべてこの change で追随する。

- 触らないもの: `docs/specs/api/overview.md`・`docs/specs/api/server.md`（基準）、`docs/specs/api/sessions/*.md`・`ws/delivery.md`・`contract.md`（基準。既に `/api/sessions/` で書かれている）、`docs/specs/plan/*`・`docs/adr/*`（当時の記録）、`docs/specs/mcp/tools.md`（A 系で正しい）、`server/mcp/tools/*`（親 change「触らないもの」。A 系しか叩かない）、`server/api/projects/**`
- handler の中身を `server/handler/` へ切り出す整理は含めない。Gitea #15・#18 に残す
- 旧 ticket 2 本の `.archive/` への移動と、README だけの `openspec/changes/fix-agent-question-api-path/` の削除は親が行う（親 change design「旧 ticket の吸収」）

## Capabilities

### New Capabilities

なし。置き方の物差しは `server/api-layout` が既に持っており、この change はその「置き方を変えても Endpoint の見え方は変わらない」の対象外である——ここで変えるのは Endpoint の見え方そのもの（URL）で、規範（`docs/specs/api/overview.md`）が定める名前空間へ実装を寄せる作業だからである。

### Modified Capabilities

- `server/session-management` — 2 つの Scenario が実装の現状に合わせて `/api/strokes/:id/strokes`・`POST /api/strokes/:id/approve`・`POST /api/strokes`・`GET /api/strokes/:id/invoke-agent`・`GET /api/strokes` と書いている。`overview.md` の名前空間に合わせて `/api/sessions/…` へ直す。要件の中身（起動単位で文脈が混ざらないこと、token の無い呼び出しを拒否すること）は変えない

他の capability に U 系の path を書いた Scenario は無い（`api/session/*`・`agent/invocation`・`project/generation`・`ws/delivery` を確認）。

## Impact

- **コード**: `server/api/strokes/` の U 系 9 本を `server/api/sessions/` へ（ディレクトリ単位の `git mv`。相対 import は変わらない）、`server/routes/api/strokes/[id]/ws/` の 2 本を `server/routes/api/sessions/[id]/ws/` へ、`nuxt.config.ts` の `wsPathPattern`、`server/utils/stroke/{invoke,submission-path,ws-channels}.ts`、`server/plugins/01.{reap-running,activate-approved,retry-failed}.ts`、`app/pages/strokes/**` 3 本、`app/composables/**` 5 本
- **テスト**: `test/server/api/strokes/` の U 系 7 本を `test/server/api/sessions/` へ、`test/server/api/sessions/index.delete.test.ts` の階層合わせ、`useAgentQuestion` の経路を通る新しいテスト 1 本、`test/app/composables/useWaitingRetry.test.ts`・`test/server/utils/stroke/sweep.test.ts`・`test/server/middleware/mcp-token.test.ts`、E2E 5 本
- **設定**: `.claude/settings.json` の許可行 1 つ
- **docs**: `docs/specs/structure/system-structure.md`（2 箇所）・`docs/specs/architecture/session-workflow.md`（1 箇所）・`docs/specs/core/settings-reference.md`（1 箇所）・`docs/specs/structure/file-composables.md`（5 箇所）。いずれも承認済み
- **openspec**: `specs/server/session-management` の MODIFIED delta 1 本。ticket `fix-session-api-namespace` の `status` と `tags`
- **外部**: エージェント（`server/mcp/tools/**`）が叩く A 系と、本家（spec-workflow）との仲介（`/api/projects/**`）は変わらない。**`.claude/settings.json` の許可行のように、リポジトリの外に控えている手元の設定が旧 path を持っている可能性はある**——サーバに旧 path の handler は残らないので、そうした呼び出しは 404 になる
