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
- 応答の規約に spec 上の持ち主を与えること
- 読み取り（GET）が 204 を返さないこと

**Non-Goals:**

- 受理で完結する操作の応答コードを変えること。204 のままである
- `docs/specs/api/contract.md` の 204 の記述を変えること。現状が正
- **endpoint の path とメソッドを変えること。** この change は応答コードだけを扱う
- **削除（U11）を扱うこと。** `api/contract` が規定する操作に含めないため、`delete.post.ts` にも触らない
- 409 busy を画面がどう扱うか。それは `fix-busy-response-handling` の範囲

## 規約の置き場所

`docs/specs/api/contract.md` は横断規約を 2 箇所に持っている。

| 箇所 | 内容 |
| --- | --- |
| `## 全体設計:23` | POST は受理だけを返す（本文なし・204）。例外は U1 だけ |
| `## 約束:233-243` | 404 / 409（`busy`・`name-conflict`・`phase`）/ 502 は無い |

`openspec/specs/api/` 側は endpoint 単位の構成しか持たず、この横断規約に対応する capability が無い。実際、`openspec/specs/` に応答コードの記述は 1 件も存在しない。規約は資料と実装だけが持っており、片方が動いたときに食い違う。今回の食い違いはその現れである。

`api/contract` はこの穴を埋める。個別 endpoint の spec は自分の入出力だけを持ち、共通部分はここを参照する。

## Decisions

### Decision: 返す応答コードを数字で渡す

`setResponseStatus(event, 200)` と `return null` の組み合わせをやめ、`return sendNoContent(event, 204)` に置き換える。

```ts
// 変更前
setResponseStatus(event, 200)
return null

// 変更後
return sendNoContent(event, 204)
```

理由は 3 つ。

- **数字が効く。** `sendNoContent` は渡された code をそのまま使う（`:744` の `!code` が偽になる）。204 と書けば 204 が返り、捨てられる値がコードから消える
- **返したい応答が名前で読める。** `sendNoContent` は「本文を返さない」を意味する。`return null` は「本文が無いから h3 が 204 にしてくれる」という間接的な表現で、h3 の規定を知らないと読めない
- **戻り値の型が応答コードを決める構造をやめられる。** 現状は `null` を返すかどうかで応答が変わる。数字を直接渡せば、その対応関係を読み手が知らなくてよい

`return sendNoContent(...)` が成立する根拠は Context のとおり。`sendNoContent` は `undefined` を返すが、その前に `res.end()` を済ませて `event.handled` を立てるため、app レイヤーは正常終了する。

**却下した案: `setResponseStatus(event, 200)` の行だけを消す** — `return null` が残るので応答は 204 のままになり、誤読の元も消える。しかし応答コードを決めているのが `return null` である構造は変わらず、コードのどこにも 204 が現れない。何が返るかを知るには h3 の規定を知る必要がある

**却下した案: `setResponseStatus(event, 204)` + `return null`** — 数字は効く（`204 !== 200` なので引き継がれる）が、`sendNoContent` を呼ぶのは相変わらず `return null` である。加えて、そのハンドラが後日 `null` 以外を返すようになると、残った 204 を h3 が引き継ぎ、`nullBodyResponses`（`:2477`）が 204 を本文なしと扱うため**本文が黙って捨てられる**。`sendNoContent` を直接呼ぶ形なら、本文を返すよう変えるときにこの行ごと書き換えることになるので、取り残しが起きない

**却下した案: `200` を残して注記を足す** — 差分は最小だが、実際にレビューを誤らせた `200` の行がそのまま残る。コメントで誤りを覆う形になり、コメントを読み飛ばせば同じ誤解に戻る

### Decision: `delete.post.ts` は触らない

`delete.post.ts:33` も `return null` で 204 を返しており、コードから 204 が読めない点は他と同じである。しかし U11 は `api/contract` が規定する操作に含めないため、spec の裏付けが無い変更になる。この change では触らない。

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
- **`sendNoContent` を直接呼ぶ形は h3 の内部関数に依存する** → `sendNoContent` は h3 の公開 API（`:2498` の export に含まれる）であり、内部実装ではない。ただし h3 の major 更新時には確認が要る
- **受理系 6 本は応答が変わらないため、変更が効いたかを応答コードだけでは確かめられない** → 変更前後で 204 のままであることが合格条件になる。加えて、コード上に 204 が現れることを grep で確認する
- **`delete.post.ts` だけが `return null` のまま残る** → U11 が `api/contract` の対象外であるため。8 ファイル中 1 本だけ書き方が揃わない状態になる。U11 の扱いが決まった時点で別途揃える
- **ソースを読んで確定させただけで、変更後の実測はしていない** → 実装後に実測するタスクを tasks.md に置く

## Migration Plan

ロールバックは revert で足りる。データ・スキーマに影響しない。

資料（`contract.md`）と実装は同じ change で揃えるため、片方だけが先に出ることはない。
