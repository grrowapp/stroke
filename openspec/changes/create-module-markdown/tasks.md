## 1. モジュールの置き場を用意する

- [x] 1.1 `modules/` を作り、Nuxt が自動で読むことを確かめる（`.nuxt/types/modules.d.ts` に `stroke-board-markdown` が現れる）
- [x] 1.2 `modules/markdown/` に `defineNuxtModule` の骨を置く。`runtime/` を持ち、alias `#markdown` を切る
- [x] 1.3 `yarn typecheck` が通ることを確かめる

## 2. markdown の解釈をモジュールへ移す

- [x] 2.1 `nuxt.config.ts` の `modules` から `@nuxtjs/mdc` を外し、`modules/markdown/` の中で `installModule` する
- [x] 2.2 `nuxt.config.ts` の `mdc` 設定ブロック（`headings.anchorLinks` / `rehypePlugins` の `rehype-raw` 無効化 / `components.prose` 無効化 / `components.map.pre`）をモジュール側へ移す。**値は変えない**
- [x] 2.3 `nuxt.config.ts` に markdown 由来の記述が残っていないことを確認する
- [x] 2.4 `yarn test` と `yarn test:e2e` が移設前と同じ結果であることを確かめる（単体 136/136 で基準と同一、E2E も基準と同じ失敗2件のみで増加なし）

## 3. 描画の部品をモジュールへ移す

- [x] 3.1 `app/components/global/MarkdownPre.vue` をモジュールへ移し、`addComponent({ global: true })` で登録する（名前は `MarkdownFence` に変えた）
- [x] 3.2 `components/global/` から名前解決できていた経路が、module 登録でも通ることを確かめる（mermaid フェンスが図になり、コードブロックに行番号と言語名の札が出ることを E2E で確認した）
- [x] 3.3 `app/components/workspace/CodeBlock.vue` と `MermaidDiagram.vue` をモジュールへ移す（`MarkdownCode` / `MarkdownDiagram` に改名した）
- [x] 3.4 `app/components/workspace/DocumentView.vue` をモジュールへ移し、本文を出す口とする（`MarkdownView`）
- [x] 3.5 `app/components/workspace/DocumentEditor.vue` をモジュールへ移し、直す口とする（`MarkdownEditor`）。保存の実行は口の外に残す
- [x] 3.6 `app/assets/css/main.css` の `.sb-markdown` / `.sb-code` / `.sb-mermaid` / `.sb-textarea` を `modules/markdown/runtime/assets/markdown.css` へ移し、モジュールが `nuxt.options.css.push` で自分で足すようにする
- [x] 3.7 `test/app/components/workspace/markdown-roundtrip.test.ts` と `markdown-sanitize.test.ts` を移設先に合わせる（`adr0017-sub-create-reference-mdc` が引き取り、`test/modules/markdown/` へ移設した。`markdown-fence-position.test.ts` も同じ対象として `fence-source.test.ts` へ移した。移動のみで27本が同じ結果）
- [x] 3.8 `e2e/upstream-style.spec.ts` が基準と同じ結果であることを確かめる（本文の見た目が移設で変わっていないこと）

## 4. 描画の入口を1つに寄せる

- [x] 4.1 `app/components/review/ApprovalAnnotator.vue` の `<MDC>` 直呼びを、モジュールの口（`MarkdownView`）に置き換える
- [x] 4.2 `app/pages/strokes/[sessionId]/proposal.vue` の `<MDC>` 直呼び2箇所を、モジュールの口に置き換える
  - ストローク側は本家写しとは別のクラス列（`prose prose-sm dark:prose-invert max-w-none px-8 py-8`）で描いており、`.sb-markdown` をそのまま被せると枠と余白が二重になる。**型（prose）はモジュール、面（`.sb-markdown`）は呼ぶ側**に分け、`MarkdownView` に `surface` を持たせて解決した（既定は立てる。ストローク側だけ寝かせる）
- [x] 4.3 `app/pages/projects/[projectId]/approvals/[approvalId].vue` の参照を `#markdown` 経由の明示 import にする
- [x] 4.4 `<MDC` を直に書いている箇所が `modules/markdown/` の外に無いことを grep で確かめる（ヒット0件）
- [x] 4.5 `yarn test` と `yarn test:e2e` が緑であることを確かめる

## 5. 位置の口をモジュールに足す

- [x] 5.1 markdown の解釈で `keepPosition` を立て、AST の各ノードに生テキストの位置が乗ることを確かめる（`MarkdownView.vue` の `parser-options` から渡している。記帳が漏れていただけで、実装は済んでいた。`adr0017-sub-create-position-port-preview` が引き取って閉じた）
- [x] 5.2 描画の前に text ノードを位置付きの包みへ変える処理を入れる（`runtime/position/source-span.ts`。`<MDC>` のスロットの中で差し替える）
  - **解析そのものを自前で組み直してはならない。** 写して置き換えたところ、クライアントの再解析で shiki の色が SSR とずれ、ハイドレーションが壊れて**アプリ全体のアイコンが消えた**（実測）。markdown の本文には症状が出ず、全画面のピクセル差分だけが捕まえた
- [x] 5.3 本文の見え方が包みの前後で変わらないことを確かめる（**144万画素中0画素の差**を4画面で確認。加えて text ノードの矩形・フォント・色・コンテナの寸法を突き合わせて完全一致）
- [x] 5.4 プレビュー面に「DOM の選択範囲 → 生テキストの位置」を実装する（`position/preview.ts`、35本）
  - 長さが一致しないときは**按分せず照合で頭を決める**。エスケープ・実体参照は対応の取れない領域として落とす
- [x] 5.5 プレビュー面に「生テキストの位置 → DOM の範囲」を実装する（同上）
- [x] 5.6 `pre` ノードの位置から生テキストのフェンスを切り出し、表示されている文字列との差を洗い出す単体テストを書く（`markdown-fence-position.test.ts`、19本。差はタブ展開だけではなかった — 4桁のタブストップ・器のインデント剥がし・引用記号の剥がし・末尾改行の付与・メタの分離。**行の並びは保たれる**ことを確認）
- [x] 5.7 コードブロックの対応表を行ごとに作る実装を入れる（`runtime/position/fence.ts`。剥がす量は推測せず照合で決める。器の前置きを剥がしてからタブを開く）
- [x] 5.8 対応の取れない領域を、取れないものとして扱う分岐を入れる（`null` を返す。7条件をテストで固定）
  - `position` が `undefined`（offset 0 から始まる要素）
  - 切り出しの先頭がフェンス記号でない（4スペースのインデントコードブロック）。**`language` では判定できない** — 指定なしのフェンスも `'text'` になる
  - CRLF / front matter によるオフセットの基準ずれ
  - 行数が合わない、行内の桁を照合で合わせられない
- [x] 5.9 図として描かれる箇所に、そのもとになった生テキストを添える口を作る（`render/source-shown.ts` + `MarkdownDiagram.vue`）
- [x] 5.10 生テキストを添えるのは、注釈の付いた範囲がそのフェンスと重なるときだけにする（**注釈の有無ではなく「ソースを見せたい範囲」を provide/inject で受ける**。モジュールは注釈を知らない）
- [x] 5.11 生テキストが添えられても本文の他の箇所の位置が動かないことを確かめる（図の枠の中へ絶対配置。全要素の座標が一致、画素差0）
- [x] 5.12 位置の対応の単体テストを書く（`preview.test.ts` 35本・`plain.test.ts` 30本・`fence.test.ts` 45本・`pre-mark.test.ts` 8本）
- [x] 5.13 生テキストの面を `modules/markdown/` に置き、プレビュー面と同じ位置の口を実装する（`render/MarkdownSource.vue` + `position/plain.ts`、30本）
  - 口は `defineExpose({ … } satisfies PositionPort)` で出す。面のコンポーネント自身が `PositionPort` を名乗り、器の要素は外へ出さない
  - **恒等では済まなかった。** `selectNodeContents` の端は器そのものを指し、オフセットが子ノードの番号になる。text ノードが1つとも限らない。器の中を走査して表を作り、呼ばれるたびに作り直す
- [x] 5.14 `pre` にも位置の印（`data-src-start` / `data-src-end`）を打つ（`source-span.ts`、テスト8本）
  - **位置を持たない `pre` には印を付けない。** offset 0 から始まるフェンスは `position` が `undefined` になるので、そこに 0 を書くと先頭のフェンスが黙って `[0,0)` を指す
  - 打つのは `pre` だけ。すべての要素に打つと DOM が属性で膨れ、位置が要るのは「中の text ノードが位置を持たない領域」だけである
- [x] 5.15 `MarkdownView` から「ソースを見せたい範囲」を provide する（props では届かない。MDC が `resolveComponent` で `MarkdownFence` を自分で作るため）

## 6. 崩れた前提を、踏んでも壊れない状態にする

実装で推測が7件崩れた。うち3件は**黙って壊れる**（症状が出ないまま誤った位置を返す、別の場所が壊れる）。資料に書くだけでは、読まなかった人が同じ穴に落ちる。**踏んだら止まる**ようにするまでを終わりとする。

各件について、次の3つを揃える。

- **検知** — 踏んだときに落ちるテスト、または型で通らない状態
- **その場の記録** — 触るファイルのコメント。読まずに通り過ぎられない位置に置く
- **残る記録** — change が archive されても消えない資料

**この節の大半は分割先が引き取った**（ADR-0017「分割の内訳」）。6.1〜6.5・6.6.2・6.10・6.14 は `adr0017-sub-add-detection-assumptions`（archive 済み）、6.8 は `adr0017-sub-create-reference-mdc`（archive 済み）、6.11 は `adr0017-sub-fix-normalization-offset`（実装中）が持つ。**引き取り先のスコープに収まらず親に残っているのは 6.2.3・6.9 の3件**で、いずれも分割先が全部終わってからでないと閉じられない。

### 6.1 解析を自前で組み直すとハイドレーションが壊れる（黙って壊れる）

クライアントの再解析で shiki の色が SSR とずれ、**アプリ全体のアイコンが消える**。markdown 本文には症状が出ない。

- [x] 6.1.1 `MarkdownView` が `<MDC>` のスロットだけを差し替えている形から外れたら落ちるテストを書く（`parseMarkdown` を自前で呼ぶ実装に戻したら赤くなること）（`<MDC>` のスタブが実際に描かれたことを確かめる3本。パーサを変異させて12本落ちることを実測。`adr0017-sub-add-detection-assumptions`）
- [x] 6.1.2 E2E で、markdown を描く画面を開いたときにアイコンが消えていないことを確かめる（症状が本文の外に出るため、本文の検査では捕まらない）（`e2e/markdown-hydration.spec.ts` が SSR の時点でアイコンが在ること・ハイドレーション後に減っていないことを見る。**引き取り先ではなく、この change のコミット `82a96e0` で入れたもの**。ただしこの環境では消失そのものが再現しない → 6.14.2）
- [x] 6.1.3 `MarkdownView.vue` と `modules/markdown/index.ts` のコメントを、実測の根拠つきで確定させる（既に書いてあるものを見直す）（`adr0017-sub-add-detection-assumptions`）

### 6.2 offset 0 から始まる要素は `position` が `undefined`（黙って壊れる）

`parser/compiler.js` の `node.position?.start?.offset && …` に 0 が偽として落ちる。0 を書くと文書の冒頭が `[0,0)` を指す。

- [x] 6.2.1 位置を持たないノードに 0 を書いたら落ちるテストが、`source-span` と `fence` の両方にあることを確かめる（`pre-mark.test.ts` に1本ある。他の経路も塞ぐ）（経路は3つあり全部塞がっていることを確認。`adr0017-sub-add-detection-assumptions`）
- [x] 6.2.2 文書の冒頭から選んだ範囲が正しく取れることを、`preview` と `plain` の両方で確かめる（両方で取れており、テストの追加は要らなかった。同上）
- [ ] 6.2.3 位置を扱う関数が `undefined` と 0 を取り違えられない型にする（**調べた結果、なっていない**。下の3点）
  - `FenceSource.position` の `if (!position)` は、いまオブジェクトだから正しいだけ。平たい形に変われば 0 が偽に落ちる（実際 `!position?.start` に書き換えたら4本落ちた）
    - **型は変えていない。** `position === null` を足すと `SourceRange | undefined` との比較で TS2367 になり、型を広げるのは引き取り先の範囲を超えると判断された。`fence.ts` に `!position` のままコメントで固定（`adr0017-sub-add-detection-assumptions`）
  - `preview.ts` の `readOffset` が `Number('') === 0` を通す。**空の属性が有効なオフセット 0 として読まれる**。いま実害が無いのは `markNode` が空属性を書かないからだけで、型にもガードにも根拠がない
    - **解決済み。** `preview.ts` に `if (value.trim() === '') return null;` のガードが入った（同上）
  - `MDCNode.position` は `position?`、`SourceRange` は素の `number`。「offset 0」と「位置が無い」を型で分ける仕組みが無く、規律が書き方の側にしかない
    - **見送りと決まった。** `SourceRange` を branded type にせず、ガード関数と単体テストで塞ぐ。型で分ける案は後続 `adr0017-sub-create-module-annotation` の API を先に縛るため、消費者が実在してから判断する（同上の proposal「対象外」）。**この項はその判断を待って閉じる**
- [x] 6.2.4 塞いだあと、**わざと壊して落ちることを確かめる**（ガード外し2本・`!position?.start` 4本が落ちることを実測。`adr0017-sub-add-detection-assumptions`）

### 6.14 ハイドレーションの検知が拾えない範囲

`e2e/markdown-hydration.spec.ts` は SSR の HTML とハイドレーション後の DOM を突き合わせるが、**拾えない食い違いがある**。

- [x] 6.14.1 **属性だけのずれが拾えない。** Vue は本番ビルドで要素の属性のずれを直さないため、SSR と客側で**色だけが違う**場合に素通しする（実測: 配る HTML の `style` を書き換えても、ハイドレーション後の DOM はサーバの値のまま残った）。実測した症状（アイコン消失）は字と要素の並びのずれから来るので主の検知はそちらだが、色だけのずれを別の手段で拾えるか調べる
  - **結論: 原理的に拾えない。** ①属性のずれは DOM にもサーバ HTML にもサーバの値のまま残るので突き合わせでは出ない ②Vue は本番ビルドで属性の照合自体を回さない（`propHasMismatch` も `Hydration completed but contains mismatches.` も `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` の中）。手段は「そのフラグを立てたビルドで E2E」の1つだけだが、配るものを変えるので採らない。結論は `e2e/markdown-hydration.spec.ts` に記録済み（`adr0017-sub-add-detection-assumptions`）
- [x] 6.14.2 **この環境ではアイコン消失そのものが再現しない**（`@nuxt/icon` のカスタムコレクションが 404 で読めておらず、SSR も客側も空の `<svg>` が出るだけ）。再現する環境を用意するか、再現しないことを前提に検知の設計を見直す
  - **再現環境は用意せず、後者を採った。** `@nuxt/icon` の 404 は直さない。原因（字と要素の並びのずれ）は同じ spec が拾い、`svg[role="img"]` の本数は数えられるので「減っていないこと」は見られる。`e2e/markdown-hydration.spec.ts` に記録済み（同上）

### 6.3 記法によって `position` が記号を含むか違う（黙って壊れる）

`**強調**` は含まない、`` `インラインコード` `` は含む。長さを按分すると1〜2文字ずれた位置を黙って返す。

- [x] 6.3.1 按分に戻したら落ちるテストがあることを確かめる（`preview.test.ts` のインラインコードの件）（戻すと赤くなることを実測。`adr0017-sub-add-detection-assumptions`）
- [x] 6.3.2 字が見つからない場合（エスケープ・実体参照）に `null` が返ることを確かめる（2本。同上）
- [x] 6.3.3 記法ごとの違いを、実際に確かめられる形でテストに列挙する（強調・インラインコード・リンク・打ち消し・脚注など、記号を伴う記法を洗う）
  - **実測の結論は「記号を含むのはインラインコードだけ」。** 強調・リンク・見出し・リスト・引用・表・打ち消しは位置と値が揃う。`NOTATIONS` 14件 + `edge-cases` 19件で固定した（同上）

### 6.4 `keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではない

- [x] 6.4.1 module 設定に書いたら型で落ちることを確かめる（TS2353。既にそうなっている）（実測。`adr0017-sub-add-detection-assumptions`）
- [x] 6.4.2 `parser-options` から渡す経路が消えたら落ちるテストを書く（位置の印が DOM に出ないことを検知する）（2本。同上）

### 6.5 `pre` の `position` も `code` も DOM に出ない

`MDCRenderer` が `node.position` を捨て、`code` は `MarkdownCode` の props 宣言で `attrs` から抜ける。

- [x] 6.5.1 `pre` の印が消えたら落ちるテストがあることを確かめる（`pre-mark.test.ts`）（8本あることを確認。**変異は未実施** — 印を打つ `source-span.ts` が引き取り先の「触ってよいファイル」に入っていないため。壊して確かめるのは 6.9.1 に残る。`adr0017-sub-add-detection-assumptions`）
- [x] 6.5.2 印が無い場合の逃げ道（生テキストの走査）が、**推測を黙って通さない**ことを確かめる（照合が通らなければ `null`）（候補が無ければ `null` を返すこと＋変異2本。同上）
- [x] 6.5.3 逃げ道を残すか消すかを決める
  - **残すと決まった。** 印が付かない `pre` は「文書がフェンスで始まる場合」の1種類だけ実在し、逃げ道は実際にそれを解ける。消すとその文書で位置が引けなくなる
  - **どちらの経路を通ったかはテスト名で示すに留め、実行時に経路を返す仕組みは足さない。** 検査のために内部の形を外へ広げると、そこが新しい公開面になるため。`edge-cases.test.ts` の6本を「印の経路: …」「走査の経路: …」「両方の経路: …」「どちらの経路でも解けない: …」に改名した（`adr0017-sub-add-detection-assumptions` の design 決定3）

### 6.6 フェンスの生テキストと表示文字列の差

4桁のタブストップ・器のインデント剥がし・引用記号の剥がし・末尾改行の付与・メタの分離。行の並びは保たれる。

- [x] 6.6.1 パーサの挙動が変われば落ちることを確かめる（**`@nuxtjs/mdc@0.23.1` が最新で上げ先が無い**ため、パーサを直接変異させて測った。タブストップ幅・offset 0 の真偽判定・末尾改行の付与・`rehype-raw` の無効化・`pre` の範囲 の5件は 14〜58本が落ちる）
- [x] 6.6.2 差の一覧が、テストの側から読み取れる形になっていることを確かめる（テスト名で何が固定されているか分かること）（3件を改名し、`fence.test.ts` の冒頭に対応表を置いた。`adr0017-sub-add-detection-assumptions`）

### 6.10 AST の構造を固める（検知力の測定で見つかった穴）

**テストはフェンスの幾何と text ノードの位置をよく固めているが、AST の構造を何も固めていない。** 出力が実際に変わったのに 143本すべてが通過した変異が3件あった。マイナーリリースが最も変えやすいのがこの層である。

- [x] 6.10.1 **`li` の段落ほどきを固める。** これを止めると `<li>項目<br>つづき</li>` が `<li><p>項目</p><p>つづき</p></li>` になる。`preview.ts` が歩く DOM の形も、見える文字も変わるのに、いまは何も落ちない。複数段落のリスト項目は普通に出てくる（6本。`adr0017-sub-add-detection-assumptions`）
- [x] 6.10.2 **改行だけの text ノードが除かれることを固める。** これを止めると `ul` / `li` / `blockquote` / `table` に `\n` のノードが挿入され、**以降のオフセットが全部ずれる**（7本。同上）
- [x] 6.10.3 見出しの id の作り方を固める（影響は小さいが、何も固定していない）（8本。同上）
- [x] 6.10.4 上の3件について、**実際に変異させて落ちることを確かめる**（書いただけで検知できていない状態にしない）
  - **変異先はパーサ実体ではなく解析結果（AST）。** `node_modules/@nuxtjs/mdc/dist/runtime/parser/index.js` はリンク数が9で、書き換えると他の worktree を巻き込むため。毒見3本を `ast-shape.test.ts` に常設した（同上）
- [x] 6.10.5 `plain.test.ts` はパーサを呼ばないので検知力を持たない。**それでよい**ことを明記する（純粋な DOM の対応を見るテストであり、パーサの変化を捉える役ではない）（`plain.test.ts` の冒頭に明記。`adr0017-sub-add-detection-assumptions`）

### 6.7 CRLF と front matter でオフセットの基準がずれる

- [x] 6.7.1 CRLF を含む文書で口が誤った範囲を返さないことを確かめる（**`null` には倒れず、黙って別の場所を返す**ことを実測。契約を「正規化後の文字列を渡す」に固定し、①正規化すれば正しい ②生ファイルだと黙って誤る ③正規化で誤りが消える の3つをテストで固定）
- [x] 6.7.2 front matter を持つ文書で同じことを確かめる（同上。本文の `b` を選ぶと front matter の `b` が返る反例を実測）
- [x] 6.7.3 本家が返す文書に CRLF や front matter が実際に含まれうるかを調べる（**含まれうる**。本家は `readFile`/`writeFile` で素通しし、改行を触るコードが `dist` に0件。front matter を作る依存も無いが、文書を書くのは AI か人間で本家に生成ツールが無い。アプリ側の正規化も0件）

### 6.11 生文字列が渡っている経路を塞ぐ（潜在の不具合）

**`adr0017-sub-fix-normalization-offset` が引き取った（実装中）。** この節が閉じるのはあちらの完了をもって。

**本番の呼び出し側が、正規化していない生文字列を渡している。**

`app/pages/projects/[projectId]/approvals/[approvalId].vue:60` の `const source = computed(() => document.value?.content ?? '')` が、`MarkdownView` にも**注釈の基準**にもそのまま渡っている。CRLF を含む文書が来ると、いま在る注釈機能が黙ってずれる。

**決めるべきことがある。** 注釈のオフセットは本家へ送られて保存される。正規化した座標で保存すると、ディスク上の生ファイルとずれた値が残る。あとから別の道具がその注釈を生ファイルに当てると合わない。

- [x] 6.11.1 注釈のオフセットを**どの座標で保存するか**を決める（生ファイルの座標 / 正規化後の座標）。本家に保存された注釈を誰が読むかを調べてから決める
  - **生ファイルの座標**（本家から取得した文書の中身そのもの）に決まった。いまオフセットを数値として読む処理は本家にもストローク側にも無いが、**系で唯一オフセットを文書へ当てる実装（本家ダッシュボードの SPA）が生ファイルを基準にしている**。正規化後の座標は front matter が落ちた分だけ小さくなり、あちらの妥当性の判定を通ってしまうので、弾かれずに別の場所が塗られる
- [x] 6.11.2 正規化を**どこで行うか**を決める（モジュールの内側 / 呼ぶ側）。「呼ぶ側が忘れずにやる」は、いま潰そうとしている黙って壊れる形そのものである
  - **面の内側**（`createPreviewPositionPort` の入口と出口）に決まった。呼ぶ側で揃える案は、忘れる形が残るのに加えて、front matter を落とした文字列を承認画面へ渡すと**レビュアーが前置きに指摘を付けられなくなる**ため却下
- [x] 6.11.3 生ファイルの座標で保存すると決めた場合、正規化後 ↔ 生ファイル の対応を作る
  - `modules/markdown/runtime/position/normalize.ts` の `createSourceMapping`。**文法を自前で書かず**、解析する側と同じ `parseFrontMatter`（`remark-mdc`）を呼ぶ。作った文字列が CRLF を潰した文字列の**接尾辞であることを必ず確かめ**、確かめられなければ写像を作らず両方向とも `null`
- [x] 6.11.4 決めた形を実装し、CRLF と front matter を含む文書で注釈が正しい位置に付くことを E2E で確かめる
  - `e2e/approval-annotation.spec.ts` に3本。送られたオフセットで**本家が持っている本文を切ると選んだ語になる**ことを見る。`approvals/[approvalId].vue` の `source` に正規化を足すと、この3本だけが落ちる（実測）
- [x] 6.11.5 `e2e/fixtures/upstream-stub.mjs` が `\n` 直書きのみで、**この2件を一切カバーしていない**ことを直す
  - `request-approval` に `content` を渡せるようにし、`GET /approvals/:id/content` が返す。**アプリ側にテスト専用の抜け道は足していない**

いずれも `adr0017-sub-fix-normalization-offset` が引き取って閉じた。

### 6.8 残る記録

- [x] 6.8.1 `docs/specs/reference/mdc-observations.md` を作る（`upstream-observations.md` と同じ「調べて分かった事実」の枠。決定ではないので ADR にしない）（`docs/specs/reference/mdc-observations.md` を新設。`adr0017-sub-create-reference-mdc`）
- [x] 6.8.2 7件それぞれについて、**どのテストが固定しているか**を書く（踏んだときに落ちる先を示す）（7件それぞれにファイル名＋describe 名＋本数を併記。固定するものが無い件は引き取り先つきで明記。同上）
- [x] 6.8.3 `CLAUDE.md` の Docs 節に載せる（同上）
- [x] 6.8.4 `docs/specs/reference/stroke-modules.md`（モジュールの使い方）から参照させる（同上）

### 6.9 検証

**この節は親に残っている。** 引き取り先の検証はそれぞれのスコープ内で閉じており、change 全体を通した確認は誰も行っていない。加えて `adr0017-sub-fix-normalization-offset` が書きかけのため、**現在の作業ツリーは `yarn typecheck` と `yarn test` が落ちる**（`MarkdownView.vue` で `computed` と `createSourceMapping` が未 import）。**この3件は分割先が全部終わってからでないと実施できない。**

- [ ] 6.9.1 上のテストを実際に**壊して**みて、落ちることを確かめる（書いただけで検知できていないものが無いこと）
  - `adr0017-sub-add-detection-assumptions` が壊したのは自分が足した33本のみ。**6.5.1（`pre-mark.test.ts` の8本）は未変異**で、ここに残っている
- [ ] 6.9.2 `yarn check`（typecheck + openspec validate）が通ることを確かめる
  - 引き取り先が実測したのは `yarn typecheck` のみで、`openspec validate` の記録が無い
- [ ] 6.9.3 `yarn test` と `yarn test:e2e` がこの change の前と同じ結果であることを確かめる
  - 引き取り先の基準は自分の着手時点（437 passed）であって「この change の前」ではない。**親の基準での突き合わせが残っている**
