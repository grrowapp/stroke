## 1. ticket

- [x] 1.1 `openspec/tickets/fix-api-contract-path-drift.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `fix-api-contract-path-drift/child-10` を追記する（`docs/agents/issue-tracker.md`「ticket の起票」）。`tags` は追記のみで既存の項目を消さない

## 2. 見出しを基準へ揃える（design「書き換えは 8 行。現状と追従後を1対1で確定させる」）

対象は `docs/specs/api/contract.md`「各 endpoint の入出力」。差し替えは1行ずつ、番号を含む見出し行全体を指定して行う（design「書き換えの手つきは1行ずつの置換にする。一括の文字列置換をしない」）。

- [x] 2.1 書き換えの前に、`contract.md` の見出しへアンカー付きで張っているページが無いことを `grep -rn "contract.md#" docs` で確かめる（design「Risks」の最後の項目）
- [x] 2.2 U1 の見出しを `POST /api/strokes` から `POST /api/sessions` へ差し替える
- [x] 2.3 U2 の見出しを `GET /api/strokes/:id` から `GET /api/sessions/:id` へ差し替える
- [x] 2.4 U3 の見出しを `GET /api/strokes/:id/strokes` から `GET /api/sessions/:id/strokes` へ差し替える。末尾の `/strokes` はリソース名なので残す
- [x] 2.5 U7 の見出しを `POST /api/strokes/:id/answer` から `POST /api/sessions/:id/answer` へ差し替える
- [x] 2.6 U9 の見出しを `POST /api/strokes/:id/send-back` から `POST /api/sessions/:id/send-back` へ差し替える
- [x] 2.7 U12 の見出しを `GET /api/strokes` から `GET /api/sessions` へ差し替える。U1 と path が同じでメソッドだけが違うので、番号とメソッドを含めて指定する
- [x] 2.8 W1 の見出しを `/api/strokes/:id/ws/question` から `/api/sessions/:id/ws/question` へ差し替える
- [x] 2.9 W2 の見出しを `/api/strokes/:id/ws/proposal` から `/api/sessions/:id/ws/proposal` へ差し替える

## 3. 据え置くものに手が及んでいないことを確かめる（design「A 系（A1・A4・A5・A7・A8）の見出しは据え置く」「書き換えの範囲は見出し行だけである」）

- [x] 3.1 A1・A4・A5・A7・A8 の見出しが `/api/strokes/:id/…` のまま残っていることを確かめる
- [x] 3.2 「セッションの参照方法」の画面のルート（`/strokes/<uuid>`・`/strokes/<uuid>/proposal`）が変わっていないことを確かめる。これは endpoint ではない
- [x] 3.3 `git diff` で、変わった行が 8 行だけで、すべて `### ` で始まる見出し行であることを確かめる。本文（入出力・エラー・全体設計・約束・対称性）に差分が無いこと
- [x] 3.4 基準（`docs/specs/api/overview.md`・`docs/specs/api/server.md`）に差分が無いことを確かめる

## 4. 検証

- [x] 4.1 追従後の 8 本の path が `docs/specs/api/overview.md` の「`sessions/` — 11本」「`ws/` — 3本」の表の記述と1文字も違わないことを突き合わせる
- [x] 4.2 `openspec validate --all --store stroke` を通し、この change が valid であることを確かめる
- [x] 4.3 Gitea issue #10 の完了条件を自分で確かめる —— `grep -rn "api/strokes" docs/specs/api` に残るのが `overview.md` の `strokes/` の表の1行と A 系 5 行、`contract.md` の A 系 5 行だけであること（合計 11 行）

## 5. レビュー

- [x] 5.1 `/santa-method` でレビューを回し、2 レビュアーが**両方パスする**まで直す。指摘と対応を 5.1 に書き残す
  - `typescript-reviewer` エージェントはこの環境に無いため、`/santa-method` の既定のレビュアー構成で代替する（親 change `fix-server-api-layout` design.md「Risks / Trade-offs」）
  - **結果: 1 巡目で 2 レビュアーとも PASS。** critical issues は両者とも 0 件。8 項目のルーブリック（差分の正確さ／範囲の逸脱／据え置き／完了条件／artifact の整合／規約遵守／ticket の整合／主張の裏付け）を両者が独立に実地検証し、すべて PASS
  - 対応した指摘（非ブロッキング）: design「Context」が見出しの形を「番号＋メソッド＋path」と一律に書いていたが、W1 / W2 はメソッドを持たない。「U 系・A 系はメソッドを path の前に付け、W 系は path だけ」へ書き直した
  - 対応しなかった指摘（範囲外。親 change へ観察として上げる）: `overview.md` は `sessions/` を 11 本と数え `strokes/` を置き場として挙げているが、`docs/specs/api/` に `strokes/` ディレクトリは無く `sessions/` の実ファイルも 5 本である。基準ページ側に残る別のずれで、基準は触らない決めのためここでは直さない
  - 対応しなかった指摘（不要の確認）: `openspec/specs/api/contract/spec.md` は U 系が既に `/api/sessions/`、A 系が `/api/strokes/` で、この change の追従後の docs と整合している。delta は要らない

## 6. 締め

- [x] 6.1 change の成果物を commit する（worktree のブランチ `fix-api-contract-path-drift` へ）
- [x] 6.2 ユーザーから完了承認を得て、`openspec/tickets/fix-api-contract-path-drift.md` の `status` を `Wait-for-archive` にする —— **親 change `fix-server-api-layout` が PR のマージをもって代行する**（親 design.md「PR とマージ」「担当とゲート」）。この change の担当はここへ手を付けない
