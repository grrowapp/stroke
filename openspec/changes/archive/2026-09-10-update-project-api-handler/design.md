## Context

動機と範囲は proposal.md。ここは**何をどの粒度で `server/handler/` へ出すか**を決める。

現状（2026-09-09。`fix-project-api-layout` の移動と `update-session-api-handler` の切り出しが済んだ `pre3` の時点）:

- `server/api/projects/**` は 13 本・566 行。本家 REST を直接呼ぶのが 12 本（`upstreamClient()` 経由）、呼ばないのは P1（`[projectId]/index.delete.ts`）だけ
- 行数で目立つのは 4 本——承認への応答 POST が 126 行（うち 60 行が zod の schema）、一覧 GET が 70 行、P2（`index.post.ts`）が 74 行、仕様書の文書 PUT が 53 行、ステアリング PUT が 41 行。残る読み取りの GET 7 本は 10〜20 行
- P1 は api の中に実処理の名前付き関数を 2 つ持つ——`resolveName`（`projectId` から保存先を走査して名前を引く）と `toHttp`（`DeleteError` を 404 / 500 へ写す）
- `toHttp` は `update-session-api-handler` が `server/utils/stroke/conflict.ts` へ出した `deleteErrorToHttp` と同じ実装である。`conflict.ts` の docblock も「今の呼び手はセッションの削除だけで、寄せるのは Gitea #19」と書いてある
- `server/handler/` には既に 7 本（`activate` `answer` `approve` `delete` `invoke-agent` `promote` `session`）がある

制約:

- URL・入出力・受理の条件・本家との仲介の挙動・応答を変えない（親 change の非目標）
- 局面の述語は api が持つ（`docs/specs/api/projects/delete.md`「実装の共有」）
- `docs/` には触らない。食い違いが新しく生まれたら案として記録し、親へ渡す
- 既存の `server/handler/*.ts` と `server/utils/stroke/conflict.ts` の書き換えは、同時進行の子 change（`update-stroke-api-handler`）と衝突しうるので必要最小限にする

## Goals / Non-Goals

**Goals:**

- `server/api/projects/**` 13 本を「読む → handler を呼ぶ → 返す」の形にし、capability `server/api-handler` の走査（`writeState` / `rename` / `broadcast*` / 本家 REST が api に直接現れない）を通す
- `toHttp` を 1 つにする
- 本家との仲介の語彙を `server/handler/` に集め、次に endpoint を足す人が倣う形を 1 つにする

**Non-Goals:**

- `server/utils/upstream/`・`server/utils/control/` の切り直し。`upstreamClient()` と `toHttpError` の置き場は動かさない
- `server/api/sessions/**`（済み）・`server/api/strokes/**`・WS route（別の子 change）
- 受理の条件・応答・zod の schema の見直し
- 走査を機械で固定するテスト（`read-only.test.ts` のような形）の新設。範囲が `server/api/` 全体に及ぶので、プロジェクトだけに掛けると次の子 change で書き直すことになる。親へ引き継ぐ

## Decisions

### D1. 到達点は「本家 REST が api に現れないこと」——読み取りの GET も対象にする

capability `server/api-handler` の Requirement は、本家 REST の呼び出しを api の handler ファイルに直接書いてはならない（MUST NOT）とし、走査の Scenario も本家への呼び出しを名指ししている。`server/api/projects/**` の 12 本はすべて `upstreamClient().<操作>()` を自分の中で呼ぶので、**読み取りの GET 7 本と P2 も切り出しの対象に入れる**。

issue #19 の「現状の判定」表は読み取りの GET 7 本を「既に薄い」としているが、これは行数の観察であって到達点の定義ではない。同じ読み方は `update-session-api-handler` の design D1 が既に採っている（「表は現状の記述であって到達点の定義ではないため、到達点は capability の Scenario で置く」）。issue の完了条件も「`server/api/projects/**` が capability の Scenario を満たす」と範囲を配下全体に取っている。

capability には「既に薄い endpoint（id を解決する → 既存の 1 関数を呼ぶ → 結果を返す）は handler を新しく作る対象にならない」という Scenario もあり、字面だけを見れば読み取りの GET はこれに当たる。**2 つの Scenario がぶつかるので、Requirement の本文（MUST NOT の一覧）で決める**——`readState` は api が持ってよいものとして本文に名指しされている（「対象の状態を 1 度読む」）が、本家 REST は読み書きの区別なく MUST NOT の側に名指しされている。「既存の 1 関数」の免除は、MUST NOT の一覧に載っていない関数を呼ぶ場合に効く。

- 代替: issue の「修正するファイル」に挙がった 5 本だけを切り出す → 同じディレクトリ（`steering/[name]/`）の中で GET が本家を直接呼び、PUT が handler を呼ぶ状態が残る。次に endpoint を足す人がどちらに倣うか定まらず、それは親 change が直そうとしているものそのものである。却下
- 代償: 本家の 1 操作をそのまま渡すだけの handler が 8 本できる。**短いことと浅いことは違う**——ここでの境界は「本家と話すのは handler、HTTP と話すのは api」であり、仲介が短いのは仲介が短いからである。走査で機械的に判定できる状態を、判定の例外を作らずに得ることを採る
- この Scenario のぶつかりは capability を書き換えれば消えるが、**この change では書き換えない**。同じ capability を物差しにする子 change（`update-stroke-api-handler`）が同時に進んでおり、両方が MODIFIED の delta を出すと archive で衝突する。読み方をここに記録し、親へ引き継ぐ

### D2. handler の粒度と名前 — api のディレクトリの関心ごとに 1 本、計 3 本

`update-session-api-handler` の D2 は「呼び手が 1 つなら endpoint 単位、2 つ以上ならまとまり単位」で引いた。プロジェクトの endpoint はどれも呼び手が 1 つだが、endpoint 単位にすると 12 本のファイルが並び、その大半が 3 行になる。**同じ相手（本家の同じ資源）と話すものをまとめる**方へ寄せ、api のディレクトリの関心に合わせて 3 本にする。

| ファイル | 持つもの | 呼ぶ api |
| --- | --- | --- |
| `server/handler/project-directory.ts` | `listProjectDirectory`（走査・registry・昇格の記録・承認待ち件数の合成）・`resolveProjectName`（`projectId` から保存先の名前を引く走査）・`readProjectInfo`・`registerProject` | `index.get` `index.post` `[projectId]/index.delete` `[projectId]/info/index.get` |
| `server/handler/project-approval.ts` | `listPendingApprovals`・`getApprovalContent`・`respondToApproval` | `approvals/` 配下 3 本 |
| `server/handler/project-document.ts` | `listSpecs`・`getSpecDocuments`・`getTaskProgress`・`saveSpecDocument`・`getSteeringDocument`・`saveSteeringDocument` | `specs/` 配下 4 本・`steering/` 配下 2 本 |

名前の決め:

- **`project-` を接頭に置く。** `server/handler/approve.ts`（U10。承認の判断を `state.json` へ記録する）と `project-approval.ts`（本家 spec-workflow の承認依頼への応答）は別物である。`approval.ts` と並べると取り違える。`update-session-api-handler` の D2 が `invoke-agent.ts` と `invoke.ts` で同じ判断をしている
- `server/utils/stroke/project.ts`（昇格の改名）とも接頭で区別が付く
- **本家の 1 操作をそのまま渡す関数は、`UpstreamRestClient` のメソッド名をそのまま使う**（`listSpecs` など）。渡すだけのものに別の呼び名を付けると、同じ操作の名前が 2 つになる
- 代替: issue の候補名（`project-list.ts`・`approval-action.ts`・`resolve-project-name.ts`）→ `resolve-project-name.ts` は 1 関数のファイルになり、同じ保存先の直下を走査する `listProjectDirectory` と離れる。一覧の合成も名前の逆引きも「保存先の直下を走査して上層・本家の id と突き合わせる」1 つの関心なので、同じファイルに置く

### D3. handler が返すものは `UpstreamResult` のまま。HTTP 化は api が持つ

本家仲介の handler は `UpstreamRestClient` が返す `UpstreamResult<T>`（`{ ok: true, value }` / `{ ok: false, failure }`）をそのまま返し、api が `toHttpError(result.failure)` で写す。`UpstreamResult` は HTTP の型ではなく本家との往復の結果なので、handler が持ってよい。

これで応答は 1 文字も変わらない——写しているのは今と同じ `toHttpError` で、呼ぶ場所が api のままだからである。P2 が持つ「本家が 404 を返しても 503 にする」読み替えも api に残る（HTTP の決めであり、本家との往復の結果ではない）。

- 代替: handler が `createError` を投げる → handler が HTTP を知ることになり、capability に反する。却下（`update-session-api-handler` D4 と同じ判断）

### D4. 承認への応答の分け目 — 400 の検証は api、本家へ送る値の組み立ては handler

`approvals/[approvalId]/[action]/index.post.ts` の 126 行のうち、api に残すのは入力の読み取りと検証である（capability が api に許す 1 つ目）——zod の schema 2 つ、`isApprovalAction`、そして 4 つの 400（`unknown-approval-action`・`invalid-body`・`reject-needs-reason`・`annotations-need-revision`・`revision-needs-comments`）。

handler へ出すのは**本家へ送る値の組み立て**である——応答本文が空のときに既定文（`stroke-board から承認` など）を当てはめること、`annotations` と `comments` を本家が受け取る 1 つの引数へまとめること、そして本家 REST の呼び出し。これが issue の言う「詰め替え」に当たる。

```ts
respondToApproval(projectId, approvalId, action, { response, annotations, comments })
```

`DEFAULT_RESPONSE` は action ごとの literal だが、**局面（phase）の述語ではない**ので handler が持ってよい。capability が api に残せと言っているのは「どの局面のものを受理するか」であり、承認・却下・差し戻しは局面ではなく操作の種別である。

- 代替: 既定文の当てはめも api に残す → api に残るのが「本家へ渡す引数の完成形」になり、handler は引数を右から左へ渡すだけになる。仲介の中身が api に残るので却下

### D5. P1 の解き方 — 走査は handler、述語と写しは api

| P1 が今持つもの | 行き先 |
| --- | --- |
| `DELETABLE`（`['approved']`）と 409 の文言 | **api に残す**（`docs/specs/api/projects/delete.md`「どの局面のものを許すかは各 endpoint が持つ」） |
| `resolveName` | `server/handler/project-directory.ts` の `resolveProjectName(root, projectId)` |
| `toHttp` | **消す。** `server/utils/stroke/conflict.ts` の `deleteErrorToHttp` を呼ぶ |
| `readStrokeConfig` / `isRunning` / `readState` / `removeTarget` の呼び出し | api にそのまま残す（前 3 つは capability が api に許すもの、`removeTarget` は既存の handler の呼び出し） |

`resolveProjectName` は `server/utils/mcp/resolve-project-id.ts` の `resolveProjectId`（名前 → id を本家の一覧で引く）と向きが逆である。取り違えないよう docblock に書く。

`conflict.ts` へ入れる変更は docblock の 1 段落だけ——「今の呼び手はセッションの削除だけ」という事実が、この change で正しくなくなる。実装には触らない（同時進行の子 change との衝突を最小にする）。

### D6. テストの置き方

`test/` は写し元の構造をそのまま写す（`docs/specs/structure/system-structure.md` §2）。

- **既存の api のテスト 2 本はそのまま置く。** `test/server/api/projects/index.post.test.ts` は `server/utils/control/upstream-proxy` の `upstreamClient` を差し替えており、handler が同じモジュールを import するので差し替えは handler 越しにも効く。`test/server/api/projects/[projectId]/index.delete.test.ts` は実物のファイルシステムを使うので走査の移動に影響されない。どちらも見ているのは返し方（400 / 404 / 409 / 502 / 503 / 204）で、capability が api のテストに求めるものと一致する
- **足すのは実処理のテスト 2 本**——`test/server/handler/project-directory.test.ts`（`resolveProjectName` の走査と、`listProjectDirectory` の合成）と `test/server/handler/project-approval.test.ts`（既定文の当てはめと注釈の渡し方）。本家をそのまま渡すだけの関数には足さない。渡すことしかしていないものを検査しても、検査が実装の写しになるだけである
- api のテストを handler のテストへ「移す」対象は無い。プロジェクトの endpoint で実処理を検査していたテストは元から無かった

### D7. 一覧の合成 — 設定は api が解決して引数で渡す

`listProjectDirectory` は設定を自分で読まず、api が `readServerConfig()` で解決した値を引数で受ける（capability の「設定を引くのは端だけ」）。本家の承認待ち件数を数えるところは今の実装をそのまま持ち込み、`upstreamBaseUrl` が `null` のときに数えずに空で返す短絡も残す。

api は次の 3 行になる。

```ts
export default defineEventHandler(async (): Promise<ProjectDirectoryResponse> => ({
  directory: await listProjectDirectory(readServerConfig()),
}))
```

本家仲介の handler（`project-approval.ts`・`project-document.ts`・`readProjectInfo`・`registerProject`）は `upstreamClient()` をそのまま呼ぶ。`upstreamClient()` は内部で設定を読むが、これは今 api が呼んでいるものと同じで、`server/utils/stroke/invoke.ts` も同じ呼び方をしている。ここを引数へ変えると本家との往復の作り方が 2 通りになる。

## 関連 docs の書き換え案（現状 → 追従後）

**なし。** `docs/specs/structure/system-structure.md` §1 は `server/handler/` の行を既に持ち、§4 は「api の handler ファイルは HTTP 固有の準備と後始末だけを持ち、実処理は `handler/` を呼ぶ」を既に書いている（`update-session-api-handler` で承認済み）。`docs/specs/structure/server-structure.md` の棚卸しは `server/utils/` が対象で、`server/handler/` は対象外と明記されている——この change は `server/utils/` にファイルを足さないので本数は 33 のまま変わらない。

`docs/specs/api/projects/delete.md`「実装の共有」が求める形（削除の実行は共通、局面の述語は endpoint）は D5 のとおり保たれる。**この change が新しく作る docs の食い違いは無い。**

## Risks / Trade-offs

- [本家の 1 操作を渡すだけの handler が 8 本できて、読む順が 1 段深くなる] → 関心ごとに 3 ファイルへまとめ、渡すだけの関数は `UpstreamRestClient` のメソッド名をそのまま使う。api の docblock（何を受理し何を断るか）は api に残す
- [切り出しの範囲を issue の「修正するファイル」より広げている（D1）] → 広げた 8 本は `upstreamClient().<操作>()` の 1 行を handler へ移すだけで、入力の検証も応答の写しも動かさない。`yarn typecheck` と既存のテストが通ることで確かめる
- [`server/utils/stroke/conflict.ts` を同時進行の子 change と同時に触る] → 触るのは `deleteErrorToHttp` の docblock の 1 段落だけで、実装と export は動かさない。衝突しても解決は容易である
- [`upstreamClient()` が返す失敗の写しが api にあるまま、handler の中を素通りする] → `update-session-api-handler` の D7 と同じ据え置きである。`toHttpError` は `server/utils/control/upstream-proxy.ts` にあり、api だけが呼ぶので capability には反しない
- [一覧の合成を handler へ移すことで、承認待ち件数の数え方が変わる] → 実装をそのまま移し、`upstreamBaseUrl` が `null` のときの短絡も残す。handler のテストで両方を見る

## Migration Plan

1. `server/handler/project-directory.ts` を作る（`listProjectDirectory`・`resolveProjectName`・`readProjectInfo`・`registerProject`）
2. `server/handler/project-approval.ts`・`server/handler/project-document.ts` を作る
3. api 13 本を薄くする。P1 は `toHttp` を消して `deleteErrorToHttp` を呼ぶ
4. `server/utils/stroke/conflict.ts` の docblock を事実に合わせる
5. `test/server/handler/` にテスト 2 本を足す
6. `yarn typecheck` → `yarn test` → `yarn test:e2e` → `openspec validate --all --store stroke`

巻き戻し: この change の commit を revert すれば元の形に戻る。URL も入出力も動かさないので、画面・E2E・設定は revert の対象に入らない。

## Open Questions

なし。
