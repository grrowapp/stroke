## Context

動機は proposal.md「Why」を見よ。ここは、ソースを読んで確かめた現状と、そこから決めた
approach だけを書く。

読んだもの（`/home/vagrant/work/stroke-board/pre5`、2026-09-01 時点）。

- `server/utils/stroke/invoke.ts` — `kick` / `buildRun` / `mcpConfigFor`
- `server/utils/stroke/ai.ts` — `invokeAi`
- `server/api/strokes/[id]/invoke-agent.get.ts` — U13
- `server/plugins/01.retry-failed.ts` / `server/utils/stroke/sweep.ts` — 巡回
- `server/utils/readiness.ts` — 前提チェック
- `server/utils/config.ts` — `readServerConfig`
- `server/utils/stroke/config.ts` — `readStrokeConfig`

確かめた事実は4つ。

1. **`invocation` を書くのは `invokeAi` の中だけである。** 書き手（`setInvocation`）は
   `AiRun` の一部で、`buildRun` が組み立てて返す。`buildRun` が throw すると
   `invokeAi` は呼ばれず、`running` も `failed` も `error` も1つも書かれない。
   `kick` は接続表 token を消して `Promise.reject` を返すだけである。
2. **U13 は `kick(...)` を待たない。** `.catch` でログに落として `setResponseStatus(200)`
   を返す。したがって組み立ての失敗は、`$fetch` する側（巡回の try/catch、承認処理の
   `.catch`、画面）からは成功と区別できない。
3. **巡回は `failed` しか拾わない**（`shouldRetry`）。記録が `idle` のままなら永久に
   拾われない。
4. **前提チェックは組み立ての一部だけを先回りしている。** `missingPrerequisites()` は
   `readStrokeConfig()` を呼び、失敗すれば U13 は 503 で止まる。よって `buildRun` の
   `readStrokeConfig()` は実際にはほぼ 503 で先に潰れる。一方 `mcpConfigFor` が呼ぶ
   `readServerConfig()`（steering 工程のみ）は前提チェックが見ていない読み出しで、
   現在の実装に throw する枝は無いが、**検証の網の外にある**。

したがってこの change は「今日必ず再現する不具合を直す」ものではなく、**組み立て段で
throw が起きたときに記録が1つも残らないという構造の穴を塞ぐ**ものである。穴が開いて
いる限り、組み立て段に読み出しや検証が1つ足されるたびに、`idle` のまま止まる経路が
静かに増える。

## Goals / Non-Goals

**Goals:**

- 組み立て段で終わった実行にも、起動して失敗した実行と同じ形の記録を必ず残す
- 起動を要求した側が、組み立ての失敗を応答から知れるようにする
- 記録を残したうえで、直らない原因に対して巡回が永久に回り続けないようにする

**Non-Goals:**

- 組み立てが失敗する原因そのもの（設定の不備・環境の不足）を直すこと。それは前提
  チェックと設定の資料が受け持つ
- 前提チェック（`missingPrerequisites`）の検査項目を増やすこと。`readServerConfig()`
  を検査へ加えるかは別の判断で、この change では扱わない
- 成功経路と、すでに `failed` / `error` を書いている経路の振る舞いを変えること
- `invocation` の値を増やすこと。4値のままとする

## Decisions

### D1. 記録の書き手は `invokeAi` のままにする。新しい書き手を作らない

**決定**: 組み立て（`buildRun`）を `invokeAi` の**内側**へ移し、組み立ての失敗を、
記録の書き手が居る側で受け止める。`kick` は組み立て済みの `AiRun` ではなく「組み立て方」
を渡す形にする。記録の書き込みはこれまでどおり A8（`POST /api/strokes/:id/submission`）
を通る。

**なぜ**: 「`invocation` を書くのは `invokeAi` だけ」は4箇所に書かれた規定である。

- `openspec/specs/agent/invocation`「実行の記録は invocation の4値で持つ」
- `openspec/specs/api/stroke/submission`
- `docs/specs/api/contract.md`（一覧の A8 行・本文・A8 の節の3箇所）
- `docs/specs/architecture/session-workflow.md`

`kick` や U13 に A8 を叩かせると、この4箇所すべてを書き換えることになる。**規定を
広げずに済むなら広げない。** 書き手を1つに保つことは、この規定が守ろうとしている
ものそのものである。

**退けた案 — `kick` が A8 を直接叩く**: 変更は小さいが、書き込み口が2つになる。
上の4箇所を「invokeAi と、その手前で組み立てに失敗した経路」へ書き換える必要が生じ、
docs の改定（ユーザー承認）を2本抱え込む。得るものに対して代償が大きい。

**退けた案 — U13 が組み立てを試してから `kick` を呼ぶ**: 組み立てが2回走る。2回目が
1回目と違う結果になったときの扱いが決まらず、接続表 token の発行位置も曖昧になる。

### D2. 応答は既存の 503 を使う。新しいステータスを増やさない

**決定**: 組み立てに失敗した起動要求は 503 で返す。理由の文言を添える。

**なぜ**: `docs/specs/api/contract.md` の U13 は 404 / 409 / 503 の3つだけを持つ。
503 の意味は既に「AI を起動できる状態にない」で、画面はこれを**環境か設定を直すまで
通らない**ものとして読む（409 の「待てば通る」と対にした区別が
`invoke-agent.get.ts` の冒頭に書かれている）。組み立ての失敗はまさにこの性質であり、
新しいステータスを足す理由が無い。

- 409（busy）は「待てば通る」。組み立ての失敗は待っても通らないので当たらない
- 400・404 は要求側の誤りを指す。組み立ての失敗はサーバ側の状態である
- 500 を新設すると、意味の近い 503 と使い分けの規則を新たに決めることになる

**必要な整合反映**: contract.md の U13 のエラー行が 503 を「前提が欠けている」だけで
説明しているので、組み立ての失敗も含む形へ1行広げる。下の「上位資料への整合反映
（提案）」に置く。**承認前に書き換えない。**

### D3. 組み立ての失敗も回数に数え、上限に達したら終端へ倒す

**決定**: 組み立てに失敗した実行は、起こし直しの回数を1つ進めたうえで記録する。
上限に達しているとき、または上限そのもの（設定値）を読み出せないときは、`failed`
ではなく `error`（終端）にする。

**なぜ**: 記録を `failed` にするだけだと、巡回が60秒ごとに拾って起こし直し、
組み立てが同じ理由で失敗し、また `failed` に戻る。`invokeAi` の上限判定は組み立ての
後ろにあるため一度も通らず、回数も進まない。**永久に `idle` で止まる詰まりを、
永久に回り続けるループへ置き換えるだけになる。** 回数を進め、上限で終端へ倒すことで
初めて、proposal の「巡回が拾えるようにする」が終わりを持つ。

上限そのものが読み出せない場合を `error` にするのは、上限を知らないまま `failed` に
すると同じ無限ループへ戻るためである。`error` は終端だがユーザーの再実行（`?reset=1`）
で戻せるので、放置よりも回復の手が用意されている。

**退けた案 — 常に `failed`**: 上のとおり終わらない。

**退けた案 — 常に `error`**: 一過性の失敗まで即座にユーザーの手を要求する。
proposal が求めた「巡回が拾えるようにする」に正面から反する。

### D4. 受理しなかったときも busy ガードは必ず解く

**決定**: U13 が受理せずに返すとき、`beginRun` で立てた実行中フラグを必ず落とす。

**なぜ**: 落とし損ねると、その対象は以後すべての起動要求が 409 になる。`idle` で
止まる詰まりを 409 で止まる詰まりに替えることになり、直したことにならない。現在の
`.finally(() => endRun(sessionId))` が担っている対称性を、応答の形を変えた後も保つ。

### D5. 再現テストは「組み立てが失敗する」を注入して書く

**決定**: 組み立ての失敗は、既存テストと同じ形——設定のモジュールをモックして
`readStrokeConfig()` を throw させる——で作る（`test/server/utils/stroke/invoke.test.ts`
の `config.broken` が既にこの形を持つ）。実際の設定不備を再現しようとしない。

**なぜ**: D-Context 4 のとおり、実運用で組み立て段まで到達する失敗は前提チェックを
すり抜けたものだけで、狙って作るのが難しい。塞ぐのは「throw が起きたときに記録が
残らない」という構造であって、特定の原因ではない。テストも構造に当てる。

## 上位資料への整合反映（提案 — 承認前に書き換えない）

`docs/agents/issue-tracker.md`「更新対応」に従い、提案としてここに置く。

- **`docs/specs/api/contract.md` L221（U13 のエラー行）**
  - 現在: `エラー: 404 セッションなし / 409 busy（実行中の多重起動）/ 503 前提が欠けている`
  - 提案: 503 の説明を「前提が欠けている、または起動の材料を組み立てられない」へ広げる
- **`docs/specs/api/contract.md` L210–212（U13 の output と「受理で即完結する」）**
  - 提案: 「組み立てに失敗したときは受理せず 503 を返す。受理したときの応答が即完結する
    性質は変わらない」の一文を足す

いずれも1〜2行の追記で、U13 の既存の約束（受理は即完結・cwd は呼び出し側が渡す・
`reset` の扱い）は変えない。`docs/specs/api/contract.md` の A8 の節、および
`docs/specs/architecture/session-workflow.md` は **D1 により変更不要**である。

## Risks / Trade-offs

- **組み立てを `invokeAi` の内側へ移すと、接続表 token の発行・削除の対称性が変わる**
  → token の発行・登録は spawn の手前という現在の性質を保ち、削除は1本の `.finally`
  に集約する。`invoke.test.ts` の「buildRun が同期的に throw してもエントリが消え、
  reject した promise が返る」を、新しい形に合わせて残す（消さない）
- **上限が読めないときに `error` へ倒すと、一過性の読み出し失敗でも終端になる**
  → 終端はユーザーの再実行で戻せる。`idle` で永久に止まるより回復の手が多い
- **U13 が 200 以外を返すようになる**
  → 呼び出しは4箇所（`app/pages/strokes/index.vue`・`app/composables/useWaitingRetry.ts`・
  `app/composables/useProjectApi.ts`・`server/plugins/01.retry-failed.ts`・
  `server/api/strokes/[id]/approve.post.ts`）。いずれも既に前提欠如の 503 を受け取り
  うる経路で、新しい分岐は足さない。足す必要が出たらそれは想定外なので、実装の前に
  止まる
- **前提チェックとの二重化**
  → 設定不正は 503（前提チェック）で先に止まり、組み立て段の防御は普段は働かない。
  重複した守りであることを承知のうえで置く。網の外にある読み出し
  （`readServerConfig()`）と、今後増える読み出しのための守りである

## Migration Plan

データ移行なし。デプロイ順序の制約なし。`invocation` の4値も `state.json` の形も
変えないため、既存のセッションはそのまま扱える。切り戻しは revert のみ。
