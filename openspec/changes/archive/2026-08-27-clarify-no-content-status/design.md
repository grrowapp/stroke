## Context

動機は proposal.md の Why を参照。ここでは、h3 が応答コードをどう決めるかと、そのどこに手を入れるかを説明する。

h3 1.15.11 のソース（`node_modules/h3/dist/index.mjs`）で経路が確定している。

### ハンドラの戻り値で分岐する

app レイヤー（`:2017-2038`）がハンドラの戻り値を受ける。

```js
const val = await layer.handler(event);
const _body = val === void 0 ? void 0 : await val;
if (_body !== void 0) {
  await handleHandlerResponse(event, _response.body, spacing);
  return;
}
if (event.handled) {
  return;
}
```

戻り値が `undefined` のときは `handleHandlerResponse` を通らず、`event.handled`——ハンドラの中で `res.end()` が済んでいるか——を見て正常終了する。`undefined` を返しても、応答を自分で書き終えていれば問題にならない。

戻り値が `undefined` でないときは `handleHandlerResponse`（`:2098`）が型で送り方を決める。

| 戻り値 | h3 の処理 | 応答 |
| --- | --- | --- |
| `null` | `sendNoContent(event)`（`:2100`） | **204** |
| web 標準 `Response` | `sendWebResponse(event, val)`（`:2103-2104` → `:942`） | **Response の status がそのまま** |
| オブジェクト | `send(event, JSON.stringify(val), MIMES.json)`（`:2129`） | **200** |
| 文字列 | `send(event, val, MIMES.html)`（`:2126`） | 200（Content-Type が html） |

### `sendNoContent` は 200 だけを捨てる

`:740`。code なしで呼ばれると、`statusCode` が **200 のときだけ** それを捨てる。

```js
if (!code && event.node.res.statusCode !== 200) {
  code = event.node.res.statusCode;
}
const _code = sanitizeStatusCode(code, 204);
event.node.res.writeHead(_code);
event.node.res.end();
```

code を渡した場合は `!code` が偽になり、渡した値がそのまま使われる。

### 現状の食い違い

現状の 7 ファイルは `setResponseStatus(event, 200)` + `return null` である。`return null` が `sendNoContent` を code なしで呼ばせ、そこで 200 が捨てられて 204 になる。**コードに書いた数字が応答に一切影響していない。**

## Goals / Non-Goals

**Goals:**

- 返す応答コードがコードから読めること。書いた数字が実際に効くこと
- 本文の無い応答で裸の `null` を返さないこと。h3 の推測に頼らず、status を自分で持った応答を返すこと
- 応答の規約に spec 上の持ち主を与えること
- 読み取り（GET）が 204 を返さないこと

**Non-Goals:**

- 受理で完結する操作の応答コードを変えること。204 のままである
- `docs/specs/api/contract.md` の 204 の記述を変えること。現状が正
- **endpoint の path とメソッドを変えること。** この change は応答コードだけを扱う
- **削除（U11）を spec の規定対象に加えること。** `api/contract` の対象操作には含めない。`delete.post.ts` はコードの置き換え（裸の `return null` の除去）だけを行い、応答は変えない
- 409 busy を画面がどう扱うか。それは `fix-busy-response-handling` の範囲

## 規約の置き場所

正常な応答コードの規約は `docs/specs/api/contract.md` の `## 全体設計:23` にある。

> POST は受理だけを返す（本文なし・204）。例外は U1（`sessionId` を返す）だけ。

`openspec/specs/api/` 側は endpoint 単位の構成しか持たず、この規約に対応する capability が無い。実際、`openspec/specs/` に応答コードの記述は 1 件も存在しない。規約は資料と実装だけが持っており、片方が動いたときに食い違う。今回の食い違いはその現れである。

`api/contract` はこの穴を埋める。扱うのは正常に成立した要求への応答コードだけとし、エラーの応答は含めない。個別 endpoint の spec は自分の入出力だけを持ち、共通部分はここを参照する。

## Decisions

### Decision: 末尾を `return new Response(null, { status: 204 })` の 1 行に置き換える

```ts
// 変更前
setResponseStatus(event, 200)
return null

// 変更後
return new Response(null, { status: 204 })
```

事故の根本は、裸の `null` を返して応答コードを h3 の推測——`null` を 204 に変換し、その際 200 を「未設定」とみなして捨てる——に委ねていたことにある。推測に頼る書き方自体を無くす。

web 標準（fetch handler 方式）の形である。Service Worker・Cloudflare Workers・`Deno.serve`・Next.js の route handler と同じく、status も本文も自分で持った `Response` を 1 つの式で返す。h3 の推測は入らず、status の設定と応答の返却が set と return に分かれない。

h3 は戻り値が web `Response` のとき `sendWebResponse` で送出する（`:2103-2104` → `:942`）。status は `Response` から反映され（`:950-955`）、本文が無ければ `res.end()` で応答を完了させる（`:962-964`）。h3 1.x の土台は Node 応答だが、この受け口は h3 自身が公開する正規の経路であり、web 標準ベースの h3 v2 にもそのまま通じる形である。

h3 1.15.11 で 8 通りを実測した。

| 書き方 | 応答 | Content-Type |
| --- | --- | --- |
| `setResponseStatus(event, 204)` のみ | **404** | — |
| `setResponseStatus(event, 204)` + `return sendNoContent(event)` | **204** | 付かない |
| `setResponseStatus(event, 204)` + `event.node.res.end()` | 204 | 付かない |
| `setResponseStatus(event, 204)` + `return null` | 204 | 付かない |
| `setResponseStatus(event, 200)` + `return null`（現状） | 204 | 付かない |
| `sendNoContent(event, 204)` | 204 | 付かない |
| `return new Response(null, { status: 204 })` | 204 | 付かない |
| `setResponseStatus(event, 204)` + `return ''` | 204 | `text/html` |

**却下した案: `setResponseStatus(event, 204)` + `return null`（当初の採用案）** — 書いた 204 は効く（`:744` で引き継がれる）が、`null` という本文でない裸の値を返し、h3 の推測に依存する骨格が残る。事故を起こした書き方そのものが温存される

**却下した案: `sendNoContent(event, 204)`** — h3 1.x の語彙としては自然な 1 文で動くが、h3 1.x 固有の関数に意図を預ける形になる。web 標準の handler 方式（status を持った応答を 1 つの式で返す）を正とし、フレームワーク固有の書き方をこれ以上増やさない

**却下した案: `setResponseStatus(event, 204)` + `return sendNoContent(event)`** — 動くが、status の設定と応答の完了が 2 文に分かれる

**却下した案: `event.node.res.end()` で完了させる** — 動くが、h3 を通さず Node の生 API を直接呼ぶことになる

**却下した案: `return ''` で完了させる** — 動くが `text/html` が付く。本文が無いのに型を名乗る

**却下した案: `setResponseStatus(event, 200)` の行だけを消す** — `return null` が残るので応答は 204 のままになる。しかしコードのどこにも 204 が現れず、裸の `null` と推測依存もそのまま残る

**却下した案: `200` を残して注記を足す** — 差分は最小だが、実際にレビューを誤らせた `200` の行がそのまま残る。コメントで誤りを覆う形になり、コメントを読み飛ばせば同じ誤解に戻る

### Decision: `delete.post.ts` も同じ形に置き換える

`delete.post.ts:33` も裸の `return null` で 204 を返しており、コードから 204 が読めない点は他と同じである。U11 は `api/contract` の規定対象に含めないが、置き換えても応答は 204 のまま変わらず spec に影響しない。裸の `return null` を無くす動機はこのファイルにも同じく当てはまるため、対象に含める。

### Decision: `invoke-agent`（U13）は 200 を返す

204 は「操作を受理し、返す本文が無い」ことを表すもので、読み取りの応答に使うものではない。`invoke-agent` は GET でありながら `return null` によって 204 を返している。

`return {}` に変え、`setResponseStatus(event, 200)` で数字を明示する。`send` を通る経路（`:2129`）では 200 が捨てられないため、この行は効く。

これは 7 ファイルのうちこれだけが振る舞いの変わる変更であり、proposal.md に BREAKING と明記した。呼び出し元 7 箇所がいずれも戻り値を使っていないことは proposal.md の表で確認済みである。

**却下した案: 204 のままにする** — GET が「返す本文が無い」を名乗ることになる。起動を受理したという結果は、読み取りの応答として 200 で表すのが筋である

### Decision: `contract.md` は 2 箇所だけ直す

204 の記述は正しいので変えない。ただし次の 2 箇所は他と不統一である。

- `:169`（U13）— `output: 本文なし`。200 を返す決定に合わせて改める
- `:213`（A8）— `output: 本文なし`。他の 6 箇所と同じ `本文なし（204）` に揃える

## Risks / Trade-offs

- **`invoke-agent` の応答が 204 から 200 に変わる（BREAKING）** → 呼び出し元 7 箇所がすべて戻り値を使っていないことを確認済み（proposal.md）。実測と画面操作でも確かめる
- **`invoke-agent` の本文が空のオブジェクトになる** → 返す情報が無いため。将来この endpoint が何かを返すなら、そのときは本文の設計が要る
- **受理系 6 本と delete は応答が変わらないため、変更が効いたかを応答コードだけでは確かめられない** → 変更前後で 204 のままであることが合格条件になる。加えて、コード上に 204 が現れ、`return null` が残っていないことを grep で確認する
- **`delete.post.ts` の変更に spec の裏付けが無い** → U11 は `api/contract` の規定対象外のまま置き換える。応答がワイヤ上で一切変わらないことが担保であり、変更前後の実測（1. と 4.）で確かめる
- **将来どれかが本文を返すよう変わるとき、書き換えを誤ると本文が黙って捨てられる** → `nullBodyResponses`（`:2477`）が 204 を本文なしと扱うため。ただし status と本文が `Response` の 1 つの式に集まっているので、この式ごと書き換えれば済み、status の消し忘れが構造上起きにくい
- **ソースを読んで確定させただけで、変更後の実測はしていない** → 実装後に実測するタスクを tasks.md に置く。実測結果（2026-08-27、別ポート 3499 で base2 の dev サーバーを起動して実施。3399 は別 worktree が使用中のため触れていない）: A5・U7・A7・U9・A8・U11 は変更前後とも 204 で一致。`invoke-agent`（U13）は変更前 204 → 変更後 200 を確認し、応答完了前に実際の AI プロセスが起動することも確認した（`kick()` が `claude` を spawn。ユーザー承認の上で実行し、終了後にプロセスと一時セッションを片付けた）
- **`approve`（U10）は実測していない** → project 昇格（ディレクトリ改名）と実際の AI 起動を伴う実操作のため、ユーザー判断でソース検証のみに留めた。他 6 本と同じ `return new Response(null, { status: 204 })` の形であり、h3 の送出経路（`sendWebResponse`、`:2103-2104` → `:942`）は他 6 本の実測で確認済みなので、コードの同一性から 204 のままであると判断する

## Migration Plan

ロールバックは revert で足りる。データ・スキーマに影響しない。

資料（`contract.md`）と実装は同じ change で揃えるため、片方だけが先に出ることはない。
