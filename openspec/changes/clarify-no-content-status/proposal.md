## Why

コードに書いてある応答コードが、実際に返る値と違う。

| 見る場所 | 値 |
| --- | --- |
| コード（`setResponseStatus(event, 200)`） | 200 |
| 資料（`docs/specs/api/contract.md`） | 204 |
| 実際にワイヤへ出る値 | 204 |

h3 では `return null` が `sendNoContent` を呼び、そこで `statusCode` が 200 のときだけ捨てられて 204 になる。書いてある 200 は効いていない。

実害が出ている。`rename-api-contract-doc` のレビューで独立レビュアーの 1 体が「`本文なし（204）` は誤り。実装は `setResponseStatus(event, 200)` なので 200 のはず」と MEDIUM で指摘した。実測して否認したが、コードを読む限り誰でも同じ誤りをする。

`invoke-agent`（U13）はこれに加えてもう 1 つ問題を抱えている。GET でありながら `return null` によって 204 を返している。204 は操作を受理したことを表すもので、読み取りの応答に使うものではない。

## What Changes

- 本文なしの 7 ファイル（受理系 6 + `delete.post.ts`）の末尾を、web 標準形の `return new Response(null, { status: 204 })` の 1 行に置き換える。裸の `return null` と h3 の推測（null→204）への依存を無くし、status を自分で持った応答を 1 つの式で返す
- **BREAKING**: `invoke-agent`（U13）の応答を 204 から 200 に変える。GET が 204 を返さないようにする
- 応答コードの規約を `api/contract` の spec として定義する
- `docs/specs/api/contract.md` の U13 を 200 の記述に改め、A8 の表記ゆれを揃える

## Capabilities

### New Capabilities

- `api/contract`: 正常に成立した要求へ返す応答コードの規約。受理で完結する操作が本文を持たない応答（204）を返すことと、読み取り（GET）に 204 を使わないことを規定する。個別 endpoint の spec は自分の入出力だけを持ち、共通部分はここを参照する

### Modified Capabilities

なし。個別 endpoint の spec は応答コードを規定していない（`openspec/specs/` に 204 の記述は 1 件も無い）ため、既存 spec の変更は生じない。

## Impact

### 実装 — `server/api/strokes/[id]/` の 8 ファイル

h3 で 204 を返すには、応答コードを設定するだけでは足りず、応答を完了させる必要がある。h3 1.15.11 で 8 通りを実測した。

| 書き方 | 応答 | Content-Type |
| --- | --- | --- |
| `setResponseStatus(event, 204)` のみ | 404 | — |
| `setResponseStatus(event, 204)` + `return sendNoContent(event)` | **204** | 付かない |
| `setResponseStatus(event, 204)` + `event.node.res.end()` | 204 | 付かない |
| `setResponseStatus(event, 204)` + `return null` | 204 | 付かない |
| `setResponseStatus(event, 200)` + `return null`（現状） | 204 | 付かない |
| `sendNoContent(event, 204)` | 204 | 付かない |
| `return new Response(null, { status: 204 })` | 204 | 付かない |
| `setResponseStatus(event, 204)` + `return ''` | 204 | `text/html` |

採用するのは 7 行目（`return new Response(null, { status: 204 })`）である。末尾の 2 行を 1 行に置き換える。

```ts
// 変更前
setResponseStatus(event, 200)
return null

// 変更後
return new Response(null, { status: 204 })
```

web 標準（fetch handler 方式）の形である。status も本文も自分で持った `Response` を 1 つの式で返すため、h3 の推測は入らず、書いた 204 がそのまま応答になる。status の設定と応答の返却が set と return に分かれない。

h3 はハンドラの戻り値が web `Response` のとき `sendWebResponse` で送出する（`:2103-2104` → `:942`）。status は `Response` から反映され（`:950-955`）、本文が無ければ `res.end()` で応答を完了させる（`:962-964`）。

| ファイル | 変更 | 応答 |
| --- | --- | --- |
| `answer.post.ts:43` | 末尾 2 行 → `return new Response(null, { status: 204 })` | 204（変化なし） |
| `send-back.post.ts:23` | 同上 | 204（変化なし） |
| `question.post.ts:37` | 同上 | 204（変化なし） |
| `proposal.post.ts:55` | 同上 | 204（変化なし） |
| `approve.post.ts:89` | 同上 | 204（変化なし） |
| `submission.post.ts:24` | 同上 | 204（変化なし） |
| `delete.post.ts:33` | `return null` → `return new Response(null, { status: 204 })` | 204（変化なし） |
| `invoke-agent.get.ts:74` | `return null` → `return {}`（`setResponseStatus` は 200 のまま） | **204 → 200** |

`invoke-agent` は本文を返す経路（h3 の JSON 送出 `:2129`）へ回す。この経路では `setResponseStatus(event, 200)` が捨てられないので、書いてある 200 が返る。

`delete.post.ts:33` は `setResponseStatus` を持たず `return null` だけである。U11 は `api/contract` が規定する操作に含めないが、置き換えても応答は 204 のまま変わらず spec に影響しないため、裸の `return null` を無くす対象には含める。

### `invoke-agent` の応答を変えてよいことの担保

呼び出し元 7 箇所を確認した。**すべて戻り値を受け取っておらず、成否（例外の有無）だけを見ている。**

| 呼び出し元 | 使い方 |
| --- | --- |
| `app/composables/useWaitingRetry.ts:68` | `await $fetch(...)` |
| `app/composables/useAgentQuestion.ts:118` | `await $fetch(...)` |
| `app/composables/useProposalReview.ts:308` | `await $fetch(...)` |
| `app/pages/strokes/[sessionId]/index.vue:119` | `await $fetch(...)` の後に `waitingRetry.startWaiting()` |
| `app/pages/strokes/index.vue:33` | `await $fetch(...)` |
| `server/plugins/01.retry-failed.ts:70` | `await $fetch(invokePath(...))` |
| `server/api/strokes/[id]/approve.post.ts:76` | `$fetch(invokePath(...)).catch(...)` |

### 資料 — `docs/specs/api/contract.md` の 2 箇所

204 の記述は正しいので変えない。

| 箇所 | 現状 | 変更 |
| --- | --- | --- |
| `:23` `:110` `:117` `:124` `:140` `:195` `:201` | `本文なし（204）` | 変更なし（正） |
| `:169`（U13） | `output: 本文なし` | 200 を返す記述に改める |
| `:213`（A8） | `output: 本文なし` | `本文なし（204）` に揃える |

`:139` は U11 の `input: 本文なし` なので対象外。

### 影響しないことを確認した範囲

- `app/` `test/` `e2e/` — 204 の記述なし。応答コードに依存した分岐は無い
- 他の change の `tasks.md`（`rename-api-contract-doc` / `align-settings-conventions`）— 完了済みの作業記録なので触らない
- 依存 — なし
- endpoint の path とメソッド — 変更しない
