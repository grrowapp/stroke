## 1. 対象を絞る

- [x] 1.1 リクエストボディの節を落とす（U1・U7・U9・U10・A5・A7・U13）
- [x] 1.2 レスポンスの節を落とす（U2・U3・U12）
- [x] 1.3 流れるものの節を落とす（W1・W2）
- [x] 1.4 `HighlightColor` / `HighlightColorName` / `Annotation` を落とす。`state.json` にも `strokes.json` にも出てこない
- [x] 1.5 その他のファイル（`proposal.md` / `overview.txt` / `CONTEXT.md`）の表を落とす

## 2. 表と JSON のサンプルにする

- [x] 2.1 `state.json` の表を書く。項目・型・必須・中身の4列（design 決定2）
- [x] 2.2 `state.json` の JSON サンプルを2例載せる。`proposed`（問いを持つ）と `approved`
- [x] 2.3 `strokes.json` の表を書く。項目・型・必須・中身の4列
- [x] 2.4 `strokes.json` の JSON サンプルを1例載せる。往復の行とマーカー行の両方を含める
- [x] 2.5 `Question` / `QuestionOption` / `Answer` の表を書く
- [x] 2.6 `Answer` の JSON サンプルを2例載せる。`option` と `free`
- [x] 2.7 TypeScript の型定義と zod のコードブロックを全て落とす（design 決定2）

## 3. 文章を落とす

- [x] 3.1 冒頭の前置きと、本体の在り処の表を落とす（design 決定3）
- [x] 3.2 末尾の「関連」の節を落とす
- [x] 3.3 各節の補足の段落を落とす

## 4. 規定を表に入れる

- [x] 4.1 独立した「検証の規定」の節を落とす（design 決定4）
- [x] 4.2 `Question` の表に「規定」列を足す。`header` 12字・`detail` 300字・`question` 20字・`options` 1〜5件
- [x] 4.3 `QuestionOption` の表に「規定」列を足す。`label` は上限なし・`description` 50字・`recommended` は多くとも1つ

## 5. 並びを直す

- [x] 5.1 節の順を `state.json` → `strokes.json` → `Question` → `QuestionOption` → `Answer` にする（design 決定5）

## 6. 確かめる

- [x] 6.1 JSON のサンプルが、実際のセッションディレクトリのファイルと同じ形であることを突き合わせる
- [x] 6.2 表の項目と型が `shared/types.ts` と `server/utils/session-store.ts` と一致していることを突き合わせる
- [x] 6.3 表の「規定」の数字が `server/utils/question.ts` と一致していることを突き合わせる
- [x] 6.4 `state.json` と `strokes.json` 以外の入れ物が1つも残っていないことを読み返して確かめる

## 7. `fix-schema-doc` との食い違いを片付ける

- [x] 7.1 `fix-schema-doc` の design と tasks が現物と食い違っていることを、あの change に注記するか、artifact を現物に合わせるかをユーザーに確認する（design Risks）→ 確認の結果「何もしない」。archive は当時の記録として食い違ったまま残す
