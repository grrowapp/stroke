## Context

動機は proposal.md（Why）を見ること。図の置き方を決めるうえで効く制約だけを挙げる。

- `docs/` は Markdown のみ。画像ファイルは1つも置いていない
- `docs/api-contract.md` は表で endpoint を並べ、U/W/A の番号で引ける
- 登場するのは4者（ユーザー・画面・サーバ・エージェント）。エージェントは `claude -p` で、HTTP で取りに来て出しに来る
- サーバが持つファイルは2つ。`state.json` が今の局面と今の1問、`strokes.json` が済んだ往復の積み上げ。WS はバッファを持たない
- `strokes.json` は回答の受理（U7）で1行増え、proposal の初提出（A7）でマーカー行が1行増える。読み手は U3（画面のパンくずと、エージェント）

## Goals / Non-Goals

**Goals:**

- 誰がいつ何を送るかを、1枚で追えるようにする
- `state.json` の各項目と `strokes.json` の行が、どの受理でどう変わるかを見えるようにする
- 今の1問を持つ `state.json` と、済んだ往復を積む `strokes.json` の役割の違いを、図の上で分ける
- 接続時配信と提出時配信の違いを、経路として示す

**Non-Goals:**

- コードの変更
- 既存の文章の書き換え
- 画面の見た目（レイアウト）の図。扱うのは往復と状態だけ
- 図の自動生成。手で書いて手で直す

## Decisions

### 1. Mermaid を Markdown に直接埋める

**Alternatives considered:**
- 画像ファイル（PNG/SVG）を `docs/` に置く: 差分が読めず、直すたびに再生成が要る。この repo に画像を置いた前例も無い
- ASCII 図: 依存が無いのは利点だが、シーケンスと状態遷移は線が増えると手で保てなくなる

### 2. 図は3枚に分ける。1枚に詰め込まない

並び（シーケンス）・状態（遷移）・配信（経路）は問いが別なので、1枚にすると全部が読めなくなる。

**Alternatives considered:**
- 全部入りの1枚: 情報量は同じだが、どこを見ればよいかが分からなくなる
- 4枚以上に割る: 画面ごとに割ると、往復が画面をまたぐ様子が切れる

### 3. 番号は `docs/api-contract.md` と揃える

図の中の矢印には U1・U7・U13・A5・A7・W1・W2 の番号を書く。

**Alternatives considered:**
- パスをそのまま書く: 長くなり、図が文字で埋まる
- 番号を振り直す: 対応表が1つ増えるだけで、既存の資料と突き合わせられなくなる

### 4. 図に「今どうなっているか」を書く。あるべき姿は書かない

`currentQuestion` が回答後も残ること、接続時配信がそれを流すことは、そのまま図に出す。今おかしいと分かっている箇所も、図の上では現状のまま描く。

**Alternatives considered:**
- あるべき姿を描く: 資料が実装と食い違い、読んだ人が実装のバグに気付けなくなる
- おかしい箇所に注記を足す: 注記の当否がこの change の範囲を超える。事実だけ描いて、判断は読む人に残す

### 5. schema は別ファイルにし、型は写さず制約を書く

`docs/schema.md` には、入れ物の形（`state.json` / `strokes.json` / W1・W2 が流すもの / 各 endpoint の body）と、**検証の規定**を書く。

型の定義そのもの（`Question` / `Answer` / `Stroke` の TypeScript）は `shared/types.ts` が本体なので写さない。写すのは、型からは読み取れない検証の規定——長さの上限、件数の上限、推奨が多くとも1つであること——に限る。これらは今 `server/utils/question.ts` にしか無い。

各項目には、その本体がどこにあるか（`shared/types.ts` / `server/utils/question.ts` / `server/utils/session-store.ts`）を添える。

**Alternatives considered:**
- 型もまとめて写す: 読むのは楽になるが、`shared/types.ts` を直したときに必ず遅れる。食い違ったとき、どちらが本体か分からなくなる
- 図の資料に混ぜる: 図は流れ、schema は形で、引くときの目的が違う。混ぜると両方引きにくくなる
- schema を書かない: 検証の規定がコードの奥にしか無い状態が続く。今回の見落としと同じ根

### 6. 置き場所は `docs/question-flow.md`

**Alternatives considered:**
- `docs/api-contract.md` に足す: あれは境界の定義で、引くための資料。読み物を混ぜると引きにくくなる
- `docs/stroke-modules.md` に足す: あれは画面側の使い方。サーバとエージェントを含む往復は範囲外

## Risks / Trade-offs

- **図が実装から遅れる** → 描くのは往復と状態の骨格に留め、関数名やファイル名を図に入れない。骨格が変わるのは endpoint が増減したときだけ
- **Mermaid が表示できない環境がある** → 各図の下に、同じことを1〜2行の文章で添える
- **schema.md の検証の規定がコードから遅れる** → 数字を書いた各行に、本体が `server/utils/question.ts` であることを明記する。食い違ったらコードが勝つと冒頭に書く
