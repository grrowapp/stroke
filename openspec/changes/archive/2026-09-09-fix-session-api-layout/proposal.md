# fix-session-api-layout

## Why

`docs/specs/api/server.md` は「API Endpoint はディレクトリで表現し、その Endpoint に対する HTTP Method の handler は `index.<method>.ts` として定義する」と定めている。セッション系の handler は 13 本が `<name>.<method>.ts` の形のまま残っており、規範と実装が食い違っている。

同じ食い違いをプロジェクト系について解消したのが直前の子 change `fix-project-api-layout`（Gitea [#12](http://192.168.1.202/gitea/grrowapp/stroke/issues/12)）で、`server/api/projects/**` は既にすべて `index.<method>.ts` である。残りはセッション系だけであり、この change でそれを畳むと `server/api/` 全体が規範の到達点に届く。届くまでは、新しい endpoint を足す人がどちらの形に倣えばよいかがファイルからは読み取れない。docs が規範の正である（`docs/agents/issue-tracker.md`「各層の性質」）以上、実装を docs に合わせる。

親 change は `fix-server-api-layout`。Gitea issue [#13](http://192.168.1.202/gitea/grrowapp/stroke/issues/13) の範囲を 1 本の子 change にしたもの。

## What Changes

- **変更**: セッション系の handler 13 本を `index.<method>.ts` の置き方へ移す。`server/api/strokes/[id]/answer.post.ts` は `server/api/strokes/[id]/answer/index.post.ts` へ、`server/api/sessions/[id]/activate.post.ts` は `server/api/sessions/[id]/activate/index.post.ts` へ、というように Endpoint 名のディレクトリを 1 段作ってその中へ入れる
- **変更**: 1 段深くなる分、移す 13 本の相対 import（`../../../utils/…`）を 1 段増やして `../../../../utils/…` にする。`#shared` の alias と外部パッケージの import は触らない
- **変更**: 移した handler を対象とする単体テスト 10 本を、写し元の構造に合わせて `test/server/api/strokes/<name>/index.<method>.test.ts` の形へ移す。各テストの `await import()` が指す handler の path と、`support.ts` を引く相対 path を追随させる
- **変更**: `test/server/api/projects/index.delete.test.ts` を `test/server/api/projects/[projectId]/index.delete.test.ts` へ移す。`fix-project-api-layout` からの申し送りで、写し元が `server/api/projects/[projectId]/index.delete.ts` であることをテストの位置に表す
- **変更**: `.spec-workflow/steering/structure.md` の server API ルートの命名例 1 行を、移動後の形へ直す。`fix-project-api-layout` からの申し送りで、`server/api/` 全体が新しい置き方に揃うこの change で直すことになっていた。これは親の実体（`/opt/projects/stroke-board/.spec-workflow/`）にあり、worktree からは見えないのでこの change の PR には載らない

**URL は変わらない。** Nuxt のファイルベースルーティングでは `foo.get.ts` と `foo/index.get.ts` が同じ Endpoint に解決される。入出力・handler の中身も変えない。利用者から見える差は無い。

- 触らないもの: `docs/specs/api/overview.md`・`docs/specs/api/server.md`（基準）、`docs/specs/plan/portal-stroke-exit.md`・`docs/adr/`（当時の記録）、`server/mcp/tools/*`（親 change「触らないもの」）、`scripts/stroke-check.ts`・`server/utils/stroke/*`（issue #13「修正するファイル」の外）、プロジェクト系の handler（`fix-project-api-layout` が済ませた）
- 名前空間の移設（`/api/strokes/` → `/api/sessions/`）はこの change に含めない。Gitea [#17](http://192.168.1.202/gitea/grrowapp/stroke/issues/17)（`fix-session-api-namespace`）に残す。ディレクトリ単位の移動は相対 import の深さを変えないので、ここで index 化しておけば #17 の移動は `git mv` だけで済む
- handler の中身を `server/handler/` へ切り出す整理も含めない。Gitea #15・#18 に残す

## Capabilities

### New Capabilities

なし。置き方の物差しは `fix-project-api-layout` が新設した `server/api-layout` が既に持っており、二重に作らない。

### Modified Capabilities

なし。`server/api-layout` の Requirement は `server/api/` 全体に掛かっており、この change はその到達点へ実装を近づけるだけで、要件そのものを書き換えない。「本要件を満たさない handler が現に残っていることは、本要件を無効にしない」という一文も、将来 `<name>.<method>.ts` が足された場合に効き続けるので消さない。

spec の delta を 1 つも持たないので、`.openspec.yaml` に `skip_specs: true` を置く。完了の判定は既存 capability `server/api-layout` の Scenario で行う。

## Impact

- **コード**: `server/api/strokes/[id]/**` の 12 本と `server/api/sessions/[id]/activate.post.ts` の移動、および各ファイル先頭の相対 import
- **テスト**: `test/server/api/strokes/**` の 9 本と `test/server/api/sessions/activate.post.test.ts` の 1 本（合わせて 10 本）の移動、`test/server/api/projects/index.delete.test.ts` の階層合わせ。いずれも `await import()` の path・`support.ts` の相対 path・冒頭の docblock が指す対象の path が追随する
- **docs**: 無し。issue #13 が「`docs/specs/api` 以外の関連 docs — 矛盾なし」と確かめており、セッション系の handler のファイル名を書いた「事実」のページは存在しない
- **steering**: `.spec-workflow/steering/structure.md` の server API ルートの命名例 1 行（親の実体。この change の PR の外）
- **openspec**: delta なし（`skip_specs: true`）。ticket `fix-session-api-layout` の `status` と `tags`
- **外部**: 画面（`app/composables/**`）・エージェント（`server/mcp/tools/**`）・本家（spec-workflow）はいずれも URL でしか handler を指していないので変わらない。WebSocket の route（`server/routes/api/strokes/[id]/ws/**`）は `server/api/` の外にあり、`server.md` の対象外なので触らない
