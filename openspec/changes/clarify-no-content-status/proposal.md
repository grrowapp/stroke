## Why

コードに書いてある応答コードが、実際に返る値と違う。

| 見る場所 | 値 |
| --- | --- |
| コード（`setResponseStatus(event, 200)`） | 200 |
| 資料（`docs/specs/api/contract.md`） | 204 |
| 実際にワイヤへ出る値 | 204 |

h3 はハンドラが `null` を返すと `sendNoContent` を呼び、そこで **200 だけを明示的に捨てて** 204 にする。コードの `200` は効かない。

実害が出ている。`rename-api-contract-doc` のレビューで独立レビュアーの 1 体が「`本文なし（204）` は誤り。実装は `setResponseStatus(event, 200)` なので 200 のはず」と MEDIUM で指摘した。実測して否認したが、コードを読む限り誰でも同じ誤りをする。

204 は h3 の規定である。返す本文が無い応答は 204 とする、というのが h3 の振る舞いであり、ハンドラが `null` を返す限りそうなる。**ただしそれは操作の話である。** 204 は「操作を受理し、返す本文が無い」ことを表すもので、読み取りである GET の応答に使うものではない。現状 `invoke-agent`（U13）は GET でありながら `return null` によって 204 を返している。

根にあるのはもう一段深い。**応答の形は API 全体の共通規約なのに、規約として定義された spec が無い。** `contract.md` は `## 全体設計:23` と `## 約束:233-243` に横断規約を置いているが、`openspec/specs/api/` は endpoint 単位の spec しか持たず、応答コードの記述は 1 件も無い。規約は資料と実装だけが持っており、片方が動いたときに食い違う。今回の食い違いはその現れである。

## What Changes

### 1. 返す応答コードを数字で明示する

7 ファイルから `setResponseStatus(event, 200)` と `return null` の組み合わせをやめ、返したい値を数字で書く。受理で完結する 6 本は `return sendNoContent(event, 204)`、読み取りの 1 本は 200 とする。応答は `invoke-agent` を除いて変わらない。

### 2. 読み取りの応答から 204 をなくす

- **BREAKING**: `invoke-agent`（U13）の応答が 204 から 200 に変わる。GET は読み取りであり、204 を返す筋が無い

### 3. 応答の規約を capability として定義する

`api/contract` の spec に、受理で完結する操作が 204 を返すこと・読み取りに 204 を使わないこと・エラーの区分（404 / 409 / 400 / 500 / 503 / 502 を返さないこと）・失敗したときに中途半端な状態を残さないことを置く。

### 4. 資料の表記を揃える

`docs/specs/api/contract.md` の U13 を 200 の記述に改め、A8 の表記ゆれを他の 6 箇所と揃える。

## Capabilities

### New Capabilities

- `api/contract`: 画面・エージェントとサーバの境界に一様にかかる応答の規約。受理で完結する操作が本文を持たない応答（204）を返すこと、読み取り（GET）に 204 を使わないこと、エラーの区分、および失敗したときに中途半端な状態を残さないことを規定する。個別 endpoint の spec は自分の入出力だけを持ち、共通部分はここを参照する

### Modified Capabilities

なし。個別 endpoint の spec は応答コードを規定していない（`openspec/specs/` に 204 の記述は 1 件も無い）ため、既存 spec の変更は生じない。

## Impact

### 実装 — `server/api/strokes/[id]/` の 7 ファイル

起点は「`setResponseStatus(event, 200)` が書かれているのに 204 が返る」ことである。原因は 2 つの行の組み合わせにある。`return null` が h3 を `sendNoContent` へ導き、そこで `setResponseStatus` の 200 が捨てられる。

**両方をやめ、返したい値を数字で当てる。**

```ts
// 変更前
setResponseStatus(event, 200)
return null

// 変更後
return sendNoContent(event, 204)
```

こう書く理由は 3 つある。

- **数字が効く。** `sendNoContent` は渡された code をそのまま使う。204 と書けば 204 が返り、捨てられる値がコードから消える
- **返したい応答が名前で読める。** `sendNoContent` は「本文を返さない」を意味する。`return null` は「本文が無いから h3 が 204 にしてくれる」という間接的な表現で、h3 の規定を知らないと読めない
- **`return null` に依存しなくなる。** 現状は返り値の型が応答コードを決めている。数字を直接渡せば、その対応関係を読み手が知らなくてよい

`return sendNoContent(...)` が成立することは h3 のソースで確認した。app レイヤー（`:2017-2038`）は、ハンドラの戻り値が `undefined` のとき `handleHandlerResponse` を呼ばず、`event.handled`——`sendNoContent` が `res.end()` を済ませている——を見て正常終了する。

対象は起点の食い違いを持つ 7 本である。

| ファイル | 現状 | 変更後 | 応答 |
| --- | --- | --- | --- |
| `answer.post.ts:43-44` | `setResponseStatus(event, 200)` + `return null` | `return sendNoContent(event, 204)` | 204（変化なし） |
| `send-back.post.ts:23-24` | 同上 | 同上 | 204（変化なし） |
| `question.post.ts:37-38` | 同上 | 同上 | 204（変化なし） |
| `proposal.post.ts:55-56` | 同上 | 同上 | 204（変化なし） |
| `approve.post.ts:89-90` | 同上 | 同上 | 204（変化なし） |
| `submission.post.ts:24-25` | 同上 | 同上 | 204（変化なし） |
| `invoke-agent.get.ts:73-74` | 同上 | `setResponseStatus(event, 200)` + `return {}` | **204 → 200** |

`delete.post.ts:33` も `return null` で 204 を返しているが、**触らない**。U11 は `api/contract` が規定する操作に含めないため、この change で扱う対象から外れる。

`invoke-agent` だけは起点の食い違いに加えて、GET でありながら 204 を返しているという別の問題を持つ。読み取りに 204 を返す筋が無いので 200 とする。本文を返す endpoint なので `sendNoContent` は使えず、`return {}` で h3 の JSON 送出（`:2129`）を通す。ここでも数字は `setResponseStatus(event, 200)` で明示する——`send` を通る経路では 200 が捨てられないため、この行は効く。

返り値を変えてよいことの担保として、この endpoint の呼び出し元 7 箇所を確認した。**すべて戻り値を受け取っておらず、成否（例外の有無）だけを見ている。**

| 呼び出し元 | 使い方 |
| --- | --- |
| `app/composables/useWaitingRetry.ts:68` | `await $fetch(...)` |
| `app/composables/useAgentQuestion.ts:118` | `await $fetch(...)` |
| `app/composables/useProposalReview.ts:308` | `await $fetch(...)` |
| `app/pages/strokes/[sessionId]/index.vue:119` | `await $fetch(...)` の後に `waitingRetry.startWaiting()` |
| `app/pages/strokes/index.vue:33` | `await $fetch(...)` |
| `server/plugins/01.retry-failed.ts:70` | `await $fetch(invokePath(...))` |
| `server/api/strokes/[id]/approve.post.ts:76` | `$fetch(invokePath(...)).catch(...)` |

応答が 204 から 200 に、本文が無しから `{}` に変わっても、これらの呼び出しは影響を受けない。実装後に画面から起動を通して確かめる。

### 資料 — `docs/specs/api/contract.md` の 2 箇所

204 の記述は正しいので変えない。

| 箇所 | 現状 | 変更 |
| --- | --- | --- |
| `:23` `:110` `:117` `:124` `:140` `:195` `:201` | `本文なし（204）` | 変更なし（正） |
| `:169`（U13） | `output: 本文なし` | 200 を返す記述に改める |
| `:213`（A8） | `output: 本文なし` | `本文なし（204）` に揃える |

`:139` は U11 の `input: 本文なし` なので対象外。

### 影響しないことを確認した範囲

- `app/` `test/` `e2e/` — 204 の記述なし。応答コードに依存した分岐は無い（invoke-agent の 200 化で壊れる箇所は無い見込みだが、実測で確認する）
- 他の change の `tasks.md`（`rename-api-contract-doc` / `align-settings-conventions`）— 完了済みの作業記録なので触らない
- 依存 — なし
- endpoint の path とメソッド — 変更しない
