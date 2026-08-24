## Context

動機は proposal.md（Why）を見ること。

- `docs/schema.md` は `add-question-flow-diagrams` で作り、`fix-schema-doc` で TypeScript の型と zod の形に直した
- 型の本体は `shared/types.ts`、`SessionState` は `server/utils/session-store.ts`、問いの検証は `server/utils/question.ts`
- 往復と状態の動きは `docs/question-flow.md` が持つ

## Goals / Non-Goals

**Goals:**

- `state.json` と `strokes.json` の形を、表と JSON のサンプルだけで示す
- 資料から説明の文章を無くす

**Non-Goals:**

- コードの変更
- `docs/question-flow.md` の変更
- `state.json` / `strokes.json` 以外の入れ物

## Decisions

### 1. 対象は `state.json` と `strokes.json` の2つだけ

**Alternatives considered:**
- 往復に出てくる全ての入れ物: 引く先が増える割に、リクエストボディは `docs/api-contract.md`、流れるものは `docs/question-flow.md` から辿れる。二重になる
- ファイルの一覧だけ: 形が分からず、資料の意味が無い

### 2. 形は表と JSON のサンプルで示す

表は「項目・型・必須・中身」。あわせて、実際のファイルの中身と同じ JSON を1〜2例載せる。

**Alternatives considered:**
- TypeScript の型定義: 本体（`shared/types.ts`）の写しになり、直したときに必ず遅れる。読む側が TypeScript を読める前提にもなる
- zod の併記: 検証の実物という利点はあるが、コードを2箇所に置くことになる。長さ・件数だけなら表で足りる
- JSON Schema: この repo に前例が無く、本体との対応を確かめる手間が増える

### 3. 説明の文章を置かない

前置き、本体の在り処の表、末尾の「関連」も置かない。

**Alternatives considered:**
- 冒頭に本体の在り処を残す: 有用だが、それも文章。必要なら `docs/question-flow.md` と `CLAUDE.md` の一覧から辿れる
- 各表に補足を添える: 表の「中身」列で足りる

### 4. 長さ・件数の規定は表の列に入れる

独立した節をやめ、`Question` と `QuestionOption` の表に「規定」列を足す。

**Alternatives considered:**
- 独立した節: 項目名を2度書くことになり、対応を目で追う必要が出る
- 落とす: 型からは読み取れない情報が消える

### 5. 節の順は `state.json` → `strokes.json` → 使う型

**Alternatives considered:**
- 使う型を先に置く: 部品から積み上げる並びだが、この資料は「保存されるファイルの形」を引くためのもの。ファイルが先

## Risks / Trade-offs

- **JSON のサンプルが実物とずれる** → 実際のセッションディレクトリの中身と突き合わせて作る
- **表の「規定」が `server/utils/question.ts` から遅れる** → 数字を現物と突き合わせて確かめる
- **`fix-schema-doc` の artifact が現物と食い違ったまま残る** → この change で `fix-schema-doc` の design と tasks を現物に合わせるか、その旨を注記する
