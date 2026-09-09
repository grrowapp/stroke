# fix-project-api-layout

## Why

`docs/specs/api/server.md` は「API Endpoint はディレクトリで表し、その Endpoint に対する HTTP Method の handler は `index.<method>.ts` として定義する」と定めている。プロジェクト系（本家仲介）の handler は 9 本が `<name>.<method>.ts` の形のまま残っており、規範と実装が食い違っている。

食い違いが残っている限り、新しい endpoint を足すときにどちらの形へ倣えばよいかが定まらない。`server/api/projects/` の中に既に両方の形が同居しており（`[projectId]/index.delete.ts` は規定どおり、`[projectId]/info.get.ts` は違う）、ファイルを見ても正が読み取れない。docs が規範の正である（`docs/agents/issue-tracker.md`「各層の性質」）以上、実装を docs に合わせる。

親 change は `fix-server-api-layout`。Gitea issue [#12](http://192.168.1.202/gitea/grrowapp/stroke/issues/12) の範囲を 1 本の子 change にしたもの。

## What Changes

- **変更**: プロジェクト系の handler 9 本を `index.<method>.ts` の置き方へ移す。`server/api/projects.get.ts` は `server/api/projects/index.get.ts` へ、`[projectId]/info.get.ts` は `[projectId]/info/index.get.ts` へ、というように Endpoint 名のディレクトリを1段作ってその中へ入れる
- **変更**: 1 段深くなる分、各 handler の相対 import（`../../../utils/…`）を 1 段増やす。`#shared` / `#imports` の alias は影響を受けない
- **追加**: `server.md` の置き方を Requirement + Scenario にした capability を新設する。この change と `fix-session-api-layout`（Gitea #13）の完了判定の物差しになる
- **変更**: `docs/specs/architecture/spec-screen-flow.md`「位置」の表のうち、本文 API の行が指すファイル名を移動後の path へ追随させる

**URL は変わらない。** Nuxt のファイルベースルーティングでは `foo.get.ts` と `foo/index.get.ts` が同じ Endpoint に対応する。入出力・本家との仲介ロジックも変えない。利用者から見える差は無い。

- 触らないもの: `docs/specs/api/overview.md`・`docs/specs/api/server.md`（基準）、`docs/specs/plan/artifact-extension-plan.md`・`docs/adr/`（当時の記録）、セッション系（`server/api/strokes/**`・`server/api/sessions/**`。Gitea #13 の範囲）
- 実処理の切り出し（`[action].post` / `projects/index.get` / `[document].put` / `[name].put` の中身を `server/handler/` へ）はこの change に含めない。Gitea #19（`update-project-api-handler`）に残す

## Capabilities

### New Capabilities

- `server/api-layout`: `server/api/` における API Endpoint と HTTP Method の置き方の物差し。Endpoint をディレクトリで表し root handler を `index.<method>.ts` とすること、同一 Endpoint の複数 Method を Method ごとの handler にすること、動的な Endpoint を `[param]/index.<method>.ts` とすること、そして移しても Endpoint の見え方（URL・入出力）が変わらないことを、機械的に判定できる形にする。正は `docs/specs/api/server.md` で、食い違ったら規範が勝つ

### Modified Capabilities

なし。既存 capability の Requirement は変わらない。

## Impact

- **コード**: `server/api/projects.get.ts` と `server/api/projects/[projectId]/**` の handler 9 本の移動、および各ファイル先頭の相対 import
- **テスト**: `test/server/api/projects/` は `server/api/projects/**` の構造の写しである（`docs/specs/structure/system-structure.md` §2）。移動する 9 本に対応する単体テストは現時点で 1 本も無く（`index.delete.test.ts`・`index.post.test.ts` はいずれも移動しない handler が対象）、写しの追随は不要である。`test/server/utils/upstream/read-only.test.ts` は `server/utils/upstream/` だけを走査するので影響しない
- **docs**: `docs/specs/architecture/spec-screen-flow.md`「位置」の本文 API の行（1 行）
- **openspec**: capability `server/api-layout` の新設
- **外部**: 本家（spec-workflow）との仲介の URL・挙動は変わらない。画面（`app/composables/useProjectApi.ts` ほか）は URL でしか handler を指していないので変わらない
