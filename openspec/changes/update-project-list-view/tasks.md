# update-project-list-view — tasks

入れる値の正は `prototype/index.html`。写しは `ui.md` にある。触るのは `app/assets/css/main.css` の宣言——当初は3つ、2.6 と 5.3 で `.sb-row-creating` と `@media (prefers-reduced-motion: reduce)` を加えて4つになった。DOM は変えない。クラス名は、最終更新の `td` から文字色のユーティリティ1つを外した（持ち主を `main.css` へ移すため。7.1）。

**実装は pre6（`/home/vagrant/work/stroke-board/pre6`、当時のブランチ `move-conventions-to-steering`。2026-09-06 現在は `pre6` ブランチで develop と同じ `491e77e0`）で行った。** 2026-08-31 に `64a2b8d1` でコミットし、`36470429` で develop へマージ済み。**6.3・8.1・8.2 は未実施のままマージされている**（本書のチェックがその記録）。

## 1. 実物と prototype を並べる

- [x] 1.1 `prototype/index.html` を静的サーバで開く。ペラ1・依存なしなので、node の素の `http` で配れば足りる（`nuxt dev` は要らない）— node の素の `http` 40行で 3698 に配った
- [x] 1.2 実物（`yarn dev` → `/projects`）を開き、同じ画面幅で並べる。ポートは 3399 固定（`CLAUDE.md`）— 幅 1300px で両方を撮って突き合わせた
- [x] 1.3 **生成中の行が実データで出ない場合の確認手段を決める。** 承認を通すか、prototype 側だけで見るか。生成中の地とローダーはこの change の対象外なので、出せなければ prototype の確認だけで進めてよい

## 2. 未接続の行の薄め方を直す（先にこれ）

`.sb-row-off` が行ごと `opacity` を掛けている限り、チップにガラスを入れても沈んで見えない。**2章が3章の前提である。**

- [x] 2.1 `.sb-row-off` から `opacity: 0.45` を外す。`cursor: not-allowed` は残す
- [x] 2.2 名前の列と未処理の通知の列の**子要素**に `opacity: 0.45` を掛ける形にする（`ui.md` の表）
- [x] 2.3 最終更新の列は文字色を `--text-secondary` 45% で `--surface-panel` と混ぜる。`opacity` ではない
- [x] 2.4 **状態の列は薄めない**ことを、実物で目で確かめる。アクティブの行と同じ濃さで読めること
- [x] 2.5 列の指定に `nth-child` を使うか、クラスを足すかを決める。prototype は `nth-child` だが、実物の DOM が同じ列順とは限らない。**実物の DOM を読んでから決める**
- [x] 2.6 **生成中の行（`.sb-row-creating`）も同じ欠陥を持っている。** `td > *` に `opacity: 0.45` を掛けており、名前セルの直下（ローダーを内包する `span`）とチップまで沈む。`ui.md` の「ローダーだけは薄めず、白で明滅させながら回す」が成立していない。`rowClass()` は排他なので、生成中の行は `.sb-row-off` を持たず、この宣言だけが効く

      **`opacity` では直せない。** 親に `opacity` を掛けると子はそれより濃くできないため、ローダーだけを戻すことができない。名前は**文字色**で弱め、ローダーとチップには何も掛けない形にする。ローダーは `conic-gradient` の背景なので文字色の影響を受けない

      2.6 は tasks を書いた時点で見落としていたもので、範囲を広げる判断である。delta spec の「行を弱めるとき状態の列を弱めてはならない」は同じ要件の中で生成中の行にも掛かっており、目的に沿う

## 3. チップにガラスの質感を入れる

- [x] 3.1 `.sb-chip` を `inline-block` から `inline-flex`（`align-items: center` / `justify-content: center`）にする。中身を中央に置くため
- [x] 3.2 面を3段の `linear-gradient` にする（基調色 12% → 4.8% → 8.4%、停止点 0% / 55% / 100%）
- [x] 3.3 枠を基調色 30% にする
- [x] 3.4 文字を基調色 90% で `#fff` と混ぜる
- [x] 3.5 上辺の照り返し（`inset 0 1px 0` `#fff` 16%）と下辺の落ち込み（`inset 0 -1px 0` `#000` 20%）を入れる
- [x] 3.6 基調色を CSS 変数で受ける形にする。アクティブが差し替えるだけで済むようにするため
- [x] 3.7 `min-width: 76px` が保たれていることを確かめる。`inline-flex` 化で幅が変わっていないこと

## 4. アクティブの発光を入れる

- [x] 4.1 `.sb-chip-on` で基調色を `--status-success` に差し替える
- [x] 4.2 面を 38% → 20% → 26% の3段にする
- [x] 4.3 枠を 55% にする。**`border-width: 0` をやめる**——枠を消すと既定のチップと高さが揃わない
- [x] 4.4 文字を 55% で `#fff` と混ぜる
- [x] 4.5 文字のにじみ（`text-shadow: 0 0 6px` 60%）を入れる
- [x] 4.6 上辺の照り返しを 34%、下辺の落ち込みを 28% に上げる
- [x] 4.7 外へのにじみ2枚（`0 0 7px` 45% と `0 0 15px` 22%）を入れる
- [x] 4.8 **既定のチップと高さが揃っている**ことを、並べて確かめる

## 5. 整合の確認

- [x] 5.1 prototype と実物を並べ、3状態（アクティブ / 未接続 / 生成中）の見え方が一致することを目で確かめる — 計算済みスタイルで照合した（面の3段 0.12/0.048/0.084、inset 2枚、外へのにじみ 2枚、text-shadow、枠 1px、幅 76px）
- [x] 5.2 **失敗の行と PID が実装に紛れ込んでいない**ことを確かめる。どちらも spec が MUST NOT で禁じている
- [x] 5.3 `@media (prefers-reduced-motion: reduce)` の既存の記述が壊れていないことを確かめる。この change は動きを足さない — **穴が見つかったので塞いだ。** 同ブロックが `.sb-row-creating { opacity: 0.45 }` を持っており、動きを抑える設定のときだけ行ごと沈んで状態の列が読めなくなっていた。弱め方は動きの設定に関わらず同じであるべきなので、この `opacity` を落とした（`animation: none` は残す）
- [x] 5.4 生成中の行の地・ローダー・回転・明滅・チップ幅に差分が入っていないことを確かめる（対象外）
- [x] 5.5 `.sb-chip` を使っている他の画面を洗い出し、意図しない見た目の変化が起きていないことを確かめる。**一覧だけが使っているとは限らない** — 他に2箇所（`layouts/workspace.vue` のヘッダ、`workspace/DocumentEditor.vue` の保存状態）。どちらも同じ意味のチップで、揃うのが正しい。workspace ヘッダを実機で見て崩れないことを確認済み。proposal の Impact に記録した。**2026-09-06 追記:** その後ヘッダは `components/workspace/WorkspaceShell.vue`（`025c4118`）、保存状態は `modules/markdown/runtime/edit/MarkdownEditor.vue`（`cbd61699`）へ移った。使い方は同じ。proposal の表を更新した
- [x] 5.6 `openspec validate update-project-list-view --store stroke` が通ることを確かめる — 実装時は通過。**2026-09-06 に再確認したところ失敗していた。** `add-activated-phase` の archive（同日）で本体 spec が進み、この delta が本体の scenario 2本を落とす形になっていた。delta を本体の現行文へ乗せ直して再び通した（proposal「決定の記録」2026-09-06）

## 6. 門番

- [x] 6.1 `yarn typecheck` を通す — 通過
- [x] 6.2 `yarn test` を通す — 21ファイル / 211件 通過
- [ ] 6.3 `yarn test:e2e` を通す。E2E は並列時に本家スタブの競合で落ちることがある（実測 2026-08-30）。落ちたら `--workers=1` で単独確認する — **未実施のままマージされた。** 実施の記録が無い。archive の前に通す。`playwright.config.ts` の webServer は `.output/server/index.mjs` を起動するので、先に `yarn build` が要る（2026-09-06 時点で pre6 に `.output` は無い）
- [x] 6.4 CSS だけの変更なので、既存のテストが状態の表示を文言で見ていることを確かめる。見た目の値をテストに固定しない — `.sb-chip` の実値を固定していたのは `design-token.spec.ts` の1件だけで、要件を見る形へ書き換えた（書き換え時は `e2e/`、マージ後の `79afcbb9` で `test/e2e/` へ移った）。`notifications.spec.ts` の実値固定は通知画面の別テーブル（`sb-datarow-*`）が対象で `.sb-chip` は「存在しないこと」しか見ていない。`upstream-style.spec.ts` は本家との比較で無関係

## 7. コミット

- [x] 7.1 pre6 のブランチへ直接コミットする（`CLAUDE.md`「change の実装（apply）は、この worktree のブランチへ直接コミットする」）。コミットメッセージに、直した3宣言を1行で残す — `64a2b8d1`「fix: 一覧の状態を ui.md の確定値どおりに出す」（2026-08-31）。`36470429` で develop へマージ。触ったのは `main.css`・`app/pages/projects/index.vue`（最終更新の `td` から文字色ユーティリティを外し、持ち主を `main.css` の `.sb-table td:nth-child(4)` へ一本化）・`design-token.spec.ts`。**同じコミットに `playwright.config.ts` と `CLAUDE.md`（E2E ポートを 50000 から上へ空きを探す方式へ）が同乗している。** この change の対象外で、proposal の決定の記録に残した

## 8. レビューと完了承認

- [ ] 8.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行する。対象はこの change の成果物（`main.css` の4宣言・delta spec・`ui.md`・`prototype/index.html`）と、`prototype` / `ui.md` / 実装の3者で値が一致しているかの整合。レビューが完全にパスするまで続ける
- [ ] 8.2 ユーザーから完了承認を得る
