## Context

動機は proposal.md「Why」。ここでは、段を分けるときに効いてくる**既にある制約**だけを置く。すべて実装と spec で裏を取った。

- **`phase: 'approved'` は「昇格した」の同義語である。** プロジェクトの母集合は保存先の走査で作られ、判定は `state.json` の `phase === 'approved'` だけ（`server/utils/control/creating.ts:70`）。だから**判断の記録に `phase` を使えない**——判断を `approved` で表すと、改名前のセッションがプロジェクト一覧に uuid の名前で並ぶ。これは `project/generation` が明文で禁じている宙吊りそのものである
- **`invocation` は判定の材料にならない。** 生成中か完了かは `phase` と `.spec-workflow/` の有無だけで決める（`project/generation`）。`creating.ts:13` が「`invocation` を読まない」と明記している
- **`invocation` の書き込みは A8 を通す。** `agent/invocation:133` が「`invocation` の書き込みは `invocation` を操作する endpoint（`api/stroke/submission`、A8）を通してのみ行い、書き込むのは invokeAi だけとする SHALL」と定め、invokeAi へ渡す書き込み口も endpoint を経由している（`server/utils/stroke/invoke.ts:58-65` の `invocationWriter`）。**いまの承認の endpoint だけがこれに反しており**、`writeState` で直に倒している（`approve.post.ts:105`）。同じことをする巡回は A8 経由（POST `submissionPath`）で守っている（`server/plugins/01.retry-failed.ts:54-60`）。**この違反を新しい受け口へ持ち越さない**（決定7）
- **巡回は `failed` だけを拾う。** 判定は `shouldRetry` の1行で、`portal/batch` が「それ以外の条件判定を持ってはならない」と定めている
- **受理と起動を分けるのは既にある作法である。** U9 差し戻しは endpoint が起動を持たず、画面が受理の成功応答の直後に U13 を叩く（`app/composables/useProposalReview.ts:287-313`。受理の POST が :298、起動の要求が :308）。**U10 だけがこの作法から外れている**
- **画面の承認は1押しではない。** 「承認して作る」→ 確認モーダル →「作る」の2段である（`app/pages/strokes/[sessionId]/proposal.vue:108` → `useProposalReview.ts:328-331` の `openApprove()` → 確認モーダル `app/components/review/Modals.vue:70-92` → `useProposalReview.ts:372` の `approve()`）

## Goals / Non-Goals

**Goals:**

- 承認の判断・昇格・steering の起動を、それぞれ自分の受け口を持つ段にする
- 判断を取り下げる道を、**ストロークの往復の記録を失わずに**作る
- 失敗したときのやり直しの入口を段ごとに分ける
- 段を分けても、承認が昇格の唯一の引き金であることを保つ

**Non-Goals:**

- **面のデザインを決めない。** 承認と昇格の間に人の操作を挟むか、猶予を置くか、取り消しをどこに出すかは後続の面の設計に委ねる（この change は `ui.md` を作らない）
- `project/generation` の昇格そのもの（改名だけ・`.spec-workflow/` を作らない・順序と巻き戻し）を変えない
- 巡回（`portal/batch`）の判定を変えない
- steering の実行の中身（`--mcp-config`・定型・完了の判定）を変えない。ADR-0011 の「承認の次の工程を自動で始める」を覆さない
- `Phase` の値を増やさない

## Decisions

### 決定1: 判断は `state.json` の `proposed` 状態に持たせる。`phase` の値は増やさない

`state.json` の `proposed` に判断のフィールドを足す。判断の有無 = そのフィールドの有無とする。

```
{ phase: 'proposed', currentQuestion: …, invocation: …, decision?: { projectName: string } }
```

**「`phase` を動かさない」は型で表せる**（tasks 2.2）。`stateSchema` は `phase` の `z.discriminatedUnion` である（`server/utils/stroke/session-store.ts:83-94`）。判断を読む・書く・消す口を **`proposed` の分岐に閉じた型**（`Extract<SessionState, { phase: 'proposed' }>`）で受け、同じ型を返す形にすれば、`phase` を別の値へ動かす書き方が型で通らない。**新しい制約を足すのではなく、既にある分岐を使い切るだけである。**

> **実装時の補足（2026-09-01）。** `SessionState` の型は zod と違い `stroking | proposed` を1つの分岐（`phase: 'stroking' | 'proposed'`）にまとめていたので、`Extract<SessionState, { phase: 'proposed' }>` は `never` になる。型の側も zod と同じく分岐を割り、`proposed` を `ProposedState`（`decision?` を持つ）として名前を付けた。判断を書く・消す口は `withDecision(state: ProposedState, …): ProposedState` / `withoutDecision(state: ProposedState): ProposedState` の純関数で、保存は呼び出し側が `writeState` で行う（受け口が前提の判定を持つため）。`approved` を渡す呼び出しが型で落ちることは `@ts-expect-error` で固定した（`test/server/utils/stroke/session-decision.test.ts`）。

**代案A: `phase` に新しい値（`decided` など）を足す。** 採らない。`Phase` は `shared/stroke.ts:104` の3値で、`server/handler/phase.ts`・`docs/specs/api/contract.md`・U8/U9/U11/A5/A7 の phase 判定・画面の `approved` 判定がこの3値を前提にしている。局面を1つ増やすと、この change が問うていない場所が全部動く。**判断は局面ではなく、局面の中で持つ印である**——判断が下りてもセッションはセッションのままだ、というのがこの change の骨子なので、局面を分けるのは筋が違う。

**代案B: 別ファイル（`decision.json`）に持つ。** 採らない。状態が2つの入れ物へ割れる。加えて `updatedAt` は `state.json` の mtime である（`docs/specs/api/contract.md:192`）ので、判断を別ファイルへ書くと一覧の並びが動かない——判断という利用者の操作が、時系列に現れなくなる。

### 決定2: 失効は「proposal を書く口が判断を消す」で実現する。版の印を持たない

`api/session/approve` の「判断は、それが下された proposal に結びつく」は、**proposal の受理（A7）が記録された判断を消す**ことで満たす。proposal の版番号やハッシュを持たない。

**代案: proposal に版の印を持たせ、昇格の直前に突き合わせる。** 採らない。版という新しい概念を系に持ち込むことになり、印を誰が採番し誰が持ち回るかが増える。**proposal を書く口が1つなら、そこで消せば足りる。** ただしこれは前提に依存するので、**proposal を書く口が A7 だけであることを実装で確かめ、テストで固定する**（tasks 1章）。口が増えたら漏れる形なので、リスクとして下に記録する。

> **実測（2026-09-01・tasks 1.1）。** `sessionProposal(...).write` の呼び出し元は `server/api/strokes/[id]/proposal.post.ts:36`（A7）の1つだけ。他の2箇所（`approve.post.ts`・`server/routes/api/strokes/[id]/ws/proposal.ts`）は `read` である。前提は成立し、決定2 はそのまま。A7 は前の状態を丸ごと写さず `proposed` の状態を組み立て直す形にし、`decision` を持ち越さないことを `test/server/api/strokes/proposal.post.test.ts` で固定した。差し戻し（U9）が判断に触れないことは `send-back.post.test.ts` で固定した。

### 決定3: 昇格の受け口は `POST /api/strokes/:id/promote`。名前を引数に取らない

**名前を引数に取らない。** 名前はユーザーが判断とともに確定したもので、昇格はシステムの動作である。引数で受けると、判断に含まれるものと違う名前で昇格できてしまい、「名前はユーザーが確定する」（`.scratch/stroke-board-frontier/decisions.md`）が崩れる。既存の実装も同じ考え方を持っている——`useProposalReview.ts:338-343` の doc が昇格の失敗を「決定をやり直させない」と明記し、確定した名前を保持したまま実行だけを再試行している。

**ADR-0014（API は暗黙の状態分岐を持たない）との関係。** この受け口は、呼び出し側が渡していない状態（記録された判断）を読んで受理/不受理を分ける。これは ADR-0014 の補足1「責務を果たせない場合の判定」にあたる——「判断のあるセッションを昇格させる」が責務であり、判断が無ければその責務が成立しない。存在しないセッション id を受理しないのと同じ形である。**分岐ではなく不成立**として書く。U10 が既に「proposal が残っていなければ受理しない」を同じ形で持っている（`approve.post.ts:44`）。

**path の動詞について。** `api/project/delete` は「パスに `delete` のような動詞を置いてはならない」と定めるが、これは削除を `GET` で到達できる形にしないための規定で、その capability に閉じている。ストローク側の受け口は `approve` / `send-back` / `submission` / `invoke-agent` / `answer` と、すべて動詞句である。`promote` はこの並びに沿う。

**spec の path と実装の path が割れることは、この change では直さない。** capability は `POST /api/sessions/:id/promote` と書き、実装は `server/api/strokes/[id]/promote.post.ts`（= `/api/strokes/:id/promote`）に置く。U11 削除だけが spec 側（`/api/sessions/`）へ寄っており、他の U 系は実装が `/api/strokes/` のままであることは `docs/specs/api/contract.md:48-49` が既知の乖離として記録している。**U14 はその並びに従う**——寄せ直しはこの change の問いではない。

**取り消し（`DELETE`）は `server/api/strokes/[id]/approve.delete.ts` に置く**（tasks 4.1）。同じ path をメソッドで振り分ける形にし、`approve.ts`（メソッド接尾辞なし）にはしない——Nitro がメソッドとして読むのはドットで続く接尾辞だけなので、接尾辞を落とすと `GET /api/strokes/:id/approve` でも取り消しに到達してしまう（`api/project/delete`・`docs/specs/api/contract.md:52-54`）。ファイルを分けるのは Nuxt/Nitro の慣行そのものであり、`send-back.get.ts` / `send-back.post.ts` が同じ path で既にこの形を採っている。

### 決定4: 昇格の完了時点で `invocation` を `failed` にし、起動の段を巡回へ引き渡す

いまは昇格時に `idle` を書き（`approve.post.ts:71`）、キックが届かなかったときだけ `failed` へ倒す（:105）。**昇格の受け口がキックしなくなると、この倒す処理の置き場が無くなる。** `idle` のまま残すと、巡回は `failed` しか拾わないので、起動が一度も届かなかった対象を誰も起こし直さない。

**昇格が成功した時点の `invocation` を `failed` として書く。** 起動の段がまだ済んでいないことを、巡回が既に拾う値で表す。

**代案A: `Invocation` に「まだ起きていない」を表す値（`pending` など）を足す。** 採らない。`shared/stroke.ts` の型・A8 のスキーマ（`server/utils/stroke/request-schemas.ts:95-103` の `submissionBody`）・`session-store.ts:73`・`sweep.ts`・`docs/specs/api/contract.md:129` が動くうえ、**巡回に拾う条件を1つ足すことになる**。`portal/batch` は「巡回はそれ以外の条件判定を持ってはならない（MUST NOT）」と定めており、正面から反する。

**代案B: 昇格を要求した側（画面）が、キックに失敗したときだけ A8 で `failed` を書く。** 採らない。後始末が endpoint から画面へ移るだけで、**要求そのものが出なかった場合**（ブラウザが閉じた・昇格の応答を受け取る前に離脱した）を誰も拾わない。いまの実装が endpoint の中でこれを拾っていたのは、まさにその穴を塞ぐためである。

**語彙のずれは認める。** 失敗していないのに `failed` と書く。ただし系はこの値を既に「起こし直す対象」の意味で使っている——`server/plugins/01.retry-failed.ts:54-60` は、前のプロセスの残骸として残った `running` を「失敗したから」ではなく「誰も起こし直さないから」`failed` へ倒している。**同じ用法である。** 実装の doc と `sweep.ts` の説明を「失敗した実行」から「起こし直す対象」へ揃える。

**画面の見え方には出ない。** 生成中の判定は `phase` と `.spec-workflow/` だけで行い、`invocation` を材料にしない（`project/generation`・`creating.ts:13`）。

> **実測（2026-09-01・tasks 1.3・1.4）。** 一覧の材料を作る `server/utils/control/creating.ts` と `directory.ts` は `invocation` を読まない（`server/utils/control/` で `invocation` を含むのは `board.ts`（配信）と `creating.ts`（読まないと書いた doc）だけ）。E2E `stroke-exit.spec.ts` は昇格直後の行が `data-creation="in-progress"` で出ることを見ており、`failed` にしても通った。巡回と画面のキックで渡る値は同じ——cwd は巡回が U12 の `path`（`sessionDir(root, name)`）、画面が U2 の `path`（同じ式）で、`kind` は U13 が `phase === 'approved'` から導くのでどちらも `steering`。

**どこから書くかは決定7で決める。** ここで決めたのは「昇格の完了時点の値は `failed`」までである。

### 決定5: 3段を叩くのは昇格を要求した側。既定の流れは今の体験を変えない

画面は **U10（判断）→ U14（昇格）→ U13（起動）** を順に叩く。U9 差し戻しが既に「受理 → 起動」の2段を叩いており（`useProposalReview.ts:287-313`）、作法は新しくない。

**承認モーダルで確定した後、昇格へは自動で続ける。** 今の体験（承認 → 一覧へ戻る → 生成中の行）を変えない。**取り消せる余地は、API としてそこに在ることで満たす**——判断と昇格が別の呼び出しになった時点で、間に人の操作を挟める形は成立している。挟むかどうかは面の設計であり、この change では決めない（Non-Goals）。

`broadcastProjectCreation`（`server/utils/control/board.ts:86`）は**昇格の受け口へ移す**。判断の記録では配信しない——その時点でプロジェクトはまだ無く、配信すれば一覧に生成中の行が出てしまう。

> **実装時の補足（2026-09-01）。** 画面の `approve()` は U10 を叩く前に `DELETE .../approve` を1回送る。承認と昇格の間で画面が落ちたセッションを開き直すと、判断が残ったまま `proposed` の画面に戻り、U10 は「重ねて判断は受理しない」で 409 になる——面には取り消しの操作が無い（Non-Goals）ので、画面はいま確定した名前で残っている判断を置き換える。判断が無ければ `DELETE` は何も変えない。U14 が `name-conflict` を返したとき（判断の後に同じ名前が保存先に現れた）も、判断を取り下げてから名前の衝突として面に出す。U13 は U2 の `path` を cwd に添えて画面が叩き、届かなくても知らせない——昇格の受け口が `failed` にしてあるので巡回が拾う（起動の段のやり直しは巡回である）。

### 決定6: 昇格の失敗の器（`promotionFailed` / `retryPromotion`）は残し、やり直しの単位を段にする

`useProposalReview.ts:338-370` は昇格の失敗を「決着の器」（知らせる面 `promotionNotice`・:346 → 選ばせるモーダル `promotionFailed`・:344）で受け、「やり直す」（`retryPromotion()`・:355）は同じ名前での再承認（`approve()` の呼び直し・:357）になっている。**この器は `project/generation` が規定するものなので残す。** 変えるのは「やり直す」の中身で、判断は既に記録されているので**昇格だけを呼び直す**。

### 決定7: 昇格の受け口は `invocation` を直に書かない。A8 を通して倒す

決定4 の `failed` は、**昇格の受け口から A8（`POST /api/strokes/:id/submission`）を叩いて書く**。`writeState` で直に書かない。形は巡回の刈り取りと同じである（`server/plugins/01.retry-failed.ts:54-60`）。

段取りはこうなる。

1. 改名（`promoteSessionToProject`）
2. 昇格後の場所へ `phase: 'approved'` の状態を書く。`invocation` は今までどおり `idle`、`retries` は 0（**状態を作る書き込みであって、遷移ではない**——`agent/invocation:131` は `approved` の対象も `invocation` を持つことを求めており、初期値を置かないと状態が成り立たない）
3. **A8 を叩いて `idle` → `failed` へ倒す**（決定4）。これが `invocation` の遷移で、A8 を通る

**3 は応答を返す前に待ち切る。** 昇格を要求した側は成功応答を見てから U13 を叩くので（決定5）、倒し切ってから返せば、起動の要求が `failed` を上書きされる形で追い越すことはない。巡回は `idle` を拾わないので、2 と 3 の間に巡回が割り込むこともない。

**A8 が失敗したときは記録して先へ進む。** 昇格そのものは成功しており、巻き戻さない（`api/session/promote`「後始末は段ごとに閉じる」）。`idle` のまま残ると巡回が拾わないので、そのときは画面のキックだけが起動の道になる——これは**いまの実装と同じ水準**である（`approve.post.ts:106-108` も `failed` の書き込みに失敗したらログを出して終わる）。

**採る理由。**

- **`agent/invocation:133` を破らない。** 「A8 を通してのみ」は文言の飾りではなく、書き込み口を1つに保つための規定である（`invoke.ts:54-56`「直接書くと、書き込み口が2つになり『A8 を通してのみ』が成立しない」）。段を分けるのは責務を整理する change であり、その最中に既存の違反を新しいファイルへ写すのは筋が通らない
- **書き込みに付随する判定が1箇所に残る。** `invocation` の書き込みは `writeInvocation`（`session-store.ts:165-190`）を必ず通り、そこで上層への合図を出すかどうかを `creationOutcomeOf` が決めている。「呼び出し側それぞれに置くと、書いたのに流れない経路が生まれる」と doc が明記している（:180-182）。今回の値は `failed` なので合図は流れない（`session-store.ts:199, 209` — `failed` は決着ではない）が、**流れないことがその1箇所の判定で決まる**形を保てる
- **先例と形が揃う。** 決定4 は「`failed` を『起こし直す対象』の意味で使う」用法の先例として `01.retry-failed.ts:54-60` を挙げている。書き方まで同じにすれば、語彙だけでなく経路も揃う
- **spec delta が3本のまま済む。** `agent/invocation` はこの change が問うていない capability である

**代案: `agent/invocation` を Modified Capabilities に足し、「昇格の受け口は直に書いてよい」を delta で認める。** 採らない。MUST 級の不変条件を呼び出し側1つのために緩めることになり、archive されれば spec が恒久的に弱くなる。緩める見返りは内部 `$fetch` 1回ぶんの手数だけで、割に合わない。**加えて、この delta を書くことは `approve.post.ts:105` の既存違反を「直す」のではなく「正当化する」ことになる**——直せる位置に居ながら移植するのは、この change の趣旨（段ごとに責務を閉じる）と逆を向く。

## Risks / Trade-offs

- **[proposal を書く口が増えると、失効が漏れる]** → 決定2 の前提。口が A7 だけであることを実装で確かめ（tasks 1.1）、「判断があるセッションへ proposal が届いたら失効する」を単体テストで固定する。口を増やすときにテストが落ちる形にする
- **[`failed` の語彙が薄まる]** → 決定4。実装の doc と `sweep.ts` の説明で「起こし直す対象」へ揃え、`01.retry-failed.ts` の既存の同じ用法を参照として置く。値そのものは増やさないので、巡回・A8・型・contract の値の集合は動かない
- **[巡回と画面のキックが競合する]** → 巡回は 60 秒間隔（`01.retry-failed.ts:35`）で、昇格の直後に走ると画面のキックと重なりうる。U13 の busy ガード（`beginRun`・`invoke-agent.get.ts:47`）が 409 で止めるので二重起動はしない。**ただし「先に走ったほうが勝つ」ので、どちらが勝っても同じ結果になることを確かめる**（渡す値は `kind: 'steering'` と cwd で、巡回は一覧の `path` を渡す＝同じ場所）
- **[判断だけが記録されたセッションが放置される]** → セッションのままなので U11 の削除で片付く。`approved` 未改名の宙吊りは生まれない。画面が承認と昇格の間で落ちても、次に開いたときに判断が残っており昇格を要求できる
- **[U10 の意味が変わることに気づかない呼び出し側が残る]** → 承認だけを呼んで止めると、**プロジェクトが作られないまま成功が返る**。E2E（`test/e2e/stroke-exit.spec.ts`・`test/e2e/proposal-persistence.spec.ts`・`test/e2e/workspace.spec.ts`）が承認から一覧までを通しで見ているので、段を踏まない呼び方は落ちる。落ちることを先に確かめてから直す
- **[A8 への内部 `$fetch` が失敗すると `invocation` が `idle` のまま残る]** → 決定7。巡回は `idle` を拾わないので、起こし直しの受け皿が消え、起動の道は画面のキックだけになる。**いまの実装と同じ水準**（`approve.post.ts:106-108` も直書きの失敗をログで終える）なので後退ではないが、直書きと違って書き込みが2回に割れるぶん窓は増える。倒し切ってから応答を返すこと（決定7）で、少なくとも起動の要求に追い越されない形にする
- **[判断が記録されている間に差し戻しが起こる]** → 差し戻し（U9）は `proposed` を受理するので通る。差し戻しは proposal の出し直しを招くので、決定2 の失効がそこで効く。**失効するのは proposal が出し直された時点であって、差し戻しを送った時点ではない**——AI が応答を返さずに終わったときは、判断は残ったままでよい

## Migration Plan

段の入れ替えはサーバー側で完結し、保存された `state.json` の形は**足す方向にしか変わらない**（`decision` は任意のフィールド）。既存のセッション・既存のプロジェクトはそのまま読める。

- 展開の順序に制約は無い。判断のフィールドを持たない既存のセッションは「判断が記録されていない」として扱われ、承認からやり直せる
- 巻き戻すときは**読めるが、書き戻すと消える**。`stateSchema` は `phase` の `z.discriminatedUnion` で（`server/utils/stroke/session-store.ts:83-94`）、3つの分岐はいずれも strict でない `z.object`（:84・:85・:86-93）である。strict でないので `decision` を持つ `state.json` を旧実装が**読むことはできる**。ただし **zod は既定で未知のキーを strip する**ので、`readState` の `stateSchema.safeParse`（:152）を抜けた時点で `decision` は落ちている。`writeState` が書くのは parse 済みのオブジェクトなので（:212-214）、旧実装が一度読んで書き直したセッションからは `decision` が**消える**。残るのではなく黙って失われる、が正しい。実害は「そのセッションは判断が記録されていないものとして扱われ、承認からやり直しになる」ことに留まり、proposal もストロークの往復の記録も無事である——**この点は実装時に実測で確かめる**（tasks 1.2）
  - **実測（2026-09-01・zod 4.4.3）。** `decision` を知らない旧スキーマで `decision` を持つ `state.json` を `safeParse` すると `success: true`、parse 後のキーは `phase, currentQuestion, invocation, retries` で `decision` は落ちている。**読めるが、書き戻すと消える**で正しい。記述はこのまま

## 上位資料への整合反映（ユーザー承認が要る）

`docs/agents/issue-tracker.md`「更新対応」により、**承認を得るまで上位資料を書き換えない**。以下を提案として置く。

1. **`docs/specs/api/contract.md` の U10（:162-176）** — 承認が改名と起動まで行う記述を、判断の記録だけに縮める。取り消し（`DELETE`）とエラーの一覧を足す
2. **同 U14 の追加** — 昇格の受け口を一覧（:43 の表）と本文に足す
3. **同 U12（:196）** — 昇格の直後に `invocation` が `failed` になること（決定4）を、巡回の説明に1行足す
4. **`docs/specs/plan/portal-stroke-exit.md`「承認ボタン → 一覧へ戻る」** — steering を起こす主体が承認の endpoint でなくなる。ADR-0011 の確定先なので、**自動で始まること自体は変えない**ことを明記したうえで、起こす側の記述を直す
5. **ADR を起こすかどうかの決め** — 「承認の判断・昇格・起動を段として分ける」は後から変えにくい決めにあたるかもしれない。**独断で立てない。ユーザーに諮る**

### ticket / ADR-0017 の記述との食い違い（報告のみ）

ticket と ADR-0017「separate-approval-decision-from-promotion」節は、`update-ui-approval-review` との順序の依存を挙げている。**実測ではこの2つは別の承認を扱っており、依存は無い**（proposal.md「ticket が挙げる押し間違いの根拠は、この画面には当たらなかった」）。ADR-0017 の「親との関係」を直すかどうかは**ユーザーに諮る**。ここでも独断で ADR を書き換えない。

なお、**完了判定4項目そのものは変わらない**。この change はその4項目を満たす。根拠が1つ当たらなかっただけである。

## Open Questions

- **取り消しを画面のどこに、どう出すか。** specs は「昇格の前なら取り消せる」ことしか求めていない。面の置き方は後続で決める（Non-Goals）
- **承認の直後に昇格を自動で続ける既定を、後から人の操作へ変えるか。** 変えても specs は満たす。今の体験を変えないことを優先して既定を自動にしている（決定5）
