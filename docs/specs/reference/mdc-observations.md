# @nuxtjs/mdc の観測記録

markdown の解釈に使っている `@nuxtjs/mdc` について、実装の途中で**推測が崩れた**事実の記録。
**同じ穴に落ちないために残す。**

崩れたのは7件。うち4件（件1・件2・件3・件7）は**黙って壊れる** — 症状が出ないまま誤った位置を
返す、あるいは markdown 本文とは別の場所が壊れる。読まなかった人が同じところで詰まるので、
事実の側を残す。件1〜件3 は `silent-failure.test.ts` が名前ごと引き受けており、番号はそちらと揃えてある。

## この資料の扱い

**ここに書くのは観測した事実だけ。** `@nuxtjs/mdc` が何を返し、何を落とし、どこで黙るかに限る。

**決定は書かない。** こちらが決めたことは1つも無く、書いてあるのは他人の実装の挙動である。
どう扱うか（正規化を誰が行うか、逃げ道を残すか）は、この資料の範囲の外にある。

**食い違ったときは実物のコードとテストが勝つ。** この資料は観測であって規定ではない。
`@nuxtjs/mdc` の挙動を規定する上位の資料は存在しない。

**この資料自身は検知を持たない。** ここに書いたテスト名が古びても、何も落ちない。テストを
改名・削除するときは、この資料も併せて直すこと。資料が指すテストは全部 `test/modules/markdown/`
配下にある。

## 出典と時点

**バージョンは `@nuxtjs/mdc@0.23.1`。** `package.json` の指定は `^0.23.1` で、**これが最新であり
上げ先が無い**（2026-08 時点）。したがって「パーサを上げたら落ちるか」は試せない。

**測り方。** 上げ先が無いので、`node_modules/@nuxtjs/mdc` の配布物を**直接変異させて**、落ちる
テストの本数を数えた。変異は逆操作で戻し、毎回 md5 の一致を確認している。詳細は「検知力の実測」。

**行番号は書かない。** 依存も自前のコードも動くので、位置はシンボル名とテスト名で探すこと。
**本数も同じ理由で動く。** 下の本数は下記の時点の実測値である。

**「固定しているもの」の突き合わせは 2026-08-30 に行った。** この時点で
`adr0017-sub-add-detection-assumptions`（検知を足す担当）は未着手であり、**その時点で在る検知だけ**を
書いている。固定するものが無い件は、空欄にせず「まだ固定するものが無い」と明記した。

## 崩れた前提 7 件

| 件 | 内容 | 黙って壊れるか |
|---|---|---|
| 件1 | 解析を自前で組み直すとハイドレーションが壊れ、markdown の外（アイコン）が消える | **黙る** |
| 件2 | offset 0 から始まるノードは `position` を丸ごと落とす。フェンスに限らない | **黙る** |
| 件3 | `position` が記号を含むのはインラインコードだけ。他の記法は内側どうしで揃う | **黙る** |
| 件4 | `keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではない | 型で落ちる |
| 件5 | `pre` の `position` も `code` も DOM に出ない | — |
| 件6 | フェンスの生テキストと表示文字列の差は5つ。行の並びは保たれる | — |
| 件7 | CRLF と front matter は実際に含まれうる。基準がずれると `null` に倒れず別の場所を返す | **黙る** |

---

### 件1 解析を自前で組み直すとハイドレーションが壊れる

**何が起きるか。** `<MDC>` に描かせず `parseMarkdown` を自分で呼ぶ形にすると、クライアントが
解析をもう一度走らせ、shiki が SSR と違う色を出す。Vue がハイドレーションを諦めて描き直し、
その描き直しが**アプリ全体のアイコンの消失**として現れた。

**なぜそう思わなかったか。** 症状が markdown 本文に出ない。描き直された本文は客側の解析結果として
正しく見えるので、本文の中身を確かめる検査は素通りする。見つけたのは全画面のピクセル差分だった。

**固定しているもの**

- `test/modules/markdown/runtime/position/silent-failure.test.ts` の
  `件1: 解析の段を自前で組み直させない`（6本）
- `test/modules/markdown/runtime/render/markdown-view-position.test.ts` の
  ``解析の段は `<MDC>` に残っている``（3本）
- `e2e/markdown-hydration.spec.ts` の `markdown を描く画面のハイドレーション`（1本）。
  症状の側の網で、形を保ったまま別の理由でずれた場合にも落ちる

---

### 件2 offset 0 から始まるノードは `position` を落とす

**何が起きるか。** `@nuxtjs/mdc` の `parser/compiler.js` が `node.position?.start?.offset && …` で
判定しており、**0 が偽として落ちる**。結果、そのノードには `position` が丸ごと乗らない。
そこへ 0 を書き戻すと、文書の冒頭が `[0,0)` を指す空の範囲になる。

**なぜそう思わなかったか。** 最初は「文書がフェンスで始まるときだけの話」と読んでいた。実際は
**offset 0 から始まるあらゆるノード**が該当する。段落でも見出しでも同じように落ちる。

**固定しているもの**

- `test/modules/markdown/runtime/position/silent-failure.test.ts` の
  `件2: offset 0 と「位置が無い」を取り違えない`（6本）
- `test/modules/markdown/fence-source.test.ts` の `位置が取れない条件`（5本）
- `test/modules/markdown/runtime/position/pre-mark.test.ts` の
  `フェンスの pre に位置の印が乗る`（8本）
- `test/modules/markdown/runtime/position/preview.test.ts` の
  `空の属性を「offset 0」と読まない`（2本）。空文字を `Number` に通すと 0 になる経路を塞ぐ

---

### 件3 `position` が記号を含むのはインラインコードだけ

**何が起きるか。** インラインコード（`` `x` ``）の text ノードの `position` はバッククォートを
含む。一方、強調・リンク・見出し・リスト・引用・表・打ち消しは**内側どうしで揃う**（記号を
含まない）。差を長さの按分で埋めると、**1〜2文字ずれた位置を黙って返す**。

**なぜそう思わなかったか。** 「記号を持つ記法は記号を含むはず」という当たりの付け方をした。
これは通らない。記法ごとに実測するしかなく、推論では出ない。

**固定しているもの**

- `test/modules/markdown/runtime/position/silent-failure.test.ts` の
  `件3: 記法ごとに position が記号を含むかを実測して列挙する`（17本）/
  `件3: 面から選んだ範囲が、按分ではなく照合で決まる`（15本）/
  `件3: 字が見つからない記法は null を返す（推測で返さない）`（2本）
- `test/modules/markdown/runtime/position/edge-cases.test.ts` の
  `記法ごとに、text ノードの position が記号を含むか`（28本）

---

### 件4 `keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではない

**何が起きるか。** module の設定ブロック（`installModule('@nuxtjs/mdc', …)` に渡す
`ModuleOptions`）に `keepPosition` を書いても効かない。位置を残させる設定は `parseMarkdown` に
渡す `MDCParseOptions` の側にあり、`<MDC>` からは `parser-options` で渡す。

**なぜそう思わなかったか。** 解析の設定は解析の設定なので、他の解析オプション（`rehypePlugins`・
`headings`）と同じ場所に置けると読んだ。置き場が2つに分かれている。

**固定しているもの**

- **テストではなく型で落ちる。** `ModuleOptions` に `keepPosition` を書くと TS2353 になる。
  **落ちる先は `yarn typecheck`** であって `yarn test` ではない
- `parser-options` から渡す経路そのものは
  `test/modules/markdown/runtime/render/markdown-view-position.test.ts` の
  `位置の印が DOM へ出る経路`（3本）が固定している

---

### 件5 `pre` の `position` も `code` も DOM に出ない

**何が起きるか。** `MDCRenderer` は text ノードを描くときに `node.position` を捨てる。`pre` の
`code` 属性も、`MarkdownCode` の props 宣言に取られて `attrs` から抜ける。したがって**描かれた
DOM の側からはフェンスの生テキストの位置も中身も引けない**。位置の印は描く前に自分で打つほかない。

**なぜそう思わなかったか。** AST に乗っている値は素直に属性として出てくると読んだ。描画側で
落ちる。

**固定しているもの**

- `test/modules/markdown/runtime/position/pre-mark.test.ts` の
  `フェンスの pre に位置の印が乗る`（8本）
- `test/modules/markdown/fence-source.test.ts` の `位置が取れない条件`（5本）
- 印が無い場合の逃げ道（生テキストの走査）は
  `test/modules/markdown/runtime/position/edge-cases.test.ts` の
  `印の無い pre だけが、生テキストの走査へ落ちる`（6本）。照合が通らなければ `null` を返し、
  推測を黙って通さないことまで固定している

---

### 件6 フェンスの生テキストと表示文字列の差は5つ

**何が起きるか。** `pre` の `position` が指す生テキストと、`code` 属性に入る表示文字列は一致しない。
差は次の5つである。

1. **タブは「4桁のタブストップまで」の空白に開く。** 4つの空白への置換ではない
2. **器のインデントが各行から剥がされる**（インデントされたフェンス）
3. **引用記号 `> ` が各行から剥がされる**（引用の中のフェンス）
4. **最後の行に改行が無くても、`code` には必ず足される**
5. **情報行のメタは `code` に入らない。** 属性へ分かれる

**行の並びは保たれる。** フェンスの内側の行数と `code` の行数は一致するので、行単位の対応は
作れる。ただし4スペースのインデントコードブロックだけは対応が崩れる。

**なぜそう思わなかったか。** 「差はタブ展開だけ」と読んでいた。剥がす量は推測せず照合で決める
必要がある。

**固定しているもの**

- `test/modules/markdown/fence-source.test.ts` の `code 属性と生テキストの差`（9本）/
  `行の並びは保たれる`（2本）/ `pre の position が指す範囲`（3本）。**差そのもの**を固定する側
- `test/modules/markdown/runtime/position/fence.test.ts`（45本、10 の `describe`）。差を**埋める
  実装**の側。両者は写し元が違うので分けてある

---

### 件7 CRLF と front matter で基準がずれる

**何が起きるか。** `parseMarkdown` は解析の前に CRLF を LF へ潰し、front matter を取り除く。
返る `position` は**そのあとの文字列**を指す。呼ぶ側が生ファイルの文字列を基準に使うと、
**`null` に倒れず黙って別の場所を返す。** CRLF の文書で3つめの段落の `x` を選ぶと2つめの段落の
`x` が返り、返る字が同じなので受け取る側からは見えない。

**なぜそう思わなかったか。** 「CRLF も front matter も実際には来ない」と読んだ。**来る。**
本家 spec-workflow-mcp は `readFile` / `writeFile` で素通しし、改行を触るコードが配布物に0件。
front matter を作る依存も持たないが、文書を書くのは AI か人間である。こちら側の正規化も0件だった。

**固定しているもの**

- `test/modules/markdown/runtime/position/edge-cases.test.ts` の
  `CRLF と front matter は、正規化した後の基準で揃える`（5本）。①正規化すれば正しい
  ②生ファイルだと黙って誤る ③正規化で誤りが消える の3つを固定している
- `test/modules/markdown/fence-source.test.ts` の `位置が取れない条件`（5本）のうち2本が、
  解析の前に CRLF と front matter が落ちること自体を固定している

## 検知力の実測

パーサに上げ先が無いため、**配布物を直接変異させて**落ちるテストの本数を数えた。測ったのは
テストが 143本 の時点である（現在は増えているので、本数は目安として読むこと）。

**落ちた変異は5件。それぞれ 14〜58本が落ちる。**

| 変異 | 何を変えたか |
|---|---|
| タブストップ幅 | タブを開く桁を4から変える |
| offset 0 の真偽判定 | `position.start.offset && …` を `!= null` に直す |
| 末尾改行の付与 | `code` の末尾に改行を足すのをやめる |
| `rehype-raw` の無効化 | 生 HTML を通すようにする |
| `pre` の範囲 | `position` が指す開き・閉じの位置をずらす |

**素通りした変異が3件ある。**

| 素通りした変異 | 出力がどう変わるか |
|---|---|
| `li` の段落ほどきを止める | `<li>項目<br>つづき</li>` が `<li><p>項目</p><p>つづき</p></li>` になる。歩く DOM の形も見える文字も変わる |
| 改行だけの text ノードの除去を止める | `ul` / `li` / `blockquote` / `table` に `\n` のノードが入り、**以降のオフセットが全部ずれる** |
| 見出しの id の作り方を変える | アンカーの値が変わる |

**素通りの意味。** テストはフェンスの幾何と text ノードの位置をよく固めているが、**AST の構造を
何も固めていない。** マイナーリリースが最も変えやすいのがこの層である。

**この3件は、まだ固定するものが無い。** 引き取り先は `adr0017-sub-add-detection-assumptions`。

なお `test/modules/markdown/runtime/position/plain.test.ts`（30本）はパーサを呼ばないため、
**検知力を持たない。** 純粋な DOM と文字列の対応を見るテストであり、パーサの変化を捉える役ではない。

## ハイドレーション検知が拾えない範囲

`e2e/markdown-hydration.spec.ts` は SSR が送った HTML とハイドレーション後の DOM を突き合わせるが、
**拾えない食い違いが2つある。**

**属性だけのずれが拾えない。** Vue は本番ビルドで要素の属性のずれを直さない。実測では、配る HTML の
`style` を書き換えても、ハイドレーション後の DOM はサーバの値のまま残った。つまり SSR と客側で
**色だけが違う**場合は素通りする。拾えるのは字と要素の並びのずれ（Vue が描き直す側のずれ）で、
実測した症状であるアイコン消失はそちらの結果である。

**この環境ではアイコン消失そのものが再現しない。** `@nuxt/icon` のカスタムコレクションが 404 で
読めておらず、SSR も客側も空の `<svg>` を出すだけになる。件1 の症状を症状のまま再現する検知は、
この環境では作れない。

## 参照

行番号は書かない。シンボル名とテスト名で探すこと。

**実装**

- `modules/markdown/index.ts` の `installModule('@nuxtjs/mdc', …)` — 解析の設定の**実体**。
  `rehype-raw` の無効化・`headings.anchorLinks`・`components.map.pre` はここにある。
  移設したテストが持つ `PARSE_OPTIONS` はこの写しであり、片方だけ変えると意味を失う
- `modules/markdown/runtime/render/MarkdownView.vue` — `<MDC>` のスロットだけを差し替える形
  （件1）。`parser-options` で `keepPosition` を渡す経路（件4）
- `modules/markdown/runtime/position/source-span.ts` — 位置の印を打つ（件2・件5）
- `modules/markdown/runtime/position/fence.ts` — フェンスの対応表（件6）
- `modules/markdown/runtime/position/preview.ts` / `plain.ts` — 整形された本文と生テキストの面

**テスト**

- `test/modules/markdown/sanitize.test.ts` — 既定のサニタイズが**属性しか落とさない**こと。
  生 HTML が要素にならないのは `rehype-raw` を切っているためであって既定の挙動ではない
- `test/modules/markdown/fence-source.test.ts` — 件2・件5・件6・件7 の**差そのもの**を実測で固定する。
  `runtime/position/fence.ts` を書く人はここを先に読むこと（`fence.test.ts` は差を埋める側の検査で、
  差の一覧はこちらにある）
- `test/modules/markdown/runtime/edit/roundtrip.test.ts` — TipTap の往復で表が潰れること。
  変換を挟まない編集を選んだ根拠
- `test/modules/markdown/runtime/position/` — `silent-failure` / `edge-cases` / `fence` /
  `preview` / `plain` / `pre-mark` / `normalize`
- `test/modules/markdown/runtime/render/markdown-view-position.test.ts` — 位置の対応が外から
  引ける形で公開されていること
- `e2e/markdown-hydration.spec.ts` — 件1 の症状の側の網

**関連する資料**

- `docs/specs/reference/stroke-modules.md` — モジュールの使い方
- `docs/specs/core/system-structure.md` — テストをソースの構造の写しに置く規定
