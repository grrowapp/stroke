---
status: ready-for-agent
tags:
  - maintenance
---

# clarify-no-content-status

POST endpoint が `setResponseStatus(event, 200)` と書いているのに、実際の応答は 204 になる。コードだけを読むと 200 だと誤解する。

## 事実

実測（動いている dev へ実際に叩いた結果）:

```
A7  POST /api/strokes/:id/proposal  -> 204
U11 POST /api/strokes/:id/delete    -> 204
```

コード:

```
server/api/strokes/[id]/proposal.post.ts:55    setResponseStatus(event, 200)
                                               return null
```

ハンドラが `null` を返すため h3 が 204 No Content に変換する。`setResponseStatus(200)` は打ち消される。

同じ形が7ファイルにある: `answer` / `send-back` / `question` / `proposal` / `approve` / `submission`（以上 POST）/ `invoke-agent`（これだけ GET）。

`docs/specs/api/contract.md:23` の「POST は受理だけを返す（本文なし・204）」および各 endpoint の「output: 本文なし（204）」は**正しい**。誤解を招くのはコード側だけである。

## 実害

レビューで実際に誤らせた。`rename-api-contract-doc` のレビューで、独立レビュアーの1体が「201行目の `本文なし（204）` は誤り。実装は `setResponseStatus(200)` なので 200 のはず」と MEDIUM で指摘してきた。実測して否認したが、コードを読んだだけでは誰でも同じ誤りをする。

## 論点 → 決定済み（change `clarify-no-content-status`）

当初は次の3案から未決だった。

- **注記を足すだけ** — `setResponseStatus(200)` の隣に「本文なしなので h3 が 204 に変換する」と書く。最小だが、打ち消される行が残り続ける
- **`setResponseStatus` を外す** — 何も書かなければ 204 になる。行が減って誤解も消えるが、「意図して 204 にしている」ことが読めなくなる
- **`setResponseStatus(event, 204)` に直す** — 意図と結果が一致する。ただし h3 が本文なしで 204 にするのは変わらないので、実質は表明のためだけの行になる

決定は次のとおり（経緯は change の proposal / design）。3案のいずれでもなく、一律にもしない。

- 本文なしの7ファイル（受理系6 + `delete`）— 末尾を web 標準形の **`return new Response(null, { status: 204 })` の1行に置き換える**。裸の `return null` と h3 の推測（null→204、200 は「未設定」扱いで捨てる）に依存する書き方自体を無くし、status を自分で持った応答を1つの式で返す
- `invoke-agent`（U13、GET）— 一律の対象から外す。204 は受理で完結する操作の応答であり、読み取り（GET）に使っていること自体が誤り。`return null` を `return {}` に変えて 200 を返す（**BREAKING**）

## 触るファイル

- `server/api/strokes/[id]/answer.post.ts:43`
- `server/api/strokes/[id]/send-back.post.ts:23`
- `server/api/strokes/[id]/question.post.ts:37`
- `server/api/strokes/[id]/proposal.post.ts:55`
- `server/api/strokes/[id]/approve.post.ts:89`
- `server/api/strokes/[id]/submission.post.ts:24`
- `server/api/strokes/[id]/delete.post.ts:33`（`setResponseStatus` は無く `return null` のみ。裸の null の除去として対象に含めた）
- `server/api/strokes/[id]/invoke-agent.get.ts:73`

`docs/specs/api/contract.md` の 204 の記述は正しいので変えない。ただし2箇所だけ直す。`:169`（U13）は 200 化の決定に合わせて改め、`:213`（A8）は他と同じ `本文なし（204）` に揃える。
