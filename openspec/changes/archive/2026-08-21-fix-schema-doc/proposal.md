## Why

`docs/schema.md` を `add-question-flow-diagrams` で作ったが、schema の資料として成立していなかった。

- 形を散文の表で書いていた。schema と言いながら定義になっていない
- `phase` を値で表を割り、表の中でまた `phase` を書いていた。二重
- 「U7 で1行増える」「初提出だけ」「追記だけで書き換えない」など、**形ではなく振る舞い**を混ぜていた。それは `docs/question-flow.md` の担当
- `state.json` と `strokes.json` の検証（zod）を載せていなかった。この2つは保存の正なので、実物を出す必要がある

## What Changes

- 形は TypeScript の定義で書く。散文の表をやめる
- `state.json` と `strokes.json` は、TypeScript の型に加えて**実際の zod をそのまま**併記する
- 振る舞いの記述を落とす。いつ書かれ・いつ増えるかは `docs/question-flow.md` に任せる
- 部品（`Question` / `Answer` / `Annotation` ほか）・流れるもの（W1・W2）・リクエストボディ・レスポンスを定義で並べる
- 検証の規定（長さ・件数）は表のまま残す。型からは読み取れないため

**注**: この変更は既に `docs/schema.md` へ適用済み。change を先に立てずに直したため、記録として後から起こしている。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。資料だけを直し、振る舞いを変えない。

## Impact

- `docs/schema.md` — 全面的な書き直し
- コードは変更しない
