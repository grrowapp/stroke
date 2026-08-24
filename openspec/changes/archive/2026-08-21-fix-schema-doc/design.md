## Context

動機は proposal.md（Why）を見ること。書き直しの形を決めるうえで効く制約だけを挙げる。

- `docs/schema.md` は `add-question-flow-diagrams` で作った。同じ change で `docs/question-flow.md` も作っており、往復と状態の動きはそちら側にある
- 型の本体は `shared/types.ts`。保存の検証は `server/utils/session-store.ts`、問いの検証は `server/utils/question.ts`、リクエストボディの検証は `server/utils/request-schemas.ts`
- `state.json` と `strokes.json` は zod で読み直す。読めなければ壊れた記録として弾く

## Goals / Non-Goals

**Goals:**

- 形を定義として読めるようにする
- `state.json` と `strokes.json` については、実物の検証まで含めて正確にする
- 資料の担当を分ける。形はここ、動きは `docs/question-flow.md`

**Non-Goals:**

- コードの変更
- `docs/question-flow.md` の変更（別 change `update-question-flow-doc` が扱う）
- 検証の規定（長さ・件数）を型に埋め込むこと

## Decisions

### 1. 形は TypeScript の定義で書く

散文の表をやめ、`type` / `interface` の定義をコードブロックで並べる。

**Alternatives considered:**
- 表のまま: 項目名と説明は並ぶが、ユニオンや任意フィールドの区別が表現できない。`state.json` の判別ユニオンを表2つに割った結果、`phase` を二重に書く形になった
- JSON Schema: 言語に依らない利点はあるが、この repo の本体が TypeScript なので、写し取るときに変換が挟まる。食い違いに気付きにくくなる

### 2. `state.json` と `strokes.json` は zod もそのまま併記する

TypeScript の型に加えて、`server/utils/session-store.ts` の zod を写す。

**Alternatives considered:**
- 型だけ載せる: 型からは判別キー・`min(1)`・`z.null()` の固定が読み取れない。この2つは保存の正なので、読み直しで何が弾かれるかまで見えないと足りない
- 全ての入れ物に zod を併記する: リクエストボディまで併記すると資料が二重になる。保存の正である2つに限る

### 3. 振る舞いは書かない

「U7 で1行増える」「初提出だけ」「追記だけで書き換えない」「読めなければ弾く」は落とす。

**Alternatives considered:**
- 形のそばに動きを添える: 読むのは楽だが、`docs/question-flow.md` と同じことを2箇所に書くことになる。片方を直したときにもう片方が残る

### 4. 検証の規定（長さ・件数）は表で残す

**Alternatives considered:**
- 定義に埋め込む: TypeScript の型では長さを表現できない。コメントで書くと定義の一部に見えて、実際の検証と混ざる
- 落とす: 型からは読み取れない情報がコードの奥にしか無い状態に戻る。`docs/schema.md` を作った動機そのものが消える

## Risks / Trade-offs

- **写した zod がコードから遅れる** → 併記するのは保存の2つに限り、各節に本体の在り処を書く。冒頭に「食い違ったらコードが正しい」と置く
- **change を立てずに直した分を、後から記録として起こしている** → 実装済みの内容と artifact が食い違わないよう、tasks の各項目は出来上がった `docs/schema.md` と突き合わせて確かめる
