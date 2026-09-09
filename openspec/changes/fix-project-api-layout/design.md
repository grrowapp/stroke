## Context

動機は proposal.md「Why」。ここは**移動の中身**（どのファイルをどこへ、import をどう直すか、何を確かめれば URL が変わっていないと言えるか）を決める。

現状の制約:

- `server/api/projects/` の中で置き方が 2 種類同居している。規定どおりなのは `[projectId]/index.delete.ts`・`index.post.ts`・`[projectId]/approvals/index.get.ts`・`[projectId]/specs/index.get.ts` の 4 本、規定から外れているのが 9 本
- handler を指しているのは **URL だけ**である。画面（`app/composables/useProjectApi.ts`）も E2E も `$fetch('/api/projects/...')` の形で URL を書いており、handler のファイル path を書いている本番コードは 1 行も無い（`grep` で確認済み。ヒットするのは docs 3 ページのみ）
- 移動する 9 本を対象とする単体テストは 1 本も無い。`test/server/api/projects/` にあるのは `index.delete.test.ts`（`[projectId]/index.delete.ts` が対象）と `index.post.test.ts`（`projects/index.post.ts` が対象）で、どちらも移動しない
- `test/server/utils/upstream/read-only.test.ts` は `server/utils/upstream/` だけを走査し、handler の名前に依らない
- capability の正は `docs/specs/api/server.md`。この change では基準の docs を一切書き換えない（親 change `fix-server-api-layout` の proposal「触らないもの」）

## Goals / Non-Goals

**Goals:**

- 9 本の移動を、**中身を 1 行も変えずに** `git mv` と相対 import の 1 段の付け替えだけで済ませる。差分を読めば「移動と import だけ」と分かる状態にする
- 移動の前後で URL・入出力が同じであることを、既存の単体テストと E2E で確かめる
- capability `server/api-layout` を、この change と `fix-session-api-layout`（Gitea #13）の両方が使える判定として置く

**Non-Goals:**

- handler の中身の整理（実処理の `server/handler/` への切り出し、`toHttpError` の一本化）— Gitea #19 に残す。この change で中身に手を入れると、#19 の差分が「移動 + 整理」で混ざって読めなくなる
- セッション系（`server/api/strokes/**`・`server/api/sessions/**`）の移動 — Gitea #13
- 移動する handler に対する単体テストの新設 — 写しの構造を保つ規定は「テストがあれば追随する」であり、無いテストを作れとは言っていない。URL の不変は E2E が押さえる

## Decisions

### 移動の表 — Endpoint 名のディレクトリを 1 段作ってその中へ入れる

9 本を次のとおり移す。左が現在、右が移動後。`server/api/` からの相対で書く。

| 現在 | 移動後 |
| --- | --- |
| `projects.get.ts` | `projects/index.get.ts` |
| `projects/[projectId]/info.get.ts` | `projects/[projectId]/info/index.get.ts` |
| `projects/[projectId]/approvals/[approvalId]/content.get.ts` | `projects/[projectId]/approvals/[approvalId]/content/index.get.ts` |
| `projects/[projectId]/approvals/[approvalId]/[action].post.ts` | `projects/[projectId]/approvals/[approvalId]/[action]/index.post.ts` |
| `projects/[projectId]/specs/[specName]/documents.get.ts` | `projects/[projectId]/specs/[specName]/documents/index.get.ts` |
| `projects/[projectId]/specs/[specName]/tasks.get.ts` | `projects/[projectId]/specs/[specName]/tasks/index.get.ts` |
| `projects/[projectId]/specs/[specName]/[document].put.ts` | `projects/[projectId]/specs/[specName]/[document]/index.put.ts` |
| `projects/[projectId]/steering/[name].get.ts` | `projects/[projectId]/steering/[name]/index.get.ts` |
| `projects/[projectId]/steering/[name].put.ts` | `projects/[projectId]/steering/[name]/index.put.ts` |

移動しないのは `projects/index.post.ts`・`projects/[projectId]/index.delete.ts`・`projects/[projectId]/approvals/index.get.ts`・`projects/[projectId]/specs/index.get.ts` の 4 本。既に規定どおりである。

`steering/[name].get.ts` と `steering/[name].put.ts` は同じ Endpoint の 2 Method なので、移動後は同じ `steering/[name]/` の中に `index.get.ts` と `index.put.ts` が並ぶ。capability「同一 Endpoint の複数 Method は Method ごとの handler にする」がそのまま読み取れる形になる。

- 代替: 移動せず `server.md` を現状（`<name>.<method>.ts` も可）に合わせる → 基準の docs は触らないという親 change の決め。却下
- 代替: URL の互換のために旧 path の handler を残す → URL は変わらないので互換の必要が無い。親 change「やってはいけないこと」で旧 path の互換を残すことを禁じている。却下

### 移動の手段 — `git mv` で 1 本ずつ動かし、中身は import 行だけ触る

`git mv` を使うと履歴が移動として追える。移動後に触るのは各ファイル先頭の相対 import だけで、handler の本体・docblock・型は 1 文字も変えない。

1 段深くなるので、相対 import の `../` を 1 つ増やす。付け替えの内訳は次のとおり。

| ファイル（移動後） | 現在の相対 | 移動後の相対 |
| --- | --- | --- |
| `projects/index.get.ts` | `../utils/…` | `../../utils/…` |
| `projects/[projectId]/info/index.get.ts` | `../../../utils/…` | `../../../../utils/…` |
| `projects/[projectId]/steering/[name]/index.get.ts`・`index.put.ts` | `../../../../utils/…` | `../../../../../utils/…` |
| `projects/[projectId]/approvals/[approvalId]/content/index.get.ts`・`[action]/index.post.ts` | `../../../../../utils/…` | `../../../../../../utils/…` |
| `projects/[projectId]/specs/[specName]/documents/index.get.ts`・`tasks/index.get.ts`・`[document]/index.put.ts` | `../../../../../utils/…` | `../../../../../../utils/…` |

`#shared/types` のような alias の import は path の深さに依らないので触らない。`h3`・`zod` の外部 import も触らない。

- 代替: 相対 import をこの機会に alias（`~~/server/utils/…` など）へ置き換える → 移動と別の変更が同じ差分に混ざる。既存の handler が全て相対 import で書かれているので、揃えるなら別 change。却下
- 検算: 付け替え漏れは `yarn typecheck` が確実に落とす（解決できない相対 path になるため）。目視に頼らない

### capability の置き場 — `server/api-layout`

`openspec/specs/server/` には既に `session-management` があり、`server/<関心>` の 2 段が使われている。`server.md` の置き方は `server/api/` の構造の話なので `server/api-layout` に置く。

- 代替: `api/layout` → `openspec/specs/api/` は `api/session/promote` のように **endpoint ごとの振る舞い**が入っている場所で、ファイルの置き方とは別の関心。混ぜない。却下
- 代替: 既存の `app-structure` に足す → あちらは `app/` の構造。`server/` の話を入れると 1 つの capability が 2 つの規範に従うことになる。却下
- Gitea #13 が先に着手していたら #13 が新設する取り決めなので、着手時に `openspec/specs/server/api-layout/` と他 change の `specs/server/api-layout/` の有無を確かめ、既にあれば新設せずそちらに寄せる

### capability の書き方 — 規範を判定できる形に言い直し、正は規範に置く

置き方の正は `docs/specs/api/server.md` とし、capability はそれを機械的に判定できる形に言い直したものとする。**言い直しである以上、規則の中身は規範と重なる**（Endpoint はディレクトリ・root handler は `index.<method>.ts`・動的は `[param]`）。重ならない書き方はこの capability では取れない——判定の対象がファイル名の形そのものだからで、`app-structure` が「区切りの名前を持たない」で済むのは、あちらの判定対象が「規範が定める区切り」という外部の名前だからである。

重なる分の二重管理は、spec に「正は規範であり、食い違ったら規範が勝つ。規範が変わったらこの要件を書き換える」と明記して引き受ける。この一文が無いまま規則を写すのが二重管理であり、正の所在を明示した言い直しは別である。

capability の Requirement は `server/api/` 全体に掛かる。この change の後も セッション系（`server/api/strokes/**` の 12 本・`server/api/sessions/[id]/activate.post.ts`）は `<name>.<method>.ts` のままで、その分は要件を満たさない。**これは Gitea #13 が解消する差**であり、この change の完了条件は `server/api/projects/**` に限る（issue #12「完了条件」）。差が残っていること自体をこの change の未達とはしない。**この逃げ道は design だけでなく spec 本文にも置く**——archive 後に living spec として残るのは spec の側で、そちらに無ければ merge した瞬間から実態と矛盾するため。

単体テストの置き場は capability に入れない。写し元の構造に従う規定は `docs/specs/structure/system-structure.md` が持ち、判定は既存の capability `app-structure`「テストは写し元の構造に従う」が持っている。同じ規則を 2 つの spec に置かない。

### 検証の順序 — typecheck で import、E2E で URL

- `yarn typecheck` — 相対 import の付け替え漏れを機械的に落とす。移動の正しさの一次判定
- `yarn test` — 移動しない 2 本の単体テストと、`read-only.test.ts` を含む既存の全単体テストが通る。移動が他へ波及していないことを見る
- `yarn build && yarn test:e2e` — Nuxt のルーティングが移動後のファイルから同じ URL を組み立てていることを、実際に叩いて確かめる。**URL 不変の判定はここでしか取れない**（型検査は URL を見ない）
- `find server/api/projects -type f` — 完了条件の直接の確認。すべて `index.<method>.ts` であること、`server/api/projects.get.ts` が無いこと

### `docs/specs/architecture/spec-screen-flow.md` の書き換え案 — **ユーザー承認済み（2026-09-09）**

`docs/specs/api/` の外の docs は、design で案を出し、親がユーザーの承認を取ってから直す（親 change design「docs の書き換え」）。**この 1 行は 2026-09-09 にユーザーの承認を得ている。**

対象は「位置」の表の本文 API の行（165 行目）。

- 現状: `| 本文 API | `server/api/projects/[projectId]/specs/[specName]/documents.get.ts` |`
- 追従後: `| 本文 API | `server/api/projects/[projectId]/specs/[specName]/documents/index.get.ts` |`

同じ表の一覧 API の行（`server/api/projects/[projectId]/specs/index.get.ts`）は移動しないのでそのまま。ほかに書き換える docs は無い。

据え置くもの:

- `docs/specs/plan/artifact-extension-plan.md`（46・106・116 行目が `documents.get.ts` を指す）— 冒頭で「未決定の検討資料。現状の事実は `spec-screen-flow.md` にあり、食い違ったら事実の側が正しい」と自ら定めている。事実のページを直せば足りる。親 change「触らないもの」の `docs/specs/plan/*` にも当たる
- `docs/adr/0018-delegate-create-feature.md`（120・127・143・163 行目）— 当時の記録。親 change「触らないもの」
- `docs/specs/structure/system-structure.md` §4 — プロジェクト系を本数でしか書いておらず、ファイル名を持たない。矛盾しない

## Risks / Trade-offs

- [相対 import の付け替えを 1 本でも漏らす] → `yarn typecheck` が落ちる。目視で確かめずに typecheck の結果で判定する
- [`git mv` の後に Nuxt の `.nuxt/` に古いルート情報が残り、E2E が旧 path のまま通ってしまう] → E2E は `yarn build` を挟んでから回す。ビルドが移動後のファイルからルートを組み直す
- [`server/api/projects.get.ts` を `server/api/projects/index.get.ts` へ動かすときに、既に存在する `server/api/projects/index.post.ts` と衝突する] → 衝突しない。ファイル名が違い、同じ Endpoint の別 Method として並ぶのが規定どおりの形である
- [capability の Requirement がセッション系にも掛かり、この change の完了時点で全体としては満たされない] → 「capability の書き方」で述べたとおり、差は Gitea #13 が解消する。この change の完了条件は `server/api/projects/**` に限る
- [移動する 9 本に単体テストが無いため、移動で挙動が壊れても単体テストでは気づけない] → 中身を 1 行も変えないことで挙動が変わる余地を消す。加えて E2E がプロジェクト系の画面を実際に開く

## Migration Plan

1. capability `server/api-layout` の delta を書く（他の change が先に置いていないか確かめてから）
2. `git mv` で 9 本を移す。ディレクトリは `git mv` が作れないので先に `mkdir -p` する
3. 各ファイルの相対 import を 1 段深くする
4. `yarn typecheck` → `yarn test` → `yarn build && yarn test:e2e` の順で通す
5. 承認済みの 1 行を `docs/specs/architecture/spec-screen-flow.md` に反映する
6. `find server/api/projects -type f` と `openspec validate --all --store stroke` で完了条件を確かめる

巻き戻し: 中身を変えていないので、この change の commit を revert すれば元の置き方に戻る。URL が変わらないため、revert しても呼び手側の追随は要らない。

## Open Questions

なし。
