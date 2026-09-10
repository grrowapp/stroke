## 1. 着手

- [x] 1.1 `openspec/tickets/update-api-contract.md` の `status` を `Doing` にする
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（既に同じものが在れば追記しない。`tags` は追記のみで既存の項目を消さない）

## 2. 承認

- [x] 2.1 design.md「docs への整合反映」の反映内容（足すもの・抜くもの・移設先の一覧）をユーザーへ諮り、承認を得る。**承認前に `docs/` を書き換えない**

## 3. 足す — 責務範囲

- [x] 3.1 `docs/specs/api/contract.md` の「全体設計」の直後に「責務範囲」の節を書く。軸は1つ／範囲は軸の前後へ幅を持つ／点で捉えた責務外判定は誤用／責務外は軸の数で判定する
- [x] 3.2 既存の判断（U15 は完成の判定を持たない＝ADR-0014、A8 は値の意味づけを持たない、U13 は起動したプロセスの終了を待たない）を、判定則の例として節に添える
- [x] 3.3 判定則で説明が付かない既存の判断が無いか、`docs/specs/api/sessions/*.md` を一巡して確かめる。見つかったら**直さずに記録し**、ユーザーへ諮る（design.md「Risks」）

## 4. 抜く — 切り出し

- [x] 4.1 `docs/specs/api/sessions/` へ U1・U2・U3 を切り出す（`overview.md`・`get.md`・`strokes.md`）。書き方は既存の `sessions/activate.md` に倣う
- [x] 4.2 `docs/specs/api/sessions/` へ U7・U9・U12 を切り出す（`answer.md`・`send-back.md`・`list.md`）
- [x] 4.3 `docs/specs/api/strokes/` を作り、A1・A4・A5・A7・A8 を切り出す（`overview.md`・`send-back.md`・`question.md`・`proposal.md`・`submission.md`）
- [x] 4.4 W1・W2 の入出力を `docs/specs/api/ws/delivery.md` へ吸収する
- [x] 4.5 画面とルートの対応表を `docs/specs/architecture/question-flow.md` へ移す。「セッション uuid は URL に載せる」は contract.md に残す
- [x] 4.6 切り出し先のパス表記を docs の正（`/api/sessions/`）に揃える（design.md「切り出し先のパス表記は docs の正へ揃える」）
- [x] 4.7 contract.md に残ったものが 全体設計・責務範囲・約束・対称性・uuid の約束 の5つだけであることを確かめる
- [x] 4.8 U1〜U12・A1〜A8・W1/W2 の**すべて**が移設先に在ることを1本ずつ突き合わせる（design.md「Risks」の抜け対策）

## 5. 参照の付け替え

- [x] 5.1 個別 endpoint の記述を指している参照を洗い出す（`core/schema.md`・`architecture/question-flow.md`・`api/sessions/*.md`・`api/ws/delivery.md`）
- [x] 5.2 洗い出した参照を新しい置き場へ向け直す。共通の約束を指している参照は触らない
- [x] 5.3 `docs/specs/api/overview.md` の目録が切り出し後の実体と合っているか確かめる。**足りなければユーザーへ諮る**（並走の基準であり、勝手に触らない）
- [x] 5.4 パス表記の差を `docs/specs/plan/structure-migration.md` に書くかどうかをユーザーへ諮る（design.md「Open Questions」）

## 6. 仕上げ

- [x] 6.1 `openspec validate update-api-contract --strict` を通す
- [x] 6.2 切り出しの完了を、並走する `fix-server-api-layout`・`fix-session-api-layout` の ticket へ書き添える（参照先の資料が増えたこと）
- [x] 6.3 'typescript-reviewer' エージェントに '/santa-method' でレビューを実行させる。**飛ばした**——`fix-server-api-layout` の子 change（pre3）と同じ扱いで、ユーザー指示（2026-09-10）による
- [x] 6.4 change の成果物を commit する
- [x] 6.5 ユーザーから完了承認を得て、`openspec/tickets/update-api-contract.md` の `status` を `Wait-for-archive` にする
