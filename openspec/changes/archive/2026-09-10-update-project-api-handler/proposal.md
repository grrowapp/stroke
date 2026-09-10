## Why

親 change `fix-server-api-layout` の決め——**api は REST コール受付のインターフェースであり、実処理は `server/handler/` が持つ**——を、プロジェクトの endpoint に適用する。物差しは `update-session-api-handler` が新設した capability `server/api-handler` で、セッションの endpoint 11 本は既にその形になっている。

プロジェクトの endpoint（`server/api/projects/**` 13 本）はまだ元の形のままで、本家 spec-workflow の REST を api が直接呼び、`DELETE /api/projects/:projectId`（P1）は `projectId` から名前を引く走査と `DeleteError` の HTTP 化を自分の中に名前付き関数として持つ。後者は `update-session-api-handler` が `server/utils/stroke/conflict.ts` へ出した `deleteErrorToHttp` と同じ実装で、**同じ処理が 2 箇所にある**（capability「同じ実処理を 2 箇所に書かない」に反する）。

放置すると、同じディレクトリの中で GET と PUT が別の形を取る状態が残り、次に endpoint を足す人がどちらに倣うべきか定まらない。Gitea issue [#19](http://192.168.1.202/gitea/grrowapp/stroke/issues/19)。

## What Changes

- **`server/handler/` に 3 本足す** — `project-directory.ts`（一覧の合成・`projectId` から名前を引く走査・本家の 1 件の情報・本家への登録）・`project-approval.ts`（承認依頼の取得と応答）・`project-document.ts`（仕様書とステアリングの文書の取得と保存）
- **`server/api/projects/**` 13 本を「読む → handler を呼ぶ → 返す」の形にする** — 本家 REST の呼び出しを api から出す。api に残るのは入力の読み取りと検証・設定の解決・局面の述語・結果の HTTP 化だけ
- **P1 の `toHttp` を消し、`server/utils/stroke/conflict.ts` の `deleteErrorToHttp` を使う** — 同じ写しを 2 つ持たない
- **P1 の局面の述語（`DELETABLE`）は api に残す** — `docs/specs/api/projects/delete.md`「どの局面のものを許すかは各 endpoint が持つ」
- **実処理のテストを `test/server/handler/` に置く** — api のテストは返し方だけにする
- 変えないもの: URL・入出力・受理の条件・本家との仲介の挙動・`docs/specs/api/` 配下・`docs/` 全般

## Capabilities

### New Capabilities

なし。物差しは既存の `server/api-handler`（`update-session-api-handler` が新設）をそのまま使う。

### Modified Capabilities

なし。`server/api-handler` の Requirement は範囲を `server/api/` 全体に取っており、プロジェクトの endpoint を含むために書き換えを要さない。適用範囲が広がるだけで、受理の条件も応答も変わらない純粋な refactor なので、`.openspec.yaml` に `skip_specs: true` を置く。

## Impact

- **コード**: `server/handler/{project-directory,project-approval,project-document}.ts`（新設）・`server/api/projects/**`（13 本）・`server/utils/stroke/conflict.ts`（docblock の事実の更新のみ）
- **テスト**: `test/server/handler/{project-directory,project-approval}.test.ts`（新設）・`test/server/api/projects/**`（既存 2 本はそのまま通る見込み。本家の呼び出しは `utils/control/upstream-proxy` を差し替える形で、handler へ出しても同じ差し替えが効く）
- **docs**: 触らない。この change が新しく作る食い違いは design.md に「現状 → 追従後の案」として記録し、親へ引き継ぐ
- **外部**: 本家 spec-workflow との仲介の URL・挙動は変わらない。画面から見た応答も変わらない
