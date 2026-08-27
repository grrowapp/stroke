## 1. 変更前の応答コードを実測する

- [ ] 1.1 `yarn dev`（ポート 3399）を起動する
- [ ] 1.2 ストロークを 1 件用意し、状態を準備できる endpoint から順に叩いて、変更前の応答コードを一覧に記録する。ticket が記録している A7 の実測値（204）と一致することを確認する
- [ ] 1.3 `invoke-agent` の変更前の応答コードを記録する。ここが 204 であることが 4.3 の比較対象になる
- [ ] 1.4 状態の準備が難しく実測できなかった endpoint を明示して残す。4. の照合対象から外す

## 2. 受理で完結する 6 本を書き換える

design.md の Decisions のとおり、`setResponseStatus(event, 200)` と `return null` を `return sendNoContent(event, 204)` に置き換える。`sendNoContent` は `h3` からの import が要る。

- [ ] 2.1 `server/api/strokes/[id]/answer.post.ts:43-44`
- [ ] 2.2 `server/api/strokes/[id]/send-back.post.ts:23-24`
- [ ] 2.3 `server/api/strokes/[id]/question.post.ts:37-38`
- [ ] 2.4 `server/api/strokes/[id]/proposal.post.ts:55-56`
- [ ] 2.5 `server/api/strokes/[id]/approve.post.ts:89-90`
- [ ] 2.6 `server/api/strokes/[id]/submission.post.ts:24-25`
- [ ] 2.7 6 ファイルが同じ形（`return sendNoContent(event, 204)`）で揃っていることを確認する
- [ ] 2.8 `server/api/strokes/[id]/delete.post.ts` を変更していないことを確認する。U11 は `api/contract` の対象外なので触らない（design.md の Non-Goals）

## 3. invoke-agent を 200 にする

- [ ] 3.1 `server/api/strokes/[id]/invoke-agent.get.ts:74` の `return null` を `return {}` に変える
- [ ] 3.2 同 `:73` の `setResponseStatus(event, 200)` は残す。`send` を通る経路では 200 が捨てられないため、この行は効く（design.md の Decisions）
- [ ] 3.3 `server/api/` を `204` で grep し、6 ファイルに数字が現れていることを確認する

## 4. 変更後の応答コードを実測する

- [ ] 4.1 `yarn dev` を再起動し、1.2 と同じ endpoint を同じ手順で叩く
- [ ] 4.2 受理系 6 本の応答が 1.2 で記録した値と一致することを確認する。204 のままであることが合格条件
- [ ] 4.3 `invoke-agent` の応答が 200 になっていることを確認する。1.3 で記録した 204 から変わっていることが合格条件
- [ ] 4.4 受理系の応答に本文が付いていないことを確認する
- [ ] 4.5 差異が出た場合は原因を特定し、design.md の Risks に追記してから先へ進む

## 5. 資料を直す

`docs/specs/api/contract.md`。204 の記述は正しいので変えない。

- [ ] 5.1 `:169`（U13）の `output: 本文なし` を、200 を返す記述に改める
- [ ] 5.2 `:213`（A8）の `output: 本文なし` を `output: 本文なし（204）` に揃える
- [ ] 5.3 `:23` `:110` `:117` `:124` `:140` `:195` `:201` を変更していないことを確認する（現状が正）
- [ ] 5.4 `:139` は U11 の `input: 本文なし` なので変更しないことを確認する

## 6. 既存テストと影響範囲の確認

- [ ] 6.1 `yarn test` を実行し、通ることを確認する
- [ ] 6.2 `app/` `test/` `e2e/` を `204` で grep し、変更前と同じくヒットが 0 件であることを確認する
- [ ] 6.3 画面から回答・差し戻し・承認を実際に操作し、動作が変わっていないことを確認する。`invoke-agent` は画面が受理の直後に呼ぶため、200 化で起動が止まらないことをここで確かめる
- [ ] 6.4 `server/plugins/01.retry-failed.ts` の巡回と、`approve.post.ts` からの起動が動くことを確認する。どちらも `invoke-agent` を呼ぶ（proposal.md の呼び出し元の表）
- [ ] 6.5 endpoint の path とメソッドを変更していないことを確認する（design.md の Non-Goals）

## 7. コードレビュー

- [ ] 7.1 santa-method（`~/.agents/skills/santa-method`）で実装のレビューを回す。独立した 2 レビュアーによる敵対的検証を行う
- [ ] 7.2 両レビュアーが合格を出すまで指摘を修正する。片方だけの合格で先へ進まない
- [ ] 7.3 レビューで応答コードに関わる指摘が出た場合は、実測（1. と 4.）の記録と突き合わせて判断する
