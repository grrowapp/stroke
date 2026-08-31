## 1. 黙って壊れる3件を先に塞ぐ

design.md R4 のとおり、途中で力尽きても価値が残る順に並べる。

### 1.1 解析を自前で組み直したら落ちる（6.1）

- [x] 1.1.1 `test/modules/markdown/runtime/render/markdown-view-position.test.ts` に、**`<MDC>` のスタブが実際に描かれたこと**を確かめる検査を足す（design.md 決定2の主）
  - describe「解析の段は `<MDC>` に残っている」3本。スタブの `created` で数え、`mdc.count` を見る
- [x] 1.1.2 補助として、`MarkdownView.vue` が `parseMarkdown` を import していないことを見る検査を1本置く（design.md 決定2の代替1。**従**であることをコメントに書く）
  - **重複を作らなかった。** 同じ文字列検査が `silent-failure.test.ts` の「件1」に既に5本ある（`parseStageViolations` は `parseMarkdown` / `useAsyncData` / `<MDC>` / `keepPosition` / `markSourcePosition` の5つを見る）。もう1本置くと同じことを2箇所で固定して片方が腐るので、**あの束の頭に「ここは従。主は markdown-view-position の側」と書き、主の側にも相互の指し先を書いた**（R6 の「偽陽性が続くなら代替1だけ落とす」もそこに残した）
- [x] 1.1.3 `MarkdownView.vue` の `<MDC>` を自前の `parseMarkdown` 呼び出しへ**実際に書き換えて**、1.1.1 が赤くなることを確かめる。確かめたら戻す
  - **実測（2026-08-30）。** `<MDC>` を消し、`watchEffect` + `parseMarkdown(props.value, { keepPosition: true })` の自前呼び出し＋直の `MDCRenderer` へ書き換えた → **12本落ちた**
    - `markdown-view-position.test.ts` **7本**（うち今回足した5本: `<MDC>` が実際に描かれる／`parser-options` で `keepPosition` を渡している／スロットへ来た AST は包まれてから `MDCRenderer` へ渡る／印が出ていれば器ぜんたいの選択が端から端まで／印が1つも無いと切り詰めた範囲）
    - `silent-failure.test.ts` **5本**（件1の4本＋件2の1本）
  - 書き換えは `git checkout --` で戻し、控えとの `diff` で同一を確認した
- [x] 1.1.4 `MarkdownView.vue` と `modules/markdown/index.ts` のコメントを、実測の根拠つきで確定させる（6.1.3。既に書いてあるものの見直し）
  - 両方に「主・従・症状の側がどれか」と 1.1.3 の実測（12本）を追記。`index.ts` の TS2353 は 3.1 で実測した文面へ差し替えた

### 1.2 offset 0 と「位置が無い」の取り違え（6.2）

- [x] 1.2.1 `readOffset`（`position/preview.ts`）の `Number('') === 0` を塞ぐ。**いまのガード `Number.isInteger(parsed) && parsed >= 0` は空文字を通す**
  - `if (value.trim() === '') return null;` の1行だけ。入口・出口には触っていない（`adr0017-sub-fix-normalization-offset` が後で同じファイルを触るため）
- [x] 1.2.2 空の属性が有効なオフセット 0 として読まれないことを `preview.test.ts` に固定する
  - describe「空の属性を「offset 0」と読まない」2本（空文字・空白だけ）
  - **同じ字の段落を2つ置く形にした。** `まえ\n\nいろは…` では、空の属性で範囲が頭まで広がっても `alignWrapper` の照合が正しい位置へ当たってしまい（差が偶数で中央に一致）、ガードの有無で結果が変わらない。`いろはにほへと\n\nいろはにほへと\n` にすると、ガードを外したとき**前の段落の `いろは`（0..3）**が返る＝「黙って冒頭を指す」が見える
- [x] 1.2.3 位置を持たないノードに 0 を書いたら落ちるテストが、`source-span` と `fence` の**両方**にあることを確かめる（`pre-mark.test.ts` に1本ある。他の経路を塞ぐ）
  - 経路は3つあり、いま全部塞がっている: **AST の側** = `silent-failure.test.ts` 件2の「包みの経路」2本、**`pre` の側** = `pre-mark.test.ts`「位置を持たない pre には印を付けない」、**属性を読む側** = 1.2.2 の2本（今回追加）
- [x] 1.2.4 文書の冒頭から選んだ範囲が正しく取れることを `preview` と `plain` の両方で確かめる
  - `silent-failure.test.ts` の「整形された本文: 冒頭から選んだ範囲が取れる」「生テキストの面: 冒頭から選んだ範囲が取れる」。どちらもキャレット（0..0）まで見ている。追加は要らなかった
- [x] 1.2.5 `FenceSource.position` の判定が平坦な形に変わっても壊れないことを確かめる（`!position` はいまオブジェクトだから正しいだけ。`!position?.start` に書き換えると4本落ちる、が親の実測）
  - **判定は `!position` のままにした。** `position === null` を足すと `SourceRange | undefined` との比較で TS2367 になり、型を広げるのは「判定のみ」の範囲を超える。代わりに**なぜ正しいのか（形に助けられているだけ）**と `!position.start` と書いてはならない理由をコメントで固定した
- [x] 1.2.6 **わざと壊して落ちることを確かめる**（1.2.1 のガードを外す／`!position?.start` へ書き換える）。落ちた本数を下に書く
  - **ガードを外した**（`if (value.trim() === '') return null;` を削除）→ **2本**（`preview.test.ts` の 1.2.2 の2本）
  - **`!position` → `!position?.start`** → **4本**（`edge-cases`「走査の経路: 文書がフェンスで始まると印が落ちる」「両方の経路: 印の落ちたフェンスと印の付いたフェンスが混ざっても」／`preview`「先頭から始まるフェンス（position が落ちる）でも取れる」／`silent-failure`「フェンスの経路: `start` が 0 の位置は「無い」ではない」）。親の実測と同じ4本
  - どちらも戻し、`git diff` でコメント以外の差が無いことを確認した

### 1.3 記法によって `position` が記号を含むか違う（6.3）

- [x] 1.3.1 按分に戻したら落ちるテストがあることを確かめる（`preview.test.ts` のインラインコードの件）
  - `preview.test.ts` に3本（インラインコードの内側／中身を丸ごと／バッククォート2つ）、`silent-failure.test.ts` に2本（記法ごとの選択／中の一部でもずれない）。1.3.4 で赤くなることを見た
- [x] 1.3.2 字が見つからない場合（エスケープ `\*`・実体参照 `&amp;`）に `null` が返ることを確かめる
  - `silent-failure.test.ts`「件3: 字が見つからない記法は null を返す」2本。`edge-cases.test.ts` に AST 側の実測（範囲は記号を含んだまま）もある
- [x] 1.3.3 記法ごとの違いをテストに列挙する。**含むのはインラインコードだけ**で、強調・リンク・見出し・リスト・引用・表・打ち消しは揃う（親の実測）。テスト名から何が固定されているか読めるようにする
  - `silent-failure.test.ts` の `NOTATIONS` 14件（テスト名が「… : position は記号を含む/含まない」になる）＋ `edge-cases.test.ts` の `記号を含まない` 19件。追加は要らなかった
- [x] 1.3.4 **わざと按分の実装に戻して落ちることを確かめる。** 落ちた本数を書く
  - **(a) 頭合わせ**（`alignWrapper` を `slice.length >= text.length ? 0 : null` に）→ **8本**（`preview` 3本・`silent-failure` 4本・`edge-cases` 1本）
  - **(b) 中央按分**（`Math.floor(delta / 2)`、照合なし）→ **3本**（`silent-failure` のエスケープ・実体参照、`edge-cases` の「ずれが小さければ null に倒れることも多い」）
  - **(b) で3本しか落ちないのは、記号が前後に同じ数だけ付く記法では中央の当て推量がたまたま当たるからである。** インラインコードの検査は (b) を捕まえない。捕まえるのは「字が見つからない記法」の側（エスケープ・実体参照）で、あの2本が抜けると按分への検知が半分になる

## 2. AST の構造を固める（6.10）

**素通りした変異が3件ある。** 出力が実際に変わったのに143本すべてが通過した。既存6本は「位置が引けるか」を見ており、AST の形を何も固めていない。

- [x] 2.1 `test/modules/markdown/runtime/position/ast-shape.test.ts` を新設する（design.md 決定1）。冒頭に「ここはパーサが返す形を固定する。位置の検査は隣の6本」と書く
  - 24本。固定の中身は `paragraphsInListItems` / `blankTexts` / `headingIds` の3つの関数に寄せ、毒見が同じ関数を通るようにした
- [x] 2.2 **`li` の段落ほどきを固める。** 止めると `<li>項目<br>つづき</li>` が `<li><p>項目</p><p>つづき</p></li>` になる。`preview.ts` が歩く DOM の形も見える文字も変わる
  - 6本。**実測**: 段落が2つある項目は `['text', 'br', 'text']`、入れ子は `['text', 'ul']`、チェックボックスは `['input', 'text', 'text']`。**`blockquote` はほどかれない**（`['p']` のまま）ので、それも1本で固定した
- [x] 2.3 **改行だけの text ノードが除かれることを固める。** 止めると `ul` / `li` / `blockquote` / `table` に `\n` のノードが挿入され、**以降のオフセットが全部ずれる**
  - 5種（`ul` / `ol` / 入れ子 / `blockquote` / `table`）＋「面に出る字が入れ物のぶんの改行を含まない」＋「**字としての改行（soft break）は残る**」の7本
- [x] 2.4 見出しの id の作り方を固める
  - **実測**: 英字は小文字へ、空白の連なりは `-` 1つ、記号（`!`）は落ちる、日本語はそのまま、同じ字が並ぶと `-1` から番号（`同じ` / `同じ-1` / `同じ-2`）、段（h1〜h6）は id の作り方に関係しない。8本
- [x] 2.5 **2.2〜2.4 を実際に変異させて落ちることを確かめる**（design.md 決定4。手で行い、何をどう壊して何本落ちたかを書く）
  - **変異は解析の結果（AST）へ加えた。`node_modules` は書き換えていない。** この作業ツリーの `node_modules/@nuxtjs/mdc/dist/runtime/parser/index.js` は**リンク数9**（＝他の作業ツリーと同じ実体）で、書き換えると他の実行を巻き込む。決定4が自動化を退けた理由がそのまま「実ファイルを触らない」理由になるので、パーサの手当てが止まったときの形を AST の上で作り、上と同じ関数へ通した
  - 変異3件と結果（`ast-shape.test.ts` の describe「毒見: 変異させた AST を通すと落ちる」3本として常設）:
    - **`li` の中身を `p` で包み直す** → `paragraphsInListItems` が 0 → **2**、`li` の形が `[['text'],['text']]` → `[['p'],['p']]`
    - **入れ物の子の間へ `\n` の text ノードを挿す** → `blankTexts` が 0件 → **8件**、面に出る字が `まえ項目次の項目`（8字）→ 16字。**これが「以降のオフセットが全部ずれる」の正体**
    - **見出しの id を素の本文へ戻す** → `hello-world` → `Hello World!`
  - つまり 2.2〜2.4 の固定は**すべて変異で赤くなる**（同じ判定関数を通しているため）
- [x] 2.6 `plain.test.ts` はパーサを呼ばないので検知力を持たない。**それでよい**ことをファイル冒頭に明記する（6.10.5。design.md R5）
  - 冒頭に追記。「AST の形を固定する検査をここへ足さないこと。パーサの形は `./ast-shape.test.ts` が持つ」まで書いた

## 3. 位置の印の経路と逃げ道（6.4 / 6.5）

- [x] 3.1 module 設定に `keepPosition` を書いたら型で落ちることを確かめる（6.4.1。TS2353。既にそうなっている）
  - **実測（2026-08-30）。** `modules/markdown/index.ts` の `installModule('@nuxtjs/mdc', { … })` へ `keepPosition: true` を足して `yarn typecheck` → `modules/markdown/index.ts(59,7): error TS2353: Object literal may only specify known properties, and 'keepPosition' does not exist in type 'Partial<ModuleOptions>'`。足したものは戻し、この文面をコメントへ残した
  - 型の出どころも確認: `dist/module.d.mts` の `MDCParseOptions`（63行〜）には `keepPosition`（83行）が在り、`ModuleOptions`（126〜201行）には無い
- [x] 3.2 `parser-options` から渡す経路が消えたら落ちるテストを書く（6.4.2。位置の印が DOM に出ないことを検知する）
  - `markdown-view-position.test.ts` に2本。「`parser-options` で `keepPosition` を渡している」（スタブが受けた props をそのまま見る）と「スロットへ来た AST は、包まれてから `MDCRenderer` へ渡る」（`MDCRenderer` のスタブが AST を DOM へ描き、`[data-src-start]` が2つ出ることを見る）
  - **実測**: `:body="markSourcePosition(body)"` を `:body="body"` に戻す → **2本**（上の後者と「印が出ていれば…端から端まで」）。`<MDC>` を消す変異（1.1.3）では前者も落ちる
- [x] 3.3 **包みが1つも無い本文で器ぜんたいを選ぶと、`null` に倒れず切り詰めた範囲を返す**件を塞ぐ（`adr0017-sub-create-position-port-preview` の design.md R6。実測: `これは本文です。\n\n次の段落。\n` に対し正解 `0..15` 相当のところ `{start:0,end:8}`）
  - **再現した。** 位置を載せない AST をスロットへ渡す（＝`keepPosition` が効かなかった姿）と印は0個になり、器ぜんたいの選択が `{ start: 0, end: 8 }` を返す（`null` ではない）。印が在れば同じ選択が `{ start: 0, end: 15 }` になる
  - **振る舞いは変えず、実測のまま固定した。** 先頭の字を照合で拾い直す手当て（`preview.ts`）が在る以上、印が消えても「狭い範囲」は返り続ける。だから「印が出ていること」を見る2本が主で、この1本は**印が消えたときに何が起きるか**を記録する側だとテスト本体に書いた
- [x] 3.4 `pre` の印が消えたら落ちるテストがあることを確かめる（6.5.1。`pre-mark.test.ts`）
  - 8本ある（印の範囲・言語指定なし・mermaid・複数・位置を持たない `pre`・もとの属性・`pre` 以外に打たない・元の AST を書き換えない）。印が消えれば先頭の3本が即座に落ちる
  - **変異は行っていない。** 印を打つのは `source-span.ts` で、この change の「触ってよいファイル」に入っていないため（一時的な書き換えも含めて触らない）
- [x] 3.5 印が無い場合の逃げ道（生テキストの走査）が、**推測を黙って通さない**ことを確かめる（6.5.2。照合が通らなければ `null`）
  - `edge-cases.test.ts` に1本追加: 「走査の経路: 生テキストの側に合う候補が無ければ `null`（推測で当てにいかない）」。印の落ちる入力（文書がフェンスで始まる）で、面の字と生テキストが食い違う場合を通す
  - **実測**: `fence.ts` の `choosePrefixLength` を「合わなければ 0」（＝推測で通す）に変えると **2本**落ち、そのうち1本がこの新しい検査だった（もう1本は `fence.test.ts`「行の中の桁が照合できない」）。戻した
- [x] 3.6 **逃げ道は残す**（design.md 決定3）。印がある入力と無い入力を別のテストに分け、**テスト名から経路が読める**ようにする。実行時に経路を返す仕組みは足さない
  - `edge-cases.test.ts` の6本を「印の経路: …」「走査の経路: …」「両方の経路: …」「どちらの経路でも解けない: …」に改名し、describe の頭に「経路の見分けはテストの名前で示す。実行時に経路を返す仕組みは足さない」と書いた。実行時の仕組みは足していない

## 4. 差の一覧を読み取れるようにする（6.6.2）

- [x] 4.1 フェンスの生テキストと表示文字列の差5つ（4桁のタブストップ・器のインデント剥がし・引用記号の剥がし・末尾改行の付与・メタの分離）が、**テスト名から何を固定しているか読める**形になっていることを確かめる。読めないものは名前を直す
  - 読めなかった3つを改名した: 「情報行にメタが付いても…」→「**情報行のメタ（`title="x"`）は `code` に入らない**。中身の対応は変わらない」、「末尾の改行」→「**末尾の改行は `code` に必ず足される**（生テキストに無くても）」、「器の印は各行から剥がされる」→「**器の印（インデント・引用の `> `）は各行から剥がされる**」
  - `fence.test.ts` の冒頭に「差 → 固定している場所」の対応表を置いた（5行）

## 5. ハイドレーション検知の拾えない範囲（6.14）

- [x] 5.1 **属性だけのずれ**を拾う別手段があるか調べる（6.14.1）。Vue は本番ビルドで属性のずれを直さないため、SSR と客側で色だけが違う場合に `markdown-hydration.spec.ts` が素通りする（実測）
  - **DOM の突き合わせでは原理的に出ない。** 属性のずれは「客側が描こうとした値」と DOM の食い違いで、DOM もサーバの HTML もサーバの値のまま一致する
  - **Vue は本番ビルドで属性の照合そのものを回していない**（実測）。`propHasMismatch` の呼び出しは `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` で囲われている（`node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js:2202`）。同じフラグが `console.error('Hydration completed but contains mismatches.')`（同 1900行・`logMismatchError`）の呼び出し側も塞ぐので、**本番ビルドでは警告も出ない**
  - つまり手段は1つだけ在る——**そのフラグを立てたビルドで E2E を回し、コンソールの `Hydration … mismatch` を落とす**。ただし配るものを変える話になるので、検知のためだけには入れない
- [x] 5.2 見つからなければ「**拾えない**」ことを記録して終わりにする（design.md 決定5）
  - `e2e/markdown-hydration.spec.ts` の冒頭に、上の2点（DOM では出ない／本番では照合が回っていない・フラグの名前と行番号）と「主の検知はこれで足りている」理由を書いた。実測した症状（アイコン消失）は字と要素の並びのずれから来ており、そちらは同じ spec が拾う
- [x] 5.3 **`@nuxt/icon` の 404 は直さない**（proposal の対象外）。この環境でアイコン消失が再現しないこと、それでも原因側の検知は成り立っていることを記録する（6.14.2 の二択のうち「再現しない前提で検知の設計を見直す」を採った）
  - 同じ spec の冒頭に書いた。カスタムコレクションが読めず SSR も客側も空の `<svg>` を出すため消失そのものは再現しないが、`svg[role="img"]` の本数は数えられるので「減っていないこと」は同じように見られる

## 6. 検証

- [x] 6.1 **追加したテストを1本ずつ壊して、落ちることを目で見る**（6.9.1）。1.1.3 / 1.2.6 / 1.3.4 / 2.5 で済んでいない分を片付ける
  - 済んでいない分は2つあり、どちらも実測した
    - **`markSourcePosition` をスロットから外す** → **2本**（3.2 に記録）
    - **`choosePrefixLength` を推測で通す** → **2本**（3.5 に記録。うち1本が今回の新規）
  - まとめ（今回足した33本の内訳と、それを落とす変異）:

    | 足した先 | 本数 | 落とす変異（落ちた本数） |
    | --- | --- | --- |
    | `render/markdown-view-position.test.ts` | 6 | `<MDC>` を自前解析へ（7本／同ファイル）・`markSourcePosition` 外し（2本） |
    | `position/preview.test.ts` | 2 | `readOffset` のガード外し（2本） |
    | `position/edge-cases.test.ts` | 1 | `choosePrefixLength` を推測で通す（2本） |
    | `position/ast-shape.test.ts` | 24 | AST の変異3件（毒見3本として常設。判定関数を共有） |

  - 変異のたびに戻し、`git diff` で残骸が無いことを確認した（`modules/` の差はコメントと `readOffset` の1行だけ）
- [x] 6.2 `yarn typecheck` が通る
  - 通る（終了コード 0。2026-08-30）
- [x] 6.3 `yarn test` が緑。基準は 437 passed / 29 files で、増えるのはこの change で足した分だけであること
  - **実測 487 passed / 31 files。** 増分は本 change の +33本（240/8ファイル）、`adr0017-sub-create-reference-mdc` の移設（本数不変・ファイル配置のみ）、`adr0017-sub-fix-normalization-offset` の `normalize.test.ts` +17本。失敗0
  - 参考: この change の範囲の8ファイルだけを回すと **240 passed / 8 files**（着手時の同じ範囲は 207 passed / 7 files。**+33本・+1ファイル**）
- [x] 6.4 **`yarn build` してから** `yarn test:e2e` を回し、基準と同じ結果であること。**`yarn test:e2e` はビルドしない**（`playwright.config.ts` が `.output/` を起動するだけ）ので、ビルドを忘れると古いコードを試験することになる
  - **実測（2026-08-30）。** `yarn build` の後、`.e2e-tmp/` を消してから `yarn test:e2e` → **217 passed / 1 failed**。落ちた1本は `workspace.spec.ts`「上層はタブ、下層はサイドバーで形が違う」で、本家スタブへの接続確立待ち（`upstream-connection` が `false` のまま）。**単独で回すと43本すべて緑**なので flake。markdown とは無関係
- [x] 6.5 E2E の前に `.e2e-tmp/` を消す。**掃除しないと過去の実行の残骸が一覧に混ざって落ちる**（実測: 55ディレクトリ溜まり、3行のはずが8行になった）
  - 消してから回した。前回 `.e2e-tmp` の残骸で落ちていた `projects.spec.ts` 3本と `toast.spec.ts` 1本は、今回いずれも通っている
