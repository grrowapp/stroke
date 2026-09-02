## Question

決める操作（承認・即時却下・差し戻し）をどこへ、どう並べて置くか。あわせて、一覧からその場で開く形・却下の理由の求め方・送った結果の示し方が成り立つか。

## Variants

`?variant=a|b|c|d` で切替（← → キーでも回る）。どの案でも共通して、承認一覧から「レビューする」でその場のモーダルとして開き（一覧を離れない）、即時却下は理由のモーダル（書いて送るか、やめるかで閉じる。空では送れない）、送った結果は右上の toast で示す。コメント欄のしまい・幅固定・不可視レールは実装済みの形のまま。

- **variant=a**: 面の切替の右端に `.sb-action` の3ボタンを同色で並べる
- **variant=b**: 3ボタンを1つの枠（仕切り線つき）に束ね、切替と群で見分ける
- **variant=c**: 切替＋決定を全幅の固定帯にし、スクロールしても上に残す
- **variant=d（既定）**: **公式と同じ** — 決める操作（レビューを閉じる・即時承認・即時却下・修正を依頼）をヘッダ直下の操作行に置き、面の切替はその下の行に単独。文言・寸法・色（開閉の口だけ一段明るい）は本家 ja の実測どおり。コメント0件は修正を依頼 disabled

## Chosen

**variant=d（公式と同じ）** — ユーザー決定 2026-09-02「公式と同じ」「ちゃんと本家見ろ」。

決め手は**稼働中の本家の実画面**（port 5000・agent-messanger の pending の承認を Review & Annotate で開いた・2026-09-02）。本家は決める操作——Close Review・Quick Approve・Quick Reject・Request Revisions（0件 disabled）——をカードの**操作行**に集め、面の切替（Preview/Annotate/…）は**その下の行**に単独で置く。**実画面では全ボタンが同色**（npm 配布物のコードにある緑/赤/橙は出ていない）。本家の「その場で開く」はカードの**その場での展開**で URL を持たない——URL の要件（通知の飛び先）があるため器はルート付きモーダル（design 決定1）のまま、中身の並びを本家の展開カードに合わせる。a/b/c はいずれも「決定を切替と同じ帯に置く」前提で組んでおり、誤前提ごと落選。

## Borrowed

無し。a/b/c は前提ごと落選。

## Prototype

`openspec/changes/update-ui-approval-review/prototype/index.html`（使い捨て・main には入れない）。

土台は前回 change（`archive/2026-09-02-add-full-width-markdown-editor/prototype/`）の保存ページ＝稼働中の承認画面そのもの。develop に入った形（面は2つ・編集なし・コメント欄しまえる）へ合わせ直し、この change の検討だけを上乗せした。生成スクリプトと headless 検証はセッションの scratchpad（`build-proto-review.mjs` / `check-proto-review.mjs`）。
