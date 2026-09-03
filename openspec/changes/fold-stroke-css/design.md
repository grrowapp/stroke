## Context

動機は proposal.md「Why」。ここは畳んだ先の形だけを決める。

`main.css` は3区画に分かれており、それぞれ出どころが違う（change
`adopt-upstream-design-tokens` が置いた区切り）。

| 区画 | 出どころ | 名前 |
| --- | --- | --- |
| 上層 | prototype `navigation.prototype.html` | `.sb-bar` `.sb-table` `.sb-notice` … |
| 下層 | 本家 spec-workflow-mcp v2.2.7 の写し | `.sb-spinner` `@keyframes sb-loader-blink` … |
| ストローク | 写す元が無い。この repo が決める | `.sb-stroke-page` `.sb-stroke-card` `--sb-stroke-bar-h` |

`stroke.css` が持つのは実質2つだけ — `@keyframes blink` と `.blink`（および
`prefers-reduced-motion` の打ち消し）。当てているのは `WaitingIndicator.vue`（待機）と
`strokes/[sessionId]/proposal.vue` の問い返しの帯（要注意）で、どちらもストロークの画面。
つまり畳む先は迷わずストロークの区画である。

制約:

- **見た目を変えない。** `adopt-upstream-design-tokens` と同じ立場を引き継ぐ。畳むのは
  置き場の話で、動きの話ではない
- `@keyframes` の名前空間は cascade layer を跨いで文書全体で1つ。`@layer components` の
  中に書いても、外の `@keyframes blink` と同じ土俵に立つ

## Goals / Non-Goals

**Goals:**

- アプリのスタイルを `main.css` の1本にする
- ストロークの明滅が、名前でストロークの持ち物だと分かる状態にする
- 描画結果を現状と同一に保つ

**Non-Goals:**

- 明滅の見え方（速さ・濃さ・曲線）を変えること
- 下層の `sb-loader-blink` と1本に統合すること
- ストロークの区画へ、畳む対象以外の定義を足すこと
- `nuxt.config.ts` の `css` 以外の設定に触ること

## Decisions

### 決定1: 移す先はストロークの区画。`:root` ではなく `@layer components` の中

`.sb-stroke-page` `.sb-stroke-card` と同じ `@layer components` のブロックへ入れる。
`@keyframes` はブロックの中に書ける（`sb-notice-in` `sb-spin` `sb-loader-blink` が
既にそうしている）ので、区画をまたがずに済む。

`prefers-reduced-motion` の打ち消しは、下層が `@layer components` の中に
`@media (prefers-reduced-motion: reduce)` を置いている（`main.css` の
`.sb-row-creating` / `.sb-spinner`）ので、同じ形に揃える。

**代替（採らない）:** ファイル末尾の `::highlight()` の区画のように `@layer` の外へ置く。
外に出す理由は `::highlight()` が要素のスタイルではないからで、`.blink` は普通のクラス。
外に出すと Tailwind のユーティリティより後に来て詳細度の勝ち負けが変わる。

### 決定2: 名前は `sb-stroke-blink` にする

クラスも `@keyframes` も `.sb-stroke-blink` / `@keyframes sb-stroke-blink` にする。

理由は3つ。(1) `main.css` の中で `sb-` を持たない名前はこれだけになる。(2) `@keyframes`
の名前空間は1つで、隣に `sb-loader-blink` が在る。素の `blink` のままだと、2つの明滅の
どちらがどの区画の持ち物か名前から読めない。(3) 区画の中では `sb-stroke-` を接頭辞に
するという決めが `adopt-upstream-design-tokens` の決定2で既に立っている。

**代替（採らない）:**

- `.blink` のまま移す — コンポーネント2つと doc 1行を触らずに済むが、上の3つが全部残る。
  畳む目的が「1つのアプリの中で見た目が割れない」ことなら、名前で持ち主が分かることは
  ファイルを1本にすることと同じ目的に属する
- `.sb-blink` にする — 接頭辞は付くが、どの区画かは分からない。3区画あることが
  `main.css` の前提なので、区画を名乗らせる

### 決定3: 下層の `sb-loader-blink` と揃えない

2つの明滅は値が違う。

| | 曲線 | 谷 | 周期 |
| --- | --- | --- | --- |
| `sb-loader-blink`（下層） | `linear`、明暗を長く保持 | 0.25 | 1.6s |
| ストロークの明滅 | `ease-in-out` | 0.35 | 1.1s |

下層側には ui.md の確定値としての根拠がある（「`ease` を入れると中間の濃さに留まって
U 字に沈む」ので `linear`）。**それでもストローク側を寄せない。** 根拠は下層のローダー
という用途に対して出されたもので、ストロークの明滅は用途が違う——待機の表示と、AI からの
問い返しを知らせる帯。前者は「まだ続いている」、後者は「あなたの番だ」を示す。
そして何より、寄せれば見た目が変わる。この change は置き場を畳むもので、動きを決め直す
ものではない。

値の差は残るので、移した先のコメントに **なぜ2つ在るのか** を書く。書かないと、次に
読む人が「重複だから片方消せる」と読む。

### 決定4: `nuxt.config.ts` の `css` は配列のまま1要素にする

`css: ['~/assets/css/main.css']`。文字列1つに畳まない（Nuxt の `css` は配列を取る）。
脇のコメントは実態に合わせて書き換える。

### 決定5: `main.css` 冒頭 3 行目のコメントを直す

`/* ストローク側（stroke.css / 画面2 の proposal 表示）が typography を使う */` は
`@plugin "@tailwindcss/typography"` の理由書き。`stroke.css` が消えるので名指しを外し、
使っている実体（画面2 の proposal 表示）だけを残す。typography プラグイン自体は残す。

## Risks / Trade-offs

- **改名を1箇所やり残すと明滅が止まる** → 当てているのは2ファイル。`blink` の全文検索で
  残りが0件であることを確認する。テストが名指ししている箇所は無い（確認済み）ので、
  E2E は落ちずに素通りする種類の漏れになる。検索での確認が唯一の網
- **`stroke.css` を消し忘れたまま `nuxt.config.ts` から外すと、気付かず孤児が残る** →
  同じコミットで削除する
- **`@layer components` へ入れることで詳細度が変わる** → 変わらない。`stroke.css` は
  レイヤーに属さない（= 最も強い扱い）ところに在ったが、`.blink` が当てるのは
  `animation` だけで、Tailwind のユーティリティに `animation` を当てているものが
  同じ要素に無い（`WaitingIndicator` は `text-center text-sm text-muted`、
  問い返しの帯は色と余白のみ）。競合しないので勝ち負けは起きない

## Migration Plan

1コミットで済む。段階を分けない — 分けると `stroke.css` が読み込まれない状態で
古いクラス名が残る中間状態ができ、そこだけ明滅が止まる。

戻すときはコミットを revert する。`stroke.css` は独立したファイルで、他から参照
されていない。
