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

### D4 — U10 の入力を判別可能ユニオンにする

`POST /api/strokes/:id/approve` の入力を次の2形に限る。

| 入力 | 遷移 | 誰が叩くか |
| --- | --- | --- |
| `{ projectName: string }` | `proposed` → `approved` | 画面（承認モーダル）。**従来と同一** |
| `{ phase: 'activated' }` | `approved` → `activated` | invokeAi |

- **任意の phase を書かせない。** `phase` は `'activated'` のリテラルのみ受ける。`'approved'` も `'stroking'` も受けない
- **省略は既定の遷移（昇格）**であることを契約に明記する。省略時に現在の phase を見て振る舞いを変えるのではなく、**入力の形が遷移を決める**
- 遷移の始点と現在の phase が合わなければ 409 `phase`。これは「受け取った引数に対して責務が成立しない」ケースで、ADR-0014 の対象外である（既存の U10 が `proposed` のみ受理しているのと同じ形）

**ADR-0014 に照らす。** 判定の材料（どの遷移か）は入力の形として契約に現れる。呼び出し側が渡していない内部状態を見て振る舞いを変える箇所は無い。

**却下した案**

- `POST /api/strokes/:id/activate` を生やす — tasks.md が「新規 endpoint を生やさない」と確定させている。承認 API は既に phase を進める口であり、進める先が1つ増えるだけである
- `{ transition: 'promote' | 'activate' }` を引数にする — 遷移名という新しい語彙を1つ増やすことになる。`projectName` を伴うか `phase` を伴うかで既に判別できるので、増やす必要が無い
- `PATCH /api/strokes/:id` で phase を部分更新する — 「任意の phase を書かせない」が形として保証できない

### D5 — 「出し終えた」は、承認依頼がファイルとして在ることで確かめる

invokeAi がプロセスの終了を検知した時点で、`<プロジェクト>/.spec-workflow/approvals/` 配下に承認依頼のファイルが**1件以上**あることを確かめ、あれば U10 を `{ phase: 'activated' }` で叩く。

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
- 書き込みは U10 を `{ phase: 'activated' }` で叩く。直に書かない（書き込み口を増やさない）
- 通らなかったものは `approved` のまま残る。生成中として並び、決着のモーダルから「やり直す」「破棄する」を選べる。**これは正しい状態である**——承認依頼が無いプロジェクトは、実際にレビューできない

**却下した案** — 移行しない。実測で `/opt/projects` に `state.json` を持つプロジェクトが存在するため、入れなくなる実害が出る。

**却下した案** — `activated` を持たない `approved` を完了とみなす。それでは今回のバグがそのまま残る。

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
| `docs/specs/api/contract.md` | U10（:162-176） | 入力が2形になること、`activated` への遷移、409 の条件 |
| `docs/specs/api/contract.md` | U2（:129）・U12（:192） | `phase` の値に `activated` を足す |
| `CONTEXT.md` | 「生成中」 | 「終わりは `.spec-workflow/` が出来たとき」を**承認依頼が出たとき**へ改める。定義本体（ステアリングをまだ作り終えていない状態）は正しいので変えない。区間の終わりを指す用語を1つ足す（tasks 1.4） |
| `docs/specs/plan/portal-stroke-exit.md` | 「承認ボタン → 一覧へ戻る」の図（:19-20） | 「`.spec-workflow/` ができる → 実行が終わったら done を配信」を、承認依頼の提出を終点とする形へ |

### この change の specs delta に足りないもの

`specs/project/generation/spec.md` の delta は3つの Requirement を ADDED し、1つを MODIFIED しているが、**既存の Requirement「生成中か完了かはファイルシステムの事実だけで判定する」を触っていない。**

その Requirement は次を定めており、この design と正面から食い違う。

> システムは、昇格したプロジェクトが生成中か完了かを、`state.json` の `phase` が承認済みであることと、`.spec-workflow/` を持つかどうかの2つだけで判定しなければならない（SHALL）。

`.spec-workflow/` の有無を判定から外す以上、この Requirement は MODIFIED として delta に載せる必要がある。**tasks に着手する前に specs delta へ足す**（tasks 1章の前）。

## Open Questions

- 区間の終わりを指す**日本語の用語**（`CONTEXT.md` に足すもの）。`activated` の訳として「始動済み」を候補に置くが、`CONTEXT.md` の「生成中」が既に避けている語（作成中・準備中・pending・初期化中）と紛れない語をユーザーが選ぶ。**判定にも実装にも影響しないので後で決められる**
