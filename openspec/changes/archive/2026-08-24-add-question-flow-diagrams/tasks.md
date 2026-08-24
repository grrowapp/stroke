## 1. 骨格を置く

- [x] 1.1 `docs/question-flow.md` を作る。冒頭に、この資料が問いの往復を図で示すものであること、状態の正は `state.json` であることを書く（design 決定5）
- [x] 1.2 図の中の矢印に使う番号（U1・U7・U13・A5・A7・W1・W2）が `docs/api-contract.md` と同じものであることを冒頭で示す（design 決定3）

## 2. 並びの図（シーケンス）

- [x] 2.1 4者（ユーザー・画面・サーバ・エージェント）を並べた Mermaid のシーケンス図を書く
- [x] 2.2 概要の投稿（U1）→ 起動要求（U13）→ 問いの提出（A5）→ 配信（W1）→ 回答（U7）→ 起動要求（U13）の一巡を描く
- [x] 2.3 差し戻し（U9）→ 問い返し（A5）→ 回答（U7）→ proposal の提出（A7）→ 配信（W2）まで続けて描く
- [x] 2.3b 各受理で `state.json` と `strokes.json` のどちらが書かれるかを、図の中で見分けられるようにする
- [x] 2.4 図の下に、同じ流れを1〜2行の文章で添える（design Risks）

## 3. 状態の図（遷移）

- [x] 3.1 `state.json` が持つ3つ（`phase` / `currentQuestion` / `invocation`）を軸に、Mermaid の状態遷移図を書く
- [x] 3.2 どの受理でどれが変わるかを遷移のラベルに書く。U1・U7・U13・A5・A7・U10 を網羅する
- [x] 3.3 `currentQuestion` が回答（U7）では消えず、A5 か A7 で初めて変わることを図に出す（design 決定4）
- [x] 3.4 同じ図に `strokes.json` を並べ、U7 で往復1行、A7 の初提出でマーカー行が積まれることを出す
- [x] 3.5 今の1問を持つ `state.json` と、済んだ往復を積む `strokes.json` の役割の違いが読み取れる形にする
- [x] 3.6 図の下に、同じことを1〜2行の文章で添える

## 4. 配信の図（経路）

- [x] 4.1 W1・W2 それぞれについて、接続時配信と提出時配信の2経路を Mermaid で書く
- [x] 4.2 接続時配信が `state.json` を読んで送ること、WS 自体はバッファを持たないことを図に出す
- [x] 4.3 接続時配信が `currentQuestion` の有無だけで送ることを、現状のまま描く（design 決定4）
- [x] 4.4 図の下に、同じことを1〜2行の文章で添える

## 5. schema の資料

- [x] 5.1 `docs/schema.md` を作る。冒頭に、型の本体は `shared/types.ts`、検証の本体は `server/utils/question.ts` で、食い違ったらコードが勝つことを書く（design 決定5）
- [x] 5.2 保存されるものの形を書く。`state.json`（`phase` / `currentQuestion` / `projectName` / `invocation`）と `strokes.json`（往復の行と proposal のマーカー行）
- [x] 5.3 流れるものの形を書く。W1 が流す1問、W2 が流す proposal と名前候補
- [x] 5.4 各 endpoint の body の形を書く。U1・U7・U9・U10・A5・A7
- [x] 5.5 検証の規定を一覧にする。話題タグ12字・詳細説明300字・問い本文20字・選択肢の説明50字・選択肢1〜5件・推奨は多くとも1つ・選択肢の label に上限を置かないこと
- [x] 5.6 各項目に本体の在り処（`shared/types.ts` / `server/utils/question.ts` / `server/utils/session-store.ts`）を添える。TypeScript の型定義そのものは写さない（design 決定5）

## 6. 周りを合わせる

- [x] 6.1 `CLAUDE.md` の Docs 一覧に `docs/question-flow.md` と `docs/schema.md` の2行を足す
- [x] 6.2 `docs/api-contract.md` と `docs/stroke-modules.md` から参照を張るかを、出来上がったものを見て判断する。張らない判断も残す

## 7. 確かめる

- [x] 7.1 3枚の Mermaid が構文として通ることを確かめる
- [x] 7.2 図に書いた番号と `docs/api-contract.md` の一覧が食い違っていないことを突き合わせる
- [x] 7.3 図に書いた状態の動きが、`server/api/[id]/` の各ハンドラの実装と一致していることを突き合わせる
- [x] 7.4 `strokes.json` の積まれ方が `server/utils/session-store.ts` の書き込みと一致していることを突き合わせる
- [x] 7.5 `docs/schema.md` の検証の規定が `server/utils/question.ts` の数字と一致していることを突き合わせる
