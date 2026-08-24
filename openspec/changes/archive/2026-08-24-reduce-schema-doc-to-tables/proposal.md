## Why

`fix-schema-doc` で `docs/schema.md` を TypeScript の型と zod で書いたが、読む側の求めと合っていなかった。

- 対象を広げすぎた。リクエストボディ・レスポンス・W1/W2 まで載せていたが、要るのは `state.json` と `strokes.json`
- 形の示し方が合っていない。要るのは表と JSON のサンプルで、TypeScript の型でも zod でもない
- 説明の文章が多い。表とサンプルで足りる

## What Changes

- 対象を `state.json` と `strokes.json` の2つに絞る。リクエストボディ・レスポンス・W1/W2・`Annotation` 系を落とす
- 形は**表**（項目・型・必須・中身）と**JSON のサンプル**で示す。TypeScript の型定義と zod のコードは載せない
- 説明の文章を落とす。冒頭の前置き、本体の在り処の表、末尾の「関連」も置かない
- 長さ・件数の規定は独立した節をやめ、`Question` と `QuestionOption` の表に「規定」列として入れる
- 節の順は `state.json` → `strokes.json` → それが使う型（`Question` / `QuestionOption` / `Answer`）

**注**: この変更は既に `docs/schema.md` へ適用済み。指示を受けながら直したため、記録として後から起こしている。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。資料だけを直し、振る舞いを変えない。

## Impact

- `docs/schema.md` — 全面的な書き直し
- `openspec/changes/fix-schema-doc/` — design と tasks が現物と食い違ったまま残る。この change で扱いを決める
- コードは変更しない
