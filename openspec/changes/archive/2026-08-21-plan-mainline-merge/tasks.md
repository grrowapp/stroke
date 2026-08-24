## 1. 地図の前提を固める

**「どう切るか」の判断はここで扱わない。** 入口・置き場・セッションの寿命・実行時の同居・名前は、いずれも意味の区分をどう引くかの話であり、`design-semantic-structure` の中身にあたる（design.md 決定11）。地図が持つのは「両者がそれぞれ意味で切れていること」という条件までである。

- [x] 1.1 並走ワークツリーの扱いと `server/utils` の層分け — `modularize-stroke` は app/ 側に閉じており担当は被らない。ただし層分けは意味の区分の適用結果として扱い、個別 change を立てない。並走も依存図に含めない（design.md 決定9・決定10）
- [x] 1.2 掻き出し済みのものを A / B / C に振り分ける — 承認後にポータルへ現れない断絶は **B**（統合の目的である「起こす→見張る」が1つになっても繋がらないため。`connect-portal-and-strokes` として change 済）、問いの到着が画面外へ届かない件は **C**（統合前は frontier に「他に見るもの」が無く期待自体が生まれなかったため）。残り10本は全て **A**
- [x] 1.3 `design-semantic-structure` の proposal に、移した5件（入口 / 置き場 / セッションの寿命 / 実行時の同居 / 名前）を表として記載済み

## 2. 統合形態の決定を ADR に残す

- [x] 2.1 `docs/adr/0002-merge-into-stroke-board.md` を書く。採った案（単一の Nuxt アプリとして統合する）と、退けた2案（1リポジトリ2アプリ / ポータルを土台に作り直し）、それぞれを退けた理由
- [x] 2.2 統合手法（`git merge --allow-unrelated-histories`）と、その根拠になった実測（共通コミット0件、root commit が別）を記す。`git subtree` を退けた理由も含む

## 3. 地図を書き出す

`docs/mainline-merge.md`。持つものと持たないものの境界は design.md 決定1のとおり。

- [x] 3.1 統合後の姿 — 何が1つになり、どこで接するか。`/opt/projects` が両者の唯一の実接点であることを含む
- [x] 3.2 change の一覧表 — id / タイトル / 一行の概要 / A・B・C の区分 / `openspec/changes/<id>/` へのポインタ。**一行を超えたら本体を見に行く**線を守る
- [x] 3.3 依存関係の図 — Mermaid の有向グラフ。依存の有無だけを持ち、理由は書かない（design.md 決定1-a）
- [x] 3.4 統合後に扱う区画（C） — 今 change にしないものを、理由とともに置く。問いの到着が画面外へ届かない件が1件目
- [x] 3.5 未決の論点の区画 — 判断材料と「いつ決めるか」を添える。git の繋ぎ方の詳細が1件目（design.md 決定4）
- [x] 3.6 終了条件 — 衝突の数ではなく、design.md 決定7 の形で書く（未決の論点の解消を加えて6項目）
- [x] 3.7 衝突の測り方 — 手順と、測った数を目標値にしてはならない理由（design.md 決定5）。**数字は書かない**
- [x] 3.8 A / B / C の基準そのものを書く — 振り分けた結果ではなく、次に何かが出たとき同じ基準で振り分けられるように

## 4. 導線と整合を取る

- [x] 4.1 `CLAUDE.md` の Docs 一覧に `docs/mainline-merge.md` を足す
- [x] 4.2 既存 proposal を読み返し、地図・ADR と食い違う記述を直す。衝突の件数を根拠にした書きぶり1件、マージ先の規約を論拠にした書きぶり2件、`modularize-server-utils` を保留扱いにしていた記述1件を修正
- [x] 4.3 `docs/known-issues.md` へ移すもの — 無し。掻き出した5件は `design-semantic-structure` へ、C の1件は地図の「統合後に扱うもの」へ、git の繋ぎ方は地図の「未決の論点」へ入った。マージ先側の不備（`CLAUDE.md` が実在しない `.scratch/` を指す・`CONTEXT.md` が無い）はあちらの問題として `unify-agent-conventions` に記載済み
- [x] 4.4 `openspec validate --all` を実行し、失敗が地図の責任範囲でないことを確かめる — 20 passed / 4 failed。失敗は `soften-startup-checks` `align-settings-conventions` `align-settings-conventions` `connect-portal-and-strokes` の4本で、いずれも spec の差分を持つ change の specs artifact が未着手であることによる。それぞれの change で specs を書いた時点で通る。`skip_specs` を付けた8本と spec 12件は全て通っている
