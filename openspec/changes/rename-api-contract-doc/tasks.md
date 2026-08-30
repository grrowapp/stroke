## 1. 改名する

- [x] 1.1 `git mv docs/specs/api/api-contract.md docs/specs/api/contract.md`。git は `R`（rename）として追跡している
- [x] 1.2 改名だけの差分として確認した

## 2. 参照を揃える

- [x] 2.1 `CLAUDE.md` の Docs の節を `contract.md` に直した
- [x] 2.2 資料側5件を直した — `system-structure.md`（3箇所）/ `data-fetching.md` / `question-flow.md`（2箇所）/ `stroke-modules.md`（3箇所）/ `next-agent-run.md`
- [x] 2.3 コード側を直した — `server/utils/stroke/request-schemas.ts` のコメント
- [x] 2.4 `openspec/changes/**`（archive 含む・35ファイル）と `openspec/tickets/` は触っていない
- [x] 2.5 `grep -rn "api-contract"` を走らせ、作業ツリー側の残存が **0件**であることを確かめた
- [x] 2.6 design で洗い出せていなかった7件目 `santa-ts-review.SKILL.md:60` を発見して直した。過去の記録ではなく現役のレビュー用スキルからの参照なので対象に含めた

## 3. 実装と食い違う記述を直す

- [x] 3.1 55行目 — 一覧の A7 を「proposal を提出する（**受理した本文を残す**）」に
- [x] 3.2 127行目 — U10 の前提を「書くのは A7 で、残せたときだけ受理を成立させるので `proposed` まで進んだセッションでは通常在る。**承認は proposal を書かず、既にあるものに触れない**」に
- [x] 3.3 201行目 — A7 の節を「**受理した本文を残す**」「**残せなければ受理しない**」「順序は 残す → phase を進める → W2 配信」に。エラーへ 500 を追記
- [x] 3.4 修正を A7 の3箇所に留めた。他の記述の裏取りはこの change では行っていない

## 4. 確かめる

- [x] 4.1 `docs/specs/api/contract.md` が在り、`api-contract.md` が無い
- [x] 4.2 `yarn typecheck` と `openspec validate rename-api-contract-doc` が通る。`yarn test` 132件も通る
- [x] 4.3 直した3箇所を実装と突き合わせた — A7 が `sessionProposal(id).write()` を最初に呼び、失敗すれば phase も publish も行わない（`proposal.post.ts`）。承認は `.read()` するだけで書かない（`approve.post.ts`）

## 5. レビュー

- [x] 5.1 `typescript-reviewer` を独立2体で走らせた（`/santa-method`）
  - 1体目: **指摘なし**。修正3箇所を実装と1行ずつ突き合わせ、`sessionErrorToHttp` の分岐まで追って 500 が実際に返ることを確認
  - 2体目: MEDIUM 1件 —「201行目の `output: 本文なし（204）` は誤り。実装は `setResponseStatus(event, 200)` なので 200 のはず」
- [x] 5.2 2体目の MEDIUM を**実測で否認した**。動いている dev へ実際に叩いた結果は `A7: 204` / `U11 delete: 204`。ハンドラが `null` を返すため h3 が 204 No Content に変換しており、ワイヤ上は 204。`contract.md` の記述が正しく、レビュアーはコード上の `200` だけを見て応答を測っていなかった

### 記録: コードと実際の応答が食い違って見える

`setResponseStatus(event, 200)` と書いてあるのに応答は 204 になる。h3 が本文なしの応答を 204 に変換するためで、コードだけを読むと 200 だと誤解する。実際に今回のレビューで1体が誤った。

該当は7ファイル（`answer` / `send-back` / `question` / `proposal` / `approve` / `submission` / `invoke-agent`）。`contract.md` は正しいので**この change では触らない**が、コード側にその旨の注記を足す価値はある。別 change の候補として記録する。
