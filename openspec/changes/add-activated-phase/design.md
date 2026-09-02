# add-activated-phase — design

## Context

動機は [`proposal.md`](./proposal.md) の Why にある。ここは、そこで決まった区間を実装へ落とすために要る現状と制約だけを置く。

区間は tasks.md 冒頭で確定している。

```
approved ──────────── 生成中 ────────────> activated
 [承認後]                                    [提出後]
```

書く主体と契機も確定している——**invokeAi が、プロセスが終わって結果を判定した時点で、承認 API を phase 付きで叩く。新規 endpoint を生やさない。**

この design が決めるのは、その3つが決めていない残り——**契約の形**・**「出し終えた」を何で確かめるか**・**既存の `state.json` をどうするか**——である。

### 承認は3段に分かれている（2026-09-02 追記）

この design を最初に書いた後、`separate-approval-decision-from-promotion` が develop へマージされた。**`phase` を書く口が U10 から移っている。**

| 段 | 口 | すること |
| --- | --- | --- |
| 判断 | U10 `POST /api/strokes/:id/approve` | 判断を `proposed` の中の `decision` として記録する。**`phase` を動かさない・改名しない・起動しない**。取り下げは同 path の `DELETE` |
| 昇格 | U14 `POST /api/strokes/:id/promote` | 改名して `phase: 'approved'` を書く。**本文を取らない**（名前は判断が持つ）。起動しない |
| 起こし | U13 `GET /api/strokes/:id/invoke-agent` | steering を起こす。昇格の成功を見た側が呼ぶ |

昇格の完了時点で `invocation` は `failed` に置かれる（U14 が A8 経由で書く）。起動の要求が届かなくても巡回が拾えるようにするためで、**失敗の印ではなく「起こし直す対象」の印**である。

この変化が下の D4・D5・D7 の前提を動かしている。該当箇所にそれぞれ追記した。

### いま値の集合が散っている場所

proposal.md は4箇所を挙げているが、実装を読むと**5箇所**ある。

| 箇所 | 形 |
| --- | --- |
| `shared/stroke.ts:104` | `type Phase = 'stroking' \| 'proposed' \| 'approved'` |
| `server/handler/phase.ts:38` | `readPhase` の中の `=== 'stroking' \|\| === 'proposed' \|\| === 'approved'` |
| `server/utils/stroke/session-core.ts:248` | **もう1つの `readPhase`**。同じ連鎖を持ち、外れた値を `'unknown'` に倒す |
| `server/utils/stroke/session-store.ts:84-87` | zod の `literal` 3本 |
| `server/utils/stroke/session-store.ts:206` | `creationOutcomeOf` の `phase !== 'approved'` |

`readPhase` が2つあることは proposal.md に載っていない。片方だけ直すと、U12 の一覧が `activated` を `'unknown'` として返す（`SessionSummary['phase']`）。巡回はこの一覧を読むので、そこが崩れると起こし直しの母集合が変わる。

### 述語が削除の到達範囲を決めている

`isAfterApproval` / `isBeforeApproval` は「線引きを1箇所に書く」ためのものだが、実際には**削除の口2つの受理範囲**そのものである。

| 口 | 述語 | 意味 |
| --- | --- | --- |
| `DELETE /api/projects/:projectId` | `isAfterApproval` | プロジェクトだけ消せる |
| `DELETE /api/sessions/:id` | `isBeforeApproval` | セッションだけ消せる |

`activated` をどちらにも入れないと、**完成したプロジェクトがどちらの口からも消せなくなる**。決着のモーダルの「破棄する」も、プロジェクト一覧からの削除も止まる。

### steering の提出はこちらの口を通るが、承認依頼は通らない

`server/mcp/tools/submit-document.ts` は steering の文書を本家へ PUT する前に必ず通る。**文書が書かれたことは見える。**

一方、承認依頼を作るのは本家 `spec-workflow-mcp` の `request-approval` で、こちらの MCP サーバーを通らない。**承認依頼が出たことは、呼び出しの側からは見えない。**

## Goals / Non-Goals

**Goals**

- `activated` を足しても、値の集合を触る場所が1つで済む形にする
- 行（一覧）と配信（決着）が、同じ1つの状態から導かれる形にする
- 既存の `state.json`（`activated` を持たない）が、この変更で入れなくならないようにする

**Non-Goals**

- 承認 endpoint が3つの仕事を1回でやっている件（`separate-approval-decision-from-promotion`）。段の分割はしない
- `/write-steering-v2` が無い件（`fix-missing-write-steering-skill`）。症状であって原因ではない
- 画面の見た目。クラッカー・モーダル・やり直す・破棄するは実装済みで動く。足りないのは判定の層だけなので `ui.md` は作らない
- 生成中に下層の URL を直に開いたときの見せ方。`activated` でなければ行が「アクティブ」にならず、入場の口が閉じるので、この change の範囲では追加の面を作らない

## Decisions

### D1 — `activated` は `approved` の後に置く

`stroking → proposed → approved → activated` の4値にする。

ticket が「`activated` の位置が未決。『`proposed` の次』という指示があるが、`approved` との前後関係が2通り読める」としていた点は、tasks.md 冒頭の区間図で決着している。`approved` が区間の始点で `activated` が終点なので、順序は一意に決まる。

**却下した案** — `approved` の前に置く（`proposed → activated → approved`）。承認より前に「起動済み」が来ることになり、承認がプロジェクト生成の唯一の引き金（`CONTEXT.md`）と噛み合わない。

### D2 — 値の一覧を `shared/stroke.ts` に1つ持ち、型はそこから導く

```ts
export const PHASES = ['stroking', 'proposed', 'approved', 'activated'] as const
export type Phase = (typeof PHASES)[number]
```

`readPhase` 2箇所と zod は、この一覧に照らす形へ寄せる（`PHASES.includes(...)` / `z.enum(PHASES)`）。**イコール比較を呼び出し側へばら撒かない。**

置き場を `shared/` にするのは、`server/` と `app/` の両方が引くためである（`#shared/stroke`）。`server/handler/phase.ts` に置くと画面から引けない。

**却下した案** — `handler/phase.ts` に一覧を置き、`shared/stroke.ts` の型はそのままにする。型と一覧が別々の場所に残り、「値を足す前に1箇所へ閉じる」（ticket の前提）を満たさない。

### D3 — 判定は述語で表し、`isAfterApproval` に `activated` を含める

```ts
isBeforeApproval(phase)  // stroking | proposed        — まだセッション
isAfterApproval(phase)   // approved | activated       — もうプロジェクト
isGenerating(phase)      // approved                   — 生成中（区間の内側）
```

`isAfterApproval` に `activated` を含めるのは、上の「述語が削除の到達範囲を決めている」による。含めなければ完成したプロジェクトを消す口が無くなる。

`isGenerating` を新しく足すのは、**行と配信が見るのはこれ1つ**にするためである。呼び出し側に `phase === 'approved'` を書かせない——それをやると `activated` を足した意味が消える。

### D4 — `activated` は自分の受け口を持つ（U15 `POST /api/strokes/:id/activate`）

**この決定は 2026-09-02 に改めた。** 元の形（U10 の入力を判別可能ユニオンにして `{ phase: 'activated' }` を足す）は、承認が3段に分かれる前の U10——判断と昇格と起動を1回で行っていたもの——を前提にしていた。**その前提はもう無い。**

いまの U10 は判断を記録するだけで、`phase` を1つも動かさない（契約に「改名しない・`phase` を動かさない・起動しない」と明記されている）。そこへ `activated` を書く入力を足すと、**U10 の契約に正面から反する**。

段ごとに自分の受け口を持つ形は、既にこの系の作法である。`activated` も同じ形にする。

```
POST /api/strokes/:id/activate
  input:  本文なし
  output: 本文なし（204）
  遷移:   approved → activated
```

- **本文を取らない。** U14 と同じ理由である——書く値は1つに決まっており、引数で受けると別の値を書けてしまう。「任意の phase を書かせない」（tasks 1.1）は、**入力を持たないことで形として保証される**。これは元の案（リテラル1つだけを受ける）より強い
- `approved` でなければ 409 `phase`。「`approved` のセッションを `activated` にする」が責務なので、始点が違えば責務の不成立である（ADR-0014 補足1。U14 が「判断が無ければ受理しない」を同じ理屈で扱っているのと同型）
- 叩くのは invokeAi。画面もエージェントも叩かない

**tasks.md の「新規 endpoint を生やさない」を、ここで読み替える。** あの一文は、U10 が唯一の `phase` の書き込み口だった時点で「**2つ目の phase 書き込み口を作るな**」と言っていた。3段への分割で、`phase` の書き込み口は既に U10 から U14 へ移っており、**段ごとに受け口を持つことがこの系の形になった**。同じ意図——書き込み口を増やして散らさない——を今の形で満たすのは、遷移ごとに1つの受け口を置くことである。

**却下した案**

- **U14 に `{ phase: 'activated' }` を足す** — U14 は「本文を取らない」と契約に明記されている。本文を取る形へ変えると、昇格が名前を引数で受け取れる余地を開く（それを塞ぐために本文を取らない形にしてある）
- **U10 に足す**（元の案）— 上のとおり U10 の契約に反する
- `{ transition: 'promote' | 'activate' }` を引数にする — 遷移名という語彙を増やす。受け口を分ければ要らない
- `PATCH /api/strokes/:id` で phase を部分更新する — 「任意の phase を書かせない」が形として保証できない

### D5 — 「出し終えた」は、承認依頼がファイルとして在ることで確かめる

invokeAi がプロセスの終了を検知した時点で、`<プロジェクト>/.spec-workflow/approvals/` 配下に承認依頼のファイルが**1件以上**あることを確かめ、あれば U15（D4）を叩く。

**なぜ承認依頼であって、steering 文書でないか。** `activated` の意味は「レビューできる状態になった」である。文書が書かれていても承認依頼が出ていなければ、決着のモーダルの「レビューする」を押した先に何も無い——今回ユーザーが踏んだ経路そのものである。

**なぜ本家 REST でなく、ファイルシステムか。**

| 材料 | 採否 | 理由 |
| --- | --- | --- |
| `.spec-workflow/approvals/` のファイル | **採用** | 本家が動いていなくても読める。承認直後は本家がまだ registry に載せていないことがある |
| 本家 REST の承認依頼一覧 | 却下 | 本家の稼働に依存する。取れなかったことと0件が混ざる（`docs/adr/0005`） |
| 自前 MCP `submit-document`(steering) の呼び出し回数 | 却下 | 上記のとおり、承認依頼はこの口を通らない。文書の PUT を数えても承認依頼の有無は分からない |

**プロセスの終了を根拠にしない。** specs delta の「エージェントが何も作らずに正常終了する → 完成した状態にならない」がここで満たされる。確かめられなかったとき（読めない・0件）は `activated` を**書かない**。黙って成功へ倒さない。

**本家の実装詳細への依存を認める。** 承認依頼の置き場は本家が決めている。基準は ADR-0008 の 2.2.7 に固定されており、走査（`server/utils/upstream/scan.ts`）も承認依頼の代行（`server/utils/upstream/rest.ts`）も既に同じ前提の上にある。ここで新しい依存を増やしてはいない。

### D6 — 成功は phase から、失敗は `invocation` から導く

`creationOutcomeOf` を次の形にする。

| 根拠 | 配信 |
| --- | --- |
| phase が `approved` → `activated` に変わった | `done` |
| `invocation` が `error` になった（phase は `approved` のまま） | `failed` |
| それ以外 | 流さない |

**成功の判定材料から `invocation` を外す。** `idle` は「claude のプロセスがどうなったか」しか表さず、成果物ゼロでも立つ（実測 2026-08-30 の `setai-2`）。

**失敗は `invocation` に残す。** 失敗は「区間の中で終われなかった」ことで、区間の外に出る出来事ではないので phase では表せない。proposal の「`invocation` は失敗の応答に専念させる」はこの形になる。

**`failed` を決着として流さないことが、いっそう重要になった（2026-09-02 追記）。** 昇格（U14）は完了時点で `invocation` を `failed` に置く——起動の要求が届かなくても巡回が拾えるようにするためで、失敗の印ではない。ここを決着として流すと、**昇格した瞬間に必ず失敗のモーダルが出る**。いまの `creationOutcomeOf` は `failed` を流さないので、その形を保つ。

行（`server/utils/control/directory.ts`）も同じ phase を見る。

| phase | `creation` | `connection` |
| --- | --- | --- |
| `approved` | `in-progress` | **判定しない**（必ず `disconnected`） |
| `activated` | `done` | 通常どおり registry で判定する |
| `state.json` を持たない（外から置かれたもの） | `done` | 通常どおり |

**走査（`.spec-workflow/` の有無）は母集合を作るためだけに使う。** 行の状態の判定には使わない。これが今回のバグの直接の修正である——`.spec-workflow/` は本家 MCP が接続した瞬間に作るので、ステアリングを書き終えた印にならない（実測 2026-09-01・`/opt/projects/agent-messanger`: `.spec-workflow/` が `12:33:34`、最初のステアリング文書が `13:10:35`。**37分の空白**）。

この空白の間、行は `done` になり、registry にも載るので `active` になり、入場のガード（`app/pages/projects/index.vue:55` は `connection` しか見ない）を素通りしていた。**phase で判定すれば、生成中の行は `connection` の判定対象から外れるので、アクティブになりようがない。** 入場のガードは今の1行のままでよい。

### D7 — 既存の `state.json` は起動時に一度だけ書き上げる

`activated` を足すと、**既に完成しているプロジェクトはすべて `approved` のまま**なので、そのままでは全部が生成中として並び、入れなくなる。

`server/plugins/` に一度きりの書き上げを置く。`01.retry-failed.ts` の「立ち上がって最初の巡回でだけ `running` を倒す」と同じ場所・同じ考え方である。

- 対象は `phase: 'approved'` のもの
- D5 と**同じ判定**（承認依頼がファイルとして在るか）を通し、通ったものだけ `activated` へ上げる
- 書き込みは U15（D4）を叩く。直に書かない（書き込み口を増やさない）
- 通らなかったものは `approved` のまま残る。生成中として並び、決着のモーダルから「やり直す」「破棄する」を選べる。**これは正しい状態である**——承認依頼が無いプロジェクトは、実際にレビューできない

**却下した案** — 移行しない。実測で `/opt/projects` に `state.json` を持つプロジェクトが存在するため、入れなくなる実害が出る。

**却下した案** — `activated` を持たない `approved` を完了とみなす。それでは今回のバグがそのまま残る。

### D8 — `approved` を見ている分岐は、すべて `activated` も通す（2026-09-02 追加）

`activated` は「`approved` の後」であって「`approved` の代わり」ではない。**`approved` だけを見ている分岐は、放っておくと `activated` のプロジェクトを別物として落とす。** 3段への分割で、その分岐が増えている。

| 箇所 | いまの形 | 落ちると何が起きるか |
| --- | --- | --- |
| `session-store.ts` の `stateSchema` | `phase` の判別可能ユニオンに `approved` の枝だけ | `activated` の `state.json` が読めず、`readState` が全面的に失敗する |
| `invoke-agent.get.ts`（U13）の `kind` 導出 | `phase === 'approved' ? 'steering' : 'stroke'` | 完成したプロジェクトを起こし直すと**ストロークの定型**で走り、steering の MCP も渡らない |
| `invoke-agent.get.ts` の `runId` | `phase === 'approved' ? state.runId : undefined` | 会話の続き先を失い、初回として走り直す |
| `handler/phase.ts` の `isAfterApproval` | `phase === 'approved'` | 削除の口2つのどちらからも消せなくなる（D3） |
| `promote.post.ts`（U14）の受理判定 | `phase === 'approved'` なら「既に昇格している」 | そのままでよい。`activated` も昇格済みなので、同じ 409 に落ちるべきである |

**`activated` は `approved` と同じ形の状態にする。** `state.json` の中身（`projectName` / `invocation` / `retries` / `runId`）は変えず、`phase` の値だけが違う枝にする。zod の枝を2つに分けるか、`phase` を `z.enum(['approved', 'activated'])` で受ける1枝にするかは実装の選択で、**どちらでも `activated` の `state.json` が読める**ことだけを満たす。

判定は D3 の述語を通す。`phase === 'approved'` の直書きを残さない——残すと、次に値が増えたときに同じ表をもう一度作ることになる。

## Risks / Trade-offs

| リスク | 対処 |
| --- | --- |
| 本家が承認依頼の置き場を変えると D5 の判定が壊れる | 基準は ADR-0008 の 2.2.7 に固定。走査も承認依頼の代行も同じ前提の上にある。実機で一巡（tasks 7章）して確かめる |
| 承認依頼が出た**後**に人が承認してしまうと、ファイルが archive へ移って判定が0件になる | 判定はプロセス終了の1回だけで、その時点で人が承認済みということは起こらない。起動時の書き上げ（D7）では起こりうるので、その場合は `approved` のまま残り、ユーザーが「やり直す」を選べる |
| `error` を立てる者がいない（tasks 6.1） | いま `error` は「上限に達した状態での再キック」でしか立たない（`ai.ts:88-92`）。巡回は60秒間隔なので、失敗の配信は最大1分遅れる。**この change では経路が通ることの確認に留め、遅れは受け入れる**——縮めるには巡回の間隔か起こし直しの仕組みに手を入れることになり、`portal/batch` の「巡回に条件を足さない」に触れる |
| `readPhase` が2つあるので片方だけ直すと U12 が `activated` を `'unknown'` にする | D2 で一覧を1つにし、両方をそこへ寄せる。tasks 2章で「振る舞いが変わっていないこと」を先に確かめてから値を足す |
| 判別可能ユニオンにしたことで、画面の既存の呼び出しが壊れる | `{ projectName }` の形は変えない。画面側は無変更で通る |

## Migration Plan

1. 値の一覧を1箇所へ閉じる（値は3つのまま。振る舞いは変わらない）
2. `activated` を足す。既存の `state.json` が読めなくならないことを確かめる
3. 判定と配信を phase へ移す
4. 起動時の書き上げ（D7）を置く
5. 実機で一巡する

**巻き戻し**。1〜3 はコードだけで、`state.json` に新しい値は入らない。4 を入れた後に巻き戻す場合、`activated` を書かれた `state.json` が残る。`Phase` から `activated` を外すと `readPhase` が `null` / `'unknown'` を返し、**削除の口がどちらも受理しなくなる**。巻き戻すなら `activated` を `approved` に戻す書き上げが要る。

## 上位資料への整合反映（提案・未承認）

`docs/agents/issue-tracker.md`「更新対応」により、ここで提案し、**ユーザーの承認を得るまで書き換えない**。

| 資料 | 箇所 | 反映の内容 |
| --- | --- | --- |
| `docs/specs/api/contract.md` | 一覧表と「受理系」の並び（:29-31・:44-48） | **U15 `POST /api/strokes/:id/activate` を足す**。承認の流れが U10（判断）→ U14（昇格）→ U13（起こし）→ **U15（完成の記録）** の4段になる |
| `docs/specs/api/contract.md` | U15 の節（新設） | 本文なし・204・`approved` からのみ受理・409 phase。叩くのは invokeAi だけ |
| `docs/specs/api/contract.md` | U2（:132）・U12（:195） | `phase` の値に `activated` を足す |
| `docs/specs/api/contract.md` | U13（:208-）| 起こす定型の選び分けが `approved` だけでなく `activated` も steering になること |
| `CONTEXT.md` | 「生成中」 | 「終わりは `.spec-workflow/` が出来たとき」を**承認依頼が出たとき**へ改める。定義本体（ステアリングをまだ作り終えていない状態）は正しいので変えない。区間の終わりを指す用語を1つ足す（tasks 1.4） |
| `docs/specs/plan/portal-stroke-exit.md` | 「承認ボタン → 一覧へ戻る」の図（:19-20） | 「`.spec-workflow/` ができる → 実行が終わったら done を配信」を、承認依頼の提出を終点とする形へ |

### この change の specs delta に足りないもの

`specs/project/generation/spec.md` の delta は3つの Requirement を ADDED し、1つを MODIFIED しているが、**既存の Requirement「生成中か完了かはファイルシステムの事実だけで判定する」を触っていない。**

その Requirement は次を定めており、この design と正面から食い違う。

> システムは、昇格したプロジェクトが生成中か完了かを、`state.json` の `phase` が承認済みであることと、`.spec-workflow/` を持つかどうかの2つだけで判定しなければならない（SHALL）。

`.spec-workflow/` の有無を判定から外す以上、この Requirement は MODIFIED として delta に載せる必要がある。**tasks に着手する前に specs delta へ足す**（tasks 1章の前）。

## Open Questions

- 区間の終わりを指す**日本語の用語**（`CONTEXT.md` に足すもの）。`activated` の訳として「始動済み」を候補に置くが、`CONTEXT.md` の「生成中」が既に避けている語（作成中・準備中・pending・初期化中）と紛れない語をユーザーが選ぶ。**判定にも実装にも影響しないので後で決められる**
