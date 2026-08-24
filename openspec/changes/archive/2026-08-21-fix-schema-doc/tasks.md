## 1. 形を定義で書き直す

- [x] 1.1 冒頭を、この資料が形を扱うことと、本体の在り処（`shared/types.ts` / `question.ts` / `request-schemas.ts` / `session-store.ts`）と、食い違ったらコードが正しいことに直す（design 決定1）
- [x] 1.2 部品を定義で並べる。`Phase` / `Invocation` / `QuestionOption` / `Question` / `Answer` / `HighlightColor` / `Annotation`
- [x] 1.3 流れるものを定義で書く。W1 が流す1問、W2 の `ProposalMessage`
- [x] 1.4 リクエストボディを定義で書く。U1・U7・U9・U10・A5・A7。U13 はボディを取らないことを添える
- [x] 1.5 レスポンスを定義で書く。U2・U3・U12

## 2. 保存の2つを正確にする

- [x] 2.1 `state.json` の TypeScript の型を書く。`phase` で判別するユニオン、`approved` は `currentQuestion` と `invocation` を持たないこと（design 決定2）
- [x] 2.2 `state.json` の zod を `server/utils/session-store.ts` からそのまま写す。`activeStateFields` が `stroking` / `proposed` で共有されることが読み取れる形にする
- [x] 2.3 `strokes.json` の TypeScript の型を書く。`proposal` で判別するユニオンの配列、マーカー行の `question` / `answer` が `null` 固定であること
- [x] 2.4 `strokes.json` の zod を写す。`strokeSchema` と `answerSchema` の両方
- [x] 2.5 その他のファイル（`proposal.md` / `overview.txt` / `CONTEXT.md`）は形を持たないので、中身の種類だけ表で残す

## 3. 振る舞いを落とす

- [x] 3.1 「U7 で1行増える」「A7 の初提出だけ」「追記だけで書き換えない」を消す（design 決定3）
- [x] 3.2 「読めなければ壊れた記録として弾く」「A5 は 400」を消す
- [x] 3.3 `phase` ごとに表を割っていた形をやめ、判別ユニオンの定義1つにする
- [x] 3.4 ファイル一覧から「書き手」の列を落とす。誰が書くかは `docs/question-flow.md` の担当

## 4. 検証の規定を残す

- [x] 4.1 問いの規定（`header` 12字・`detail` 300字・`question` 20字・`options` 1〜5件・`description` 50字・`label` は上限なし・`recommended` は多くとも1つ）を表で残す（design 決定4）
- [x] 4.2 リクエストボディの上限を表で残す。項目名は定義に出てくる名前で書く
- [x] 4.3 プロジェクト名に長さの上限が無いことを残す

## 5. 確かめる

- [x] 5.1 写した zod が `server/utils/session-store.ts` の現物と一字一句食い違っていないことを突き合わせる
- [x] 5.2 定義した型が `shared/types.ts` と食い違っていないことを突き合わせる
- [x] 5.3 検証の規定の数字が `question.ts` と `request-schemas.ts` の現物と一致していることを突き合わせる
- [x] 5.4 振る舞いの記述が1つも残っていないことを読み返して確かめる
