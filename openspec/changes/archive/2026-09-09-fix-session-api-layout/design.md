## Context

動機は proposal.md「Why」。ここは**移動の中身**（どのファイルをどこへ、import をどう直すか、テストの写しをどう追随させるか、何を確かめれば URL が変わっていないと言えるか）を決める。

現状の制約:

- `server/api/` で規定から外れているのはセッション系だけである。プロジェクト系 13 本はすべて `index.<method>.ts` で（`fix-project-api-layout` が済ませた）、セッション系は 17 本のうち 13 本が `<name>.<method>.ts` である。既に規定どおりなのは `strokes/index.get.ts`・`strokes/index.post.ts`・`strokes/[id]/index.get.ts`・`sessions/[id]/index.delete.ts` の 4 本
- handler を指しているのは **URL だけ**である。画面（`app/composables/**`）・エージェント（`server/mcp/tools/**`）・E2E はいずれも `$fetch('/api/strokes/…')` の形で URL を書いており、handler のファイル path を `import` している本番コードは 1 行も無い（`grep` で確認）
- 移す 13 本のうち 9 本には単体テストがある（テストファイルは 10 本。`invoke-agent.get.ts` だけが 2 本持つ）。テストは handler を `await import('…/server/api/strokes/[id]/<name>.<method>')` で直に読み込むので、**path を書いているのはテストだけ**である。テストは `server/` の構造を写す（`docs/specs/structure/system-structure.md` §2）ので、写しの側も動かす
- `server/routes/api/strokes/[id]/ws/**`（契約 W1・W2）は `server/api/` の外にある。`docs/specs/api/server.md` が規定するのは `server/api/` の置き方だけなので、対象外
- 置き方の物差しは `openspec/specs/server/api-layout`（`fix-project-api-layout` が新設済み）。この change では基準の docs を一切書き換えない（親 change `fix-server-api-layout` の proposal「触らないもの」）

## Goals / Non-Goals

**Goals:**

- 13 本の移動を、**handler の中身を 1 行も変えずに** `git mv` と相対 import の 1 段の付け替えだけで済ませる。差分を読めば「移動と import だけ」と分かる状態にする
- テストの写しを、`await import()` の path・`support.ts` を引く相対 path・冒頭 docblock が指す対象の path まで含めて漏れなく追随させる
- 移動の前後で URL・入出力が同じであることを、既存の単体テスト 10 本と E2E で確かめる
- `server/api/` 全体を capability `server/api-layout` の到達点に届かせる。この change の後、`find server/api -type f` に `index.<method>.ts` でないものが 1 本も無くなる

**Non-Goals:**

- 名前空間の移設（`/api/strokes/` → `/api/sessions/`）— Gitea #17。ディレクトリ単位の移動は相対 import の深さを変えないので、index 化を先に済ませておけば #17 は `git mv` だけで済む
- handler の中身の整理（実処理の `server/handler/` への切り出し）— Gitea #15・#18
- 移す 13 本のうち単体テストを持たない 4 本（`strokes.get`・`send-back.get`・`overview.get`・`submission.post`）へのテスト新設 — 写しの規定は「テストがあれば追随する」であり、無いテストを作れとは言っていない。URL の不変は E2E が押さえる

## Decisions

### 移動の表 — Endpoint 名のディレクトリを 1 段作ってその中へ入れる

13 本を次のとおり移す。左が現在、右が移動後。`server/api/` からの相対で書く。

| 現在 | 移動後 |
| --- | --- |
| `strokes/[id]/strokes.get.ts` | `strokes/[id]/strokes/index.get.ts` |
| `strokes/[id]/answer.post.ts` | `strokes/[id]/answer/index.post.ts` |
| `strokes/[id]/send-back.get.ts` | `strokes/[id]/send-back/index.get.ts` |
| `strokes/[id]/send-back.post.ts` | `strokes/[id]/send-back/index.post.ts` |
| `strokes/[id]/approve.post.ts` | `strokes/[id]/approve/index.post.ts` |
| `strokes/[id]/approve.delete.ts` | `strokes/[id]/approve/index.delete.ts` |
| `strokes/[id]/invoke-agent.get.ts` | `strokes/[id]/invoke-agent/index.get.ts` |
| `strokes/[id]/promote.post.ts` | `strokes/[id]/promote/index.post.ts` |
| `strokes/[id]/overview.get.ts` | `strokes/[id]/overview/index.get.ts` |
| `strokes/[id]/question.post.ts` | `strokes/[id]/question/index.post.ts` |
| `strokes/[id]/proposal.post.ts` | `strokes/[id]/proposal/index.post.ts` |
| `strokes/[id]/submission.post.ts` | `strokes/[id]/submission/index.post.ts` |
| `sessions/[id]/activate.post.ts` | `sessions/[id]/activate/index.post.ts` |

`send-back` と `approve` は同じ Endpoint の 2 Method なので、移動後は 1 つのディレクトリに `index.get.ts` と `index.post.ts`（`send-back`）、`index.post.ts` と `index.delete.ts`（`approve`）が並ぶ。capability「同一 Endpoint の複数 Method は Method ごとの handler にする」がそのまま読み取れる形になる。

- 代替: 移動せず `server.md` を現状に合わせる → 基準の docs は触らないという親 change の決め。却下
- 代替: URL の互換のために旧 path の handler を残す → URL は変わらないので互換の必要が無い。capability「置き方を変えても Endpoint の見え方は変わらない」が旧 path を残すことを禁じている。却下
- 代替: この change で #17 の名前空間の移設まで一度にやる → URL が変わる変更（画面・E2E・`wsPathPattern`・`.claude/settings.json` の追随）と、URL が変わらない変更が同じ差分に混ざり、どちらが壊したのか切り分けられなくなる。issue が分かれている理由でもある。却下

### 移動の手段 — `git mv` で 1 本ずつ動かし、中身は import 行だけ触る

`git mv` を使うと履歴が移動として追える。移動後に触るのは各ファイル先頭の相対 import だけで、handler の本体・docblock・型は 1 文字も変えない。

1 段深くなるので、相対 import の `../` を 1 つ増やす。**13 本すべてが現在 `../../../utils/…`（`sessions/[id]/index.delete.ts` だけが持つ `../../../handler/…` は移動しないので関係しない）で、移動後は一律 `../../../../utils/…` になる。** 深さの内訳が 1 種類しか無いのは、移す 13 本がすべて `<namespace>/[id]/` の直下に居るからである。

`#shared/stroke` のような alias の import は path の深さに依らないので触らない。`h3`・`zod` の外部 import も触らない。

- 代替: 相対 import をこの機会に alias へ置き換える → 移動と別の変更が同じ差分に混ざる。既存の handler が全て相対 import で書かれているので、揃えるなら別 change。却下
- 検算: 付け替え漏れは `yarn typecheck` が確実に落とす（解決できない相対 path になるため）。目視に頼らない

### テストの写し — Endpoint 名のディレクトリを作り、その中で `index.<method>.test.ts` にする

`docs/specs/structure/system-structure.md` §2 は「単体は `app/` `modules/` `server/` `shared/` の構造をそのまま写す」と定める。移動でソースの側にディレクトリが 1 段増えるので、テストの側にも同じ名前のディレクトリを作る。

| 現在 | 移動後 |
| --- | --- |
| `test/server/api/strokes/answer.post.test.ts` | `test/server/api/strokes/answer/index.post.test.ts` |
| `test/server/api/strokes/approve.post.test.ts` | `test/server/api/strokes/approve/index.post.test.ts` |
| `test/server/api/strokes/approve.delete.test.ts` | `test/server/api/strokes/approve/index.delete.test.ts` |
| `test/server/api/strokes/invoke-agent.get.test.ts` | `test/server/api/strokes/invoke-agent/index.get.test.ts` |
| `test/server/api/strokes/invoke-agent.multiplex.test.ts` | `test/server/api/strokes/invoke-agent/multiplex.test.ts` |
| `test/server/api/strokes/promote.post.test.ts` | `test/server/api/strokes/promote/index.post.test.ts` |
| `test/server/api/strokes/proposal.post.test.ts` | `test/server/api/strokes/proposal/index.post.test.ts` |
| `test/server/api/strokes/question.post.test.ts` | `test/server/api/strokes/question/index.post.test.ts` |
| `test/server/api/strokes/send-back.post.test.ts` | `test/server/api/strokes/send-back/index.post.test.ts` |
| `test/server/api/sessions/activate.post.test.ts` | `test/server/api/sessions/activate/index.post.test.ts` |

`invoke-agent.multiplex.test.ts` は同じ handler（U13）の別の側面を見る 2 本目のテストで、Method に対応する名前を持たない。現在の名前が `<Endpoint 名>.<側面>.test.ts` なので、Endpoint 名をディレクトリへ移して `<側面>.test.ts` を残す。ディレクトリの中に `index.get.test.ts` と `multiplex.test.ts` が並び、どちらが root handler の Method 単位のテストかは名前で読める。

移動に伴って各テストで直すものは 3 種類ある。

1. `await import()` が指す handler の path — `…/server/api/strokes/[id]/answer.post` → `…/server/api/strokes/[id]/answer/index.post`
2. 相対 path の深さ — テストが 1 段深くなるので、`../support` は `../../support`、`../../../../server/…`（`utils` や `handler` を引くもの、`vi.mock` の第 1 引数と `importOriginal<typeof import(...)>` を含む）は `../../../../../server/…` になる。**`vi.mock` の第 1 引数を直し忘れるとモックが当たらず、テストは「落ちる」のではなく本物を呼びに行く**ので、`vi.mock` と `await import()` の path が対になっていることを 1 本ずつ確かめる
3. 冒頭 docblock の「対象は `server/api/…`」の行 — そのテストが何を見ているかの宣言なので、移動後の path に直す

- 代替: テストの path に `[id]` の段も作って `test/server/api/strokes/[id]/answer/index.post.test.ts` にする → 写し元の構造としてはこちらの方が忠実だが、issue #13 が移動先を `test/server/api/strokes/<name>/index.<method>.test.ts` と明示しており、現行のテストも `[id]` の段を持っていない。`[id]` の段を足すかどうかは「そのまま写す」の解釈の問題で、この change の目的（`index.<method>` 化）とは別の判断である。**issue の指定に従い、この change では足さない。** #17 が `test/server/api/strokes/**` を `sessions/**` へ動かすときに合わせて判断するのが自然である
  - **`[id]` の段を挟まない理由として現行のテストが挙げていた根拠は、現在の環境では成り立たない。docblock を訂正する。** `question/index.post.test.ts` の docblock は「vitest の `include` は glob で、`[id]` は文字クラスとして解釈されるため 1 本も拾われない」と書いていた。しかしこの change で `test/server/api/projects/[projectId]/index.delete.test.ts` へ移したテストは実際に収集され通っている（`yarn vitest list` で確認。`include` の pattern は `test/**/*.test.ts` で角括弧を含まず、角括弧はテスト側の**ファイル path** にしかないため、文字クラスとしては解釈されない）。**偽の根拠を残したまま、他の 7 本の docblock がそこを「理由もそちらに書いてある」と指す状態にはできない**ので、この 1 箇所を「現行の置き方に倣う。かつての根拠は成り立たない。`[id]` の段を足すかどうかは #17 が決める」と書き直す。指している 7 本はそのまま正しい参照になる
  - **`test/server/api/sessions/index.delete.test.ts` は projects の件と同型のずれである。** 対象は `server/api/sessions/[id]/index.delete.ts` なのに `sessions/` の直下に居る。`[id]` の段を挟むかどうかの判断そのものなので、`[projectId]` の件（親が許可済みの申し送り）とは別に扱い、この change では動かさない。**#17 へ引き継ぐ**
- 検算: `vi.mock` の path の付け替え漏れは typecheck では落ちない（文字列なので型が付かない）。`yarn test` の 10 本が全て通ることで確かめる

### `test/server/api/projects/index.delete.test.ts` の階層合わせ — `fix-project-api-layout` からの申し送り

`test/server/api/projects/index.delete.test.ts` は `server/api/projects/[projectId]/index.delete.ts` を対象とするテストだが、`test/server/api/projects/` の直下に置かれている。その位置は `server/api/projects/index.delete.ts` を写したものと読め、同じディレクトリにある `index.post.test.ts`（対象は `projects/index.post.ts` で、位置は正しい）と見分けが付かない。`[projectId]/index.delete.test.ts` へ動かして写し元を位置に表す。

直すのは `'../support'` → `'../../support'` と `'../../../../server/…'` → `'../../../../../server/…'` の相対 path だけで、`await import('…/server/api/projects/[projectId]/index.delete')` は移動しない handler を指しているのでそのまま。あわせて `test/server/handler/delete.test.ts` の docblock がこのテストの位置を書いているので追随させる。

- なぜこの change で直すか: `fix-project-api-layout` の担当が着手時点で気づいたが、issue #12 の「修正するファイル」の外だったので #13 へ申し送った。親が許可済み
- **申し送りの出どころは Gitea issue #13 のコメントで、`fix-project-api-layout` の artifact には残っていない**（同じ change が引き継いだ steering の 1 行は archive 済み design の「`docs/specs/architecture/spec-screen-flow.md` の書き換え案」に明記されているのと対照的である）。archive 後に根拠を辿れるよう、この節をその記録とする

### `.spec-workflow/steering/structure.md` の 1 行 — `fix-project-api-layout` からの申し送り。親が許可済み

37 行目「- **server の API ルート**: Nitro の規約に従う（`projects.get.ts`、`projects.post.ts`）」が、命名の例として実在しないファイル名を挙げている。`projects.post.ts` は `fix-project-api-layout` より前から実在せず（実体は `projects/index.post.ts`）、`projects.get.ts` は同 change の移動で消えた。

- 現状: ``- **server の API ルート**: Nitro の規約に従う（`projects.get.ts`、`projects.post.ts`）``
- 追従後: ``- **server の API ルート**: Nitro の規約に従う（`projects/index.get.ts`、`projects/index.post.ts`）``

`docs/specs/structure/system-structure.md` は「コーディング規約（命名・import の書き方・テストの置き場）は steering が持つ」と steering へ委ねている。委ね先が古い例を挙げたままだと、新しい endpoint を足す人が古い形に倣いうる。`server/api/` 全体が新しい置き方に揃うのはこの change なので、ここで直す。

書き先は**親の実体**（`/opt/projects/stroke-board/.spec-workflow/steering/structure.md`）である。`.spec-workflow/` は worktree に無く（sparse checkout で除外）、読み書きは親へ向ける（`CLAUDE.md`「前提」）。**したがってこの 1 行はこの change の PR には載らない。** git への反映は親がまとめて行う。

- 代替: `docs/specs/api/server.md` の例に合わせて `foo/index.get.ts` と書く → steering は「この repo で実際に使っている例」を挙げる文脈なので、実在するファイルを挙げる方が読み手の役に立つ。却下

### docs は 1 ページも書き換えない

issue #13 が「`docs/specs/api` 以外の関連 docs — 矛盾なし」と確かめている。移す 13 本のファイル名を書いた「事実」のページは無い。名前を挙げているのは次の 2 つで、いずれも据え置く。

- `docs/specs/plan/portal-stroke-exit.md`（57・122・123 行目。124 行目は `server/api/strokes/[id]/` というディレクトリの指定で、移すファイル名は含まない）— 実施済み change の当時の記録。親 change「触らないもの」の `docs/specs/plan/*`
- `docs/adr/0016-delegate-provide-operations-via-mcp.md`（179 行目）— `server/api/strokes/**` という glob で、個別のファイル名ではない。そもそも ADR は当時の記録で、親 change「触らないもの」

`docs/specs/architecture/session-workflow.md`・`docs/specs/api/sessions/approve.md`・`docs/specs/api/contract.md` はいずれも URL（`POST /api/strokes/:id/approve` の形）でしか endpoint を指していないので、URL が変わらないこの change では矛盾が生じない。

### コード中のコメントが指すファイル名は据え置き、親へ引き継ぐ

移す 13 本のファイル名を、`test/` の外の本番コードがコメントで挙げている箇所がある。**この change では直さない。**（`test/` の中で挙げているものは写しの追随の対象なので直す。`test/server/utils/stroke/creation-broadcast.test.ts` の 3 行がそれにあたる。）

| ファイル | 行 | 何を挙げているか |
| --- | --- | --- |
| `server/mcp/tools/get-send-back.ts` | 13・34 | `server/api/strokes/[id]/send-back.get.ts` |
| `server/mcp/tools/get-overview.ts` | 20・49 | `server/api/strokes/[id]/overview.get.ts` |
| `server/mcp/tools/submit-document.ts` | 146 | `server/api/strokes/[id]/proposal.post.ts` |
| `server/utils/stroke/sweep.ts` | 14 | `promote.post.ts`（短い名前） |
| `server/utils/stroke/session-store.ts` | 242・271 | `submission.post.ts`・`activate.post.ts`（短い名前） |
| `server/utils/stroke/request-schemas.ts` | 125 | `question.post.ts`（短い名前） |
| `scripts/stroke-check.ts` | 653・966 | `approve.post.ts`・`proposal.post.ts`（短い名前） |
| `server/api/strokes/[id]/approve/index.delete.ts` | 12 | `send-back.get.ts`・`send-back.post.ts`（短い名前） |
| `server/api/strokes/[id]/approve/index.post.ts` | 13・17 | `promote.post.ts`・`approve.delete.ts`（短い名前） |
| `server/api/strokes/[id]/promote/index.post.ts` | 33・37・40・43 | `approve.delete.ts`・`approve.post.ts`・`activate.post.ts`（短い名前） |
| `server/api/strokes/[id]/submission/index.post.ts` | 16 | `sessions/[id]/activate.post.ts` |

据え置く理由は 3 つ。

1. `server/mcp/tools/*` は親 change の proposal が「触らないもの」に明示的に挙げている
2. 短い名前（`promote.post.ts`）で書かれているものは、ファイル path ではなく **endpoint の通称**として使われている。`server/utils/` や `scripts/` は issue #13 の「修正するファイル」の外でもある
3. 移す handler 自身の docblock（表の下 4 行）は issue #13 の「修正するファイル」の中にあり、この change が既に import 行を触っているファイルでもある。それでも据え置くのは、差分を「移動 + import 行」だけに保って読めるようにするためで、**#17 が同じ箇所をもう一度ずらす**（`strokes/` → `sessions/`）ので 2 度直すより 1 度で済ませる方がよい。なお `git diff -M` の rename 検出は類似度 73〜95% で成立しており、docblock を数行直しても崩れない——検出の維持は据え置きの理由にならない

親の `openspec/` にも、archive されていない change と ticket が旧ファイル名を挙げている箇所がある。**こちらは書き換えてはならない**——親 change の「やってはいけないこと」が「親の `openspec/` にある他の change の artifact を書き換える」を禁じている。

| ファイル | 行 | 何を挙げているか |
| --- | --- | --- |
| `openspec/tickets/replace-polling-with-push.md` | 34・35 | `question.post.ts:34`・`proposal.post.ts:62` |
| `openspec/tickets/fix-retry-count-without-launch.md` | 59 | `server/api/strokes/[id]/invoke-agent.get.ts` |
| `openspec/changes/replace-polling-with-push/proposal.md` | 29・30 | `question.post.ts:31`・`proposal.post.ts:36` |
| `openspec/changes/fix-rename-during-running-session/proposal.md` | 58・62 | `question.post.ts`・`proposal.post.ts`・`invoke-agent.get.ts`・`promote.post.ts` |
| `openspec/changes/fix-rename-during-running-session/design.md` | 5 | `proposal.post.ts`・`question.post.ts` |
| `openspec/changes/fix-rename-during-running-session/tasks.md` | 9・10・30・31・39・40 | `question.post.ts`・`proposal.post.ts`・`invoke-agent.get.ts`・`promote.post.ts` |
| `openspec/changes/fix-server-api-layout/tasks.md` | 22 | `promote.post.ts`（親 change 自身の作業記録） |
| `openspec/tickets/fix-session-api-path.md` | 41 | `test/server/api/strokes/` の U 系を `approve.*`・`promote.*`・`invoke-agent.*`・`send-back.post` と略記している。移動でこれらはディレクトリになった |

このうち `fix-rename-during-running-session`・`replace-polling-with-push`・`fix-server-api-layout` の分は**済んだ作業の記録**なので、当時の path のまま残るのが正しい（`docs/agents/issue-tracker.md`「過去の記録」の趣旨。archive 前でも記録であることは変わらない）。**前向きの資料は ticket 3 本** — `replace-polling-with-push.md` の 34・35 行、`fix-retry-count-without-launch.md` の 59 行、`fix-session-api-path.md` の 41 行で、いずれもこれから着手する作業の指し先として実在しない path を挙げることになる。**`fix-session-api-path.md` はとくに #17 が吸収する当の ticket である**（親 change の design「旧 ticket の吸収」）ので、#17 の着手時に必ず目に入る。**親へ引き継ぐ**——ticket の書き換えは他 change の artifact に手を入れることなので、親が自分の判断で直すか、それぞれの change が着手時に直す。

これは「直さない」ではなく「この change の担当範囲ではない」の意味である。**親へ引き継ぐ**——#17 が `server/api/strokes/**` を `server/api/sessions/**` へ動かすときに、これらのコメントは同じ理由でもう一度ずれる。2 度直すより #17 でまとめて直す方が差分が少ない。#17 の範囲に入らない A 系（`overview` ほか）の分は、親が別 issue を立てるか #17 に含めるかを決める。

### 検証の順序 — typecheck で import、単体テストで `vi.mock`、E2E で URL

- `yarn typecheck` — 相対 import の付け替え漏れを機械的に落とす。移動の正しさの一次判定
- `yarn test` — 移した 10 本のテストが通る。`vi.mock` の path（文字列なので型が付かない）の付け替え漏れはここでしか落ちない
- `yarn build` の生成物のルート表 — ビルドが登録した `/api/**` の一覧を移動前（`pre3`）のものと突き合わせる。`.nuxt/types/nitro-routes.d.ts` に全 endpoint が列挙されるので、**URL 集合が 1 つも増減していないことを差分ゼロで示せる**。E2E より先に取れて、E2E が届かない endpoint（A 系のうち画面が叩かないもの）も含めて全数を見られる
- `yarn test:e2e` — Nuxt のルーティングが移動後のファイルから同じ URL を組み立てていることを、実際に叩いて確かめる。**URL 不変の判定はここでしか取れない**（型検査も単体テストも URL を見ない）。E2E は 50000 番から空きポートを取るので他の worktree と並走できる。起こしたものは必ず止め、ポートの解放を確かめる
- `find server/api/strokes server/api/sessions -type f` — 完了条件の直接の確認。すべて `index.<method>.ts` であること
- `openspec validate --all --store stroke` — この change が valid（`skip_specs: true` なので delta ゼロで通る）

## Risks / Trade-offs

- [相対 import の付け替えを 1 本でも漏らす] → `yarn typecheck` が落ちる。目視で確かめずに typecheck の結果で判定する
- [`vi.mock` の第 1 引数の付け替えを漏らす。型が付かないので typecheck を素通りし、モックが当たらないまま本物の `session-store` などを呼びに行く] → `yarn test` が落ちる。加えて、移した 10 本それぞれで `vi.mock` の path と `await import()` の path が同じ深さになっていることを確かめる
- [`git mv` の後に Nuxt の `.nuxt/` に古いルート情報が残り、E2E が旧 path のまま通ってしまう] → E2E は `yarn build` を挟んでから回す。ビルドが移動後のファイルからルートを組み直す
- [`send-back` と `approve` で 1 つのディレクトリに 2 Method を入れるとき、片方だけ動かして残りを取りこぼす] → 移動の表の 13 行を 1 行ずつ消し込む。最後に `find` で `<name>.<method>.ts` が 0 件であることを確かめる
- [テストの docblock の path を直し忘れ、テストが自分の対象を偽って指す] → 移動後に 2 つの `grep` を回す。**prefix 付きの形だけを見る grep では、短い名前（`promote.post.ts`）で書かれたものを構造的に取りこぼす。** (1) `server/api/(strokes|sessions)/\[id\]/[a-z-]+\.(get|post|delete)` が `test/` で 0 件、(2) `(strokes|answer|send-back|approve|invoke-agent|promote|overview|question|proposal|submission|activate)\.(get|post|delete)\.ts` が `test/` で 0 件。**(2) は末尾の `.ts` を求めるので、`approve.*` のように拡張子を省いた略記を構造的に取りこぼす**——artifact・ticket まで掃くときは `.ts` を外した (3) の形も回す
- [コメントが指すファイル名が実在しなくなる（上の「コード中のコメント」）] → 据え置いた箇所を表で全数挙げ、親へ引き継ぐ。挙動には影響しない
- [E2E が高負荷で落ち、移動のせいか環境のせいか切り分けられない] → 落ちた spec を負荷が下がってから回し直し、通ることで切り分ける（`fix-project-api-layout` で同じ事象が起きている）

## Migration Plan

1. 移動先のディレクトリを `mkdir -p` で先に作る（`git mv` はディレクトリを作らない）
2. `git mv` で handler 13 本を移す（移動の表）
3. 移した 13 本の相対 import を `../../../utils/…` → `../../../../utils/…` に直す
4. `git mv` でテスト 10 本を移し、`await import()` の path・相対 path の深さ・docblock の対象を直す
5. `test/server/api/projects/index.delete.test.ts` を `[projectId]/` へ移し、相対 path と `test/server/handler/delete.test.ts` の docblock を追随させる
6. `test/server/api/support.ts` の使い方の例が示す深さ、および `test/server/utils/stroke/creation-broadcast.test.ts` の docblock が指すテストの位置を追随させる
7. `yarn typecheck` → `yarn test` → `yarn build && yarn test:e2e` の順で通す
8. 親の実体の `.spec-workflow/steering/structure.md` 37 行目を直す（git への反映は親）
9. `find` と `openspec validate --all --store stroke` で完了条件を確かめる

巻き戻し: handler の中身を変えていないので、この change の commit を revert すれば元の置き方に戻る。URL が変わらないため、revert しても呼び手側の追随は要らない。

## Open Questions

なし。
