## 1. 変更前の応答コードを実測する

- [x] 1.1 `yarn dev`（ポート 3399）を起動する。3399 は別 worktree（base4）が未コミット変更を持ったまま使用中だったため、`NUXT_PORT=3499` で base2 の dev サーバーを別ポート起動した（3399 には触れていない）
- [x] 1.2 ストロークを 1 件用意し、状態を準備できる endpoint から順に叩いて、変更前の応答コードを一覧に記録する。ticket が記録している A7 の実測値（204）と一致することを確認する。対象8ファイルのみ `git stash` で変更前へ戻して実測した（`docs/feature/overview.md` 等の無関係な未コミット変更には触れていない）。結果: A5・U7・A7・U9・A8・U11 いずれも 204 で一致
- [x] 1.3 `invoke-agent` の変更前の応答コードを記録する。ここが 204 であることが 4.3 の比較対象になる。実測: 204
- [x] 1.4 状態の準備が難しく実測できなかった endpoint を明示して残す。4. の照合対象から外す。`approve`（U10）は project 昇格（ディレクトリ改名）と実際の AI 起動を伴う実操作のため、ユーザー判断で実測しないことにした。ソース検証（h3 の送出経路が他6本と共通）で代替

## 2. 本文なしの 7 本を `return new Response(null, { status: 204 })` に置き換える

design.md の Decisions のとおり、末尾の `setResponseStatus(event, 200)` + `return null`（delete は `return null` のみ）を `return new Response(null, { status: 204 })` の 1 行に置き換える。

- [x] 2.1 `server/api/strokes/[id]/answer.post.ts:43`
- [x] 2.2 `server/api/strokes/[id]/send-back.post.ts:23`
- [x] 2.3 `server/api/strokes/[id]/question.post.ts:37`
- [x] 2.4 `server/api/strokes/[id]/proposal.post.ts:55`
- [x] 2.5 `server/api/strokes/[id]/approve.post.ts:89`
- [x] 2.6 `server/api/strokes/[id]/submission.post.ts:24`
- [x] 2.7 `server/api/strokes/[id]/delete.post.ts:33`。U11 は spec の規定対象外のまま置き換える。応答が 204 のまま変わらないことが担保（design.md の Decisions / Risks）
- [x] 2.8 7 ファイルが同じ形（`return new Response(null, { status: 204 })`）で揃っていることを確認する

## 3. invoke-agent を 200 にする

- [x] 3.1 `server/api/strokes/[id]/invoke-agent.get.ts:74` の `return null` を `return {}` に変える
- [x] 3.2 同 `:73` の `setResponseStatus(event, 200)` は残す。`send` を通る経路では 200 が捨てられないため、この行は効く（design.md の Decisions）
- [x] 3.3 `server/api/` を `204` で grep し、置き換えた 7 ファイルに数字が現れていることを確認する
- [x] 3.4 `server/api/` を `return null` で grep し、ヒットが 0 件であることを確認する

## 4. 変更後の応答コードを実測する

- [x] 4.1 `yarn dev` を再起動し、1.2 と同じ endpoint を同じ手順で叩く。1.1 と同じく `NUXT_PORT=3499` で起動
- [x] 4.2 受理系 6 本と delete の応答が 1.2 で記録した値と一致することを確認する。204 のままであることが合格条件。一致を確認
- [x] 4.3 `invoke-agent` の応答が 200 になっていることを確認する。1.3 で記録した 204 から変わっていることが合格条件。200・`{}` を確認。応答完了前に実際の AI プロセスが起動することも確認した（ユーザー承認の上で実行し、終了後に片付け済み）
- [x] 4.4 受理系の応答に本文が付いていないことを確認する。content-length: 0 を確認
- [x] 4.5 差異が出た場合は原因を特定し、design.md の Risks に追記してから先へ進む。差異なし。実測結果は design.md の Risks に追記した

## 5. 資料を直す

`docs/specs/api/contract.md`。204 の記述は正しいので変えない。

- [x] 5.1 `:169`（U13）の `output: 本文なし` を、200 を返す記述に改める
- [x] 5.2 `:213`（A8）の `output: 本文なし` を `output: 本文なし（204）` に揃える
- [x] 5.3 `:23` `:110` `:117` `:124` `:140` `:195` `:201` を変更していないことを確認する（現状が正）
- [x] 5.4 `:139` は U11 の `input: 本文なし` なので変更しないことを確認する

## 6. 既存テストと影響範囲の確認

- [x] 6.1 `yarn test` を実行し、通ることを確認する。132件通過
- [x] 6.2 `app/` `test/` `e2e/` を `204` で grep し、変更前と同じくヒットが 0 件であることを確認する
- [ ] 6.3 画面から回答・差し戻し・承認を実際に操作し、動作が変わっていないことを確認する。`invoke-agent` は画面が受理の直後に呼ぶため、200 化で起動が止まらないことをここで確かめる。**未実施**: `approve` は project 昇格を伴う実操作のため、ユーザー判断で実行しないことにした
- [ ] 6.4 `server/plugins/01.retry-failed.ts` の巡回と、`approve.post.ts` からの起動が動くことを確認する。どちらも `invoke-agent` を呼ぶ（proposal.md の呼び出し元の表）。**部分実施**: dev サーバー起動時に `01.retry-failed.ts` が実行され「前回の実行中だった 2 件を failed へ倒した」を確認したが、`approve.post.ts` からの起動は同上の理由で未実施
- [x] 6.5 endpoint の path とメソッドを変更していないことを確認する（design.md の Non-Goals）。変更なし

## 7. コードレビュー

- [x] 7.1 santa-method（`~/.agents/skills/santa-method`）で実装のレビューを回す。独立した 2 レビュアーによる敵対的検証を行う。Reviewer B（typescript-reviewer）・Reviewer C（general-purpose）を並行起動し、両者とも独自に h3 ソース・呼び出し元・yarn typecheck / yarn test を再検証した
- [x] 7.2 両レビュアーが合格を出すまで指摘を修正する。片方だけの合格で先へ進まない。両者とも verdict: PASS、critical_issues 0件で一致（NICE 判定）。修正不要
- [x] 7.3 レビューで応答コードに関わる指摘が出た場合は、実測（1. と 4.）の記録と突き合わせて判断する。応答コードに関する指摘は無し。両者とも suggestions として docs/feature/overview.md の無関係な未コミット差分（この change 開始前から存在。範囲外として扱った）を分離コミット推奨と指摘

## 8. コミット

- [x] 8.1 この change の対象9ファイル（server 8 + contract.md）のみをコミット。`.claude/settings.json`・`docs/feature/overview.md` は無関係な未コミット差分のため含めない（`13bc2e2`）
