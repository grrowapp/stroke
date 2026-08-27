---
status: needs-triage
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

同じ形が7ファイルにある: `answer` / `send-back` / `question` / `proposal` / `approve` / `submission` / `invoke-agent`。

`docs/specs/api/contract.md:23` の「POST は受理だけを返す（本文なし・204）」および各 endpoint の「output: 本文なし（204）」は**正しい**。誤解を招くのはコード側だけである。

## 実害

レビューで実際に誤らせた。`rename-api-contract-doc` のレビューで、独立レビュアーの1体が「201行目の `本文なし（204）` は誤り。実装は `setResponseStatus(200)` なので 200 のはず」と MEDIUM で指摘してきた。実測して否認したが、コードを読んだだけでは誰でも同じ誤りをする。

## 論点

どう直すかが決まっていない。

- **注記を足すだけ** — `setResponseStatus(200)` の隣に「本文なしなので h3 が 204 に変換する」と書く。最小だが、打ち消される行が残り続ける
- **`setResponseStatus` を外す** — 何も書かなければ 204 になる。行が減って誤解も消えるが、「意図して 204 にしている」ことが読めなくなる
- **`setResponseStatus(event, 204)` に直す** — 意図と結果が一致する。ただし h3 が本文なしで 204 にするのは変わらないので、実質は表明のためだけの行になる

どれを取るかは、7ファイル一律で決める。

## 触るファイル

- `server/api/strokes/[id]/answer.post.ts:43`
- `server/api/strokes/[id]/send-back.post.ts:23`
- `server/api/strokes/[id]/question.post.ts:37`
- `server/api/strokes/[id]/proposal.post.ts:55`
- `server/api/strokes/[id]/approve.post.ts:89`
- `server/api/strokes/[id]/submission.post.ts:24`
- `server/api/strokes/[id]/invoke-agent.get.ts:73`

`docs/specs/api/contract.md` は正しいので触らない。
