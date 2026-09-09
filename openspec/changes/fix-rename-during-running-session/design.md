## Context

動機と根本原因は proposal.md「Why」。ここでは形を決めるのに要る現状だけを置く。

- A7（`proposal.post.ts`）は「残す → phase を `proposed` に書く → W2 へ publish」を1つの handler で行う。A5（`question.post.ts`）は「今の1問を書く → W1 へ publish」。どちらも claude のプロセスが走っている最中に呼ばれる
- invokeAi（`ai.ts`）は子プロセスの output stream で完了を検知し、`didWork`（その実行で提出があったか）を確かめてから `invocation` を `idle`/`failed` に書く。steering では `idle` の前に完成の記録（U15）を叩く——**決着を invokeAi が行う形は既に steering に在る**
- 提出の記録は `submission-signal.ts` が持つ。ストロークはセッション単位の件数（`submittedSince`）、steering は起動 token 単位（`submittedByLaunch`）
- busy を返すのは U13（`beginRun`）・U14（`beginRun`）・U11 と P1（`isRunning`）。キーは作業場所の実体（`dev:ino`）。`running.test.ts` は「design.md D2」（本 design の Decision 2）を参照している
- 画面2 は phase `proposed` で開き、承認の操作を出す。承認ボタンの無効化は差し戻し・問い返しの待機（自分の操作）から導いている

## Goals / Non-Goals

**Goals:**

- 提出を受ける endpoint の責務を「記録」に限り、実行の決着（phase の切り替え・配信）を invokeAi に置くこと
- phase `proposed` が実行の終わりにしか立たないこと。承認できる局面と実行中が同時に存在しないこと
- 「実行中だから受理しない」（409 busy）が契約に無いこと
- 同じ対象で2つの呼び出しが同時に走らないこと（これは変えない）

**Non-Goals:**

- リロード・複数タブ・サーバの再起動に由来する状態の扱い（後始末の問題。別に扱う）
- `useWaitingRetry` のポーリング撤去（`replace-polling-with-push` の本題）
- A7 を `submission` へ寄せること（ADR 0019 で言及される未確定事項。本 change は path を問わない規定にする）

## Decisions

### Decision 1: 提出の endpoint は記録だけ。実行の決着は invokeAi が完了時に行う

A5/A7 は提出を記録して受理を返す。phase を書かず、publish しない。invokeAi は完了を検知し、`didWork` を確かめた後、`idle` を書く前に**決着**する。

- 決着の内容は、その実行で提出されたものから導く。問い → W1 へ配信（phase は変えない）。proposal → phase `proposed` を書き、W2 へ配信
- 何が提出されたかは、起動 token 単位で記録する（`submission-signal.ts`。steering の `submittedByLaunch` と同型）。A5/A7 が受理時に token に紐づけて記録し、invokeAi が完了時に読む。件数（`submittedSince`）はこれで置き換わる
- 決着は steering の完成の記録（U15）と同じ位置——`runBuiltInvocation` の、`didWork` を確かめた後・`idle` を書く前——に置く。用途の違いは渡す関数の違いだけで表す（`agent/invocation`「起動処理は呼び出し元を区別しない」）。`buildRun` がストロークの起動に `settle`（決着）を渡し、steering には `recordCompletion` を渡す
- 決着の書き込みも endpoint を通す（`agent/invocation`「書き込みは endpoint を通してのみ」の原則。U15 と同じ）。phase を `proposed` に書く endpoint を1つ持ち、invokeAi だけが叩く。ADR-0014 に反しない——invokeAi は「この実行で proposal が提出された」を自分の記録から知っており、endpoint に判断させない
- 決着の前に実行が失敗した（タイムアウト・異常終了）ときは決着しない。提出は記録として残るが phase は変わらない。**失敗した実行の扱いは既存の規定のままである**（`agent/invocation`「失敗はサーバ側でリトライし、ユーザーに見せない」「リトライ上限に達したら error に変える」）——巡回が起こし直し、上限に達したら `error` として画面がユーザーへ引き渡す。決着が加わってもこの経路は変わらない

代替: 「A7 は記録し、phase の切り替えだけ invokeAi へ」（配信は A7 に残す）——配信された proposal を画面が表示するのに phase が `stroking` のままでは、画面1 が画面2 へ送る条件（phase）と配信（W2）が食い違う。配信も決着に含める方が単純。

代替: 「A7 の受理を実行の終わりまで遅らせる」——endpoint が実行の終わりを待つことになり、責務がさらに混ざる。

### Decision 2: 直列化のキーは作業場所ディレクトリの実体（`stat` の `dev`/`ino`）

`running.test.ts` が「D2」として参照するのはこれ。busy を消しても、同じ対象を同じ対象と認識する単位は要る（U13 の冪等の判定に使う）。

- id をキーにすると、昇格の改名で uuid → プロジェクト名に変わった瞬間、同じディレクトリが別物になる。inode は改名で変わらない
- キーの導出（`keyOf`）は1箇所に置く。endpoint ごとに別の導出を持つと、同じディレクトリが endpoint によって別物に見える
- `stat` に失敗したら投げる。既定値で補って別のキーに落ちる経路を作らない
- 解放は取得時に返したキーで行う。実行中に改名・削除されても `stat` し直さずに外せる

### Decision 3: 画面2 の承認の可否は phase だけから導く

phase `proposed` が決着でしか立たない（Decision 1）ので、承認の操作を phase で出す現状の形が正しくなる。`invocation` を画面へ push する必要は無い。差し戻し・問い返しの待機表示（自分の操作から導く）はそのまま——それは「待っていることを示す」ためのもので、承認の可否の根拠ではない。

### Decision 4: 409 busy を契約から消す。U13 は冪等

- U13: 対象が実行中なら、要求は満たされているものとして受理し、新しい呼び出しを開始しない（200）。画面が起動を要求できる局面（回答・差し戻し・承認後）はすべて前の実行の決着の後なので、実行中の対象に**新しい**実行を求める要求は存在しない。届くのは同じ意図の重複（承認後の画面のキックと巡回のキック）だけ
- U14・U11・P1: 実行中に届く経路が無い。`isRunning` の分岐と `busy` を外す。届いたら（後始末の問題に由来する状態）、内部の直列化が取れないことを欠陥として失敗で返し、握りつぶさない（ADR 0022）。409 `busy` という理由は持たない
- `conflict.ts` の `ConflictReason` から `busy` を消す。`useWaitingRetry` の `pendingRun`・`BUSY_RETRIES` を消す

### Decision 5: 決着の書き込みは endpoint を通す

phase を `proposed` に書く口を invokeAi 専用の endpoint として持つ（A8・U15 と同じ規律）。A7 から phase の書き込みを外した分がここへ移る。W1/W2 の publish は決着の中で行う（U15 が完成の配信を行うのと同じ）。

代替: invokeAi が `writeState` を直接呼ぶ——書き込み口が2つになり「endpoint を通してのみ」が崩れる。

### Decision 6: 承認画面は失敗の理由を握りつぶさない（ADR 0022）

`promote()` の失敗は理由ごとに分ける。`name-conflict` は名前の入れ直し、500 は昇格のやり直し／破棄。それ以外はサーバの文言をそのまま失敗に出す。busy は無い。

### Decision 7: `ui` artifact は作らない

画面の見た目は変わらない。画面2 が開く時点が実行の終わりへ動くだけで、部品は既存のまま。

## docs・ADR への反映

上位資料への整合反映は change の責務範囲だが、承認前に書き換えない（`docs/agents/issue-tracker.md`「更新対応」）。

### ADR — 承認・登録済み

`docs/adr/0022-no-one-swallows-a-response.md`「応答の握りつぶしは、いかなる者にも許されない」。本 design で提案し、2026-09-09 に承認を得て登録した。Decision 6 の根拠。

### docs — 提案中（承認待ち）

| docs | 直す内容 |
|---|---|
| `docs/specs/api/contract.md` A5 | 記録だけ。配信は実行の決着で行われる |
| `docs/specs/api/contract.md` A7 | 「順序は『残す → phase を進める → W2 配信』」→「残すだけ。phase と配信は実行の決着で行われる」 |
| `docs/specs/api/contract.md` W1/W2 | 配信タイミング「A5/A7 の受理」→「その提出を行った実行の決着」 |
| `docs/specs/api/contract.md`「約束」 | `409 busy` の行を消す。「多重起動を止めるのは起動側」→「起動は冪等。実行中の対象への要求は満たされている」 |
| `docs/specs/api/contract.md` U13 | 冪等であること |
| `docs/specs/api/sessions/invoke-agent.md`・`promote.md`・`delete.md`、`docs/specs/api/projects/delete.md` | エラー表から 409 busy を消す。`promote.md`「実行中は受理しない」の節を「昇格は実行の決着の後にしか要求されない」へ |
| `docs/specs/api/sessions/activate.md` | 「busy を見ない」の表現を、U15 が実行中に叩かれる前提の説明へ |
| `docs/specs/architecture/question-flow.md` | 図の「A7 で phase=proposed」→「実行の決着で phase=proposed」。「提出時配信」→「決着時配信」 |

Decision 1・4・5 はこの改訂を前提にしている。承認を得てから docs を直し、tasks へ進む。

## Risks / Trade-offs

- [決着の endpoint を invokeAi 以外が叩ける] → A8・U15 と同じ規律で、規定と docblock で禁じる。認可の仕組みは持たない（既存と同じ）
- [W1/W2 の配信が実行の終わりまで遅れる] → claude の終了処理の分（数秒〜十数秒）だけ画面に届くのが遅れる。承認できる局面が正しい時点に揃う代償として受け入れる
- [`replace-polling-with-push` と `useWaitingRetry` で衝突] → 本 change は `pendingRun`・`BUSY_RETRIES` の削除だけ。順序はユーザー判断
- [U13 が冪等になることで、正当な「次の実行」の要求が捨てられる] → 正当な次の実行の要求は決着の後にしか出ない（Decision 4）。E2E で「問いの提出 → 決着前は回答の操作が無い → 決着 → 回答 → 起動」を固定する

## Migration Plan

1. サーバ: `submission-signal.ts` を起動 token 単位の内容付き記録へ。A5/A7 を記録だけに
2. サーバ: 決着の endpoint と、invokeAi の完了時の決着（`buildRun` が渡す `settle`）
3. サーバ: `busy` を消す。U13 を冪等に。U14・U11・P1 の `isRunning` 分岐を外す
4. 画面: `useWaitingRetry` の `pendingRun`・`BUSY_RETRIES` を消す。`promote()` の失敗理由の分岐
5. docs の反映（承認後）

ロールバックは change 単位。A7 の責務と W2 の配信時点が同時に変わるので、サーバと画面を別々に戻さない。

## Open Questions

なし。
