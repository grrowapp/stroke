# adr0017-sub-add-detection-assumptions

## Why

`create-module-markdown` の実装で前提が7件崩れた。**うち3件は黙って壊れる** — 症状が出ないまま誤った位置を返す、あるいは markdown 本文の外が壊れる。

- **解析を自前で組み直すとハイドレーションが壊れる。** クライアントの再解析で shiki の色が SSR とずれ、アプリ全体のアイコンが消えた。markdown 本文には症状が出ず、全画面のピクセル差分だけが捕まえた
- **offset 0 から始まるノードは `position` を持たない。** `parser/compiler.js` が `node.position?.start?.offset && …` と真偽判定するため。そこに 0 を書くと文書の冒頭が `[0,0)` を指す
- **記法によって `position` が記号を含むかが違う。** `**強調**` は含まず、`` `インラインコード` `` は含む。長さを按分すると1〜2文字ずれた位置を黙って返す

さらに検知力を測ったとき、**テストが AST の構造を何も固めていない**ことが分かった。出力が実際に変わったのに143本すべてが通過した変異が3件ある（`li` の段落ほどき・改行だけの text ノードの除去・見出しの id）。マイナーリリースが最も変えやすいのがこの層である。

資料に書くだけでは、読まなかった人が同じ穴に落ちる。**踏んだら止まる**状態にするまでを範囲とする。

## What Changes

- **黙って壊れる3件それぞれに、踏んだら赤くなるテストを置く**（6.1 / 6.2 / 6.3）
- **AST の構造を固める**（6.10）。`li` の段落ほどき・改行だけの text ノードの除去・見出しの id
- **`readOffset` の `Number('') === 0` を塞ぐ**（6.2.3）。空の属性がいま有効なオフセット 0 として読まれる。ガードは在るが `Number.isInteger(0) && 0 >= 0` を通る
- **位置の印が DOM に出る経路が消えたら落ちるテストを置く**（6.4.2）。あわせて、**包みが1つも無い本文で器ぜんたいを選ぶと `null` に倒れず切り詰めた範囲を返す**件を塞ぐ（`0..15` 相当が正解のところ `0..8` が返る。`adr0017-sub-create-position-port-preview` の design.md R6 で実測）
- **`pre` の印と逃げ道**（6.5）。印が消えたら落ちること、逃げ道が推測を黙って通さないこと、どちらの経路を通ったかが分かること
- **差の一覧をテスト名から読めるようにする**（6.6.2）
- **検証**（6.9）。追加したテストを壊して落ちることを確かめ、`yarn test` / `yarn test:e2e` が前と同じ結果であること

**対象外**

- **`@nuxt/icon` の 404 は直さない。** この環境ではアイコン消失そのものが再現しない（カスタムコレクションが読めず、SSR も客側も空の `<svg>` を出す）が、**アイコン消失は症状であって原因ではない**。原因は「SSR と客側で字と要素の並びがずれる」ことで、そちらは `e2e/markdown-hydration.spec.ts` が拾う。404 を直すのは環境整備で、この change をそれに引きずられさせない（6.14.2 の二択のうち「再現しない前提で検知の設計を見直す」を採る）
- **`SourceRange` を branded type にしない。** 「offset 0」と「位置が無い」の取り違えはガード関数と単体テストで塞ぐ。型で分ける案は後続 `adr0017-sub-create-module-annotation` の API を先に縛ることになるため、消費者が実在してから判断する
- **正規化の責務**（`adr0017-sub-fix-normalization-offset` が持つ）

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。

**この change は振る舞いを変えない。** 加えるのはテストと、`readOffset` のガード1件（空文字を弾く。仕様上いま返るべき値は変わらない）だけである。`markdown/module` の要件は既に「対応が取れないことが呼ぶ側に分かる。誤った範囲を返してはならない」と定めており、この change はそれを**満たしていることを検知可能にする**作業であって、要件そのものを増やさない。

したがって `.openspec.yaml` に `skip_specs: true` を置く。

## Impact

**テスト**

- `test/modules/markdown/runtime/position/*.test.ts` — `silent-failure` / `edge-cases` / `pre-mark` / `preview` / `plain` / `fence`
- `test/modules/markdown/runtime/render/` — `MarkdownView` が `<MDC>` のスロットだけを差し替えている形から外れたら落ちるテスト（6.1.1）
- `e2e/markdown-hydration.spec.ts` — 6.14.1 の属性ずれ

**コード**

- `modules/markdown/runtime/position/preview.ts` — `readOffset` のガード
- `modules/markdown/runtime/position/fence.ts` — `FenceSource.position` の判定
- `modules/markdown/runtime/render/MarkdownView.vue` / `modules/markdown/index.ts` — コメントを実測の根拠つきで確定（6.1.3）

**依存**

追加なし。`@nuxtjs/mdc@0.23.1` が最新で上げ先が無いため、パーサの挙動の変化はパーサを直接変異させて測る（親 change の 6.6.1 と同じ手）。

**他の change との関係**

- 前提: `adr0017-sub-create-position-port-preview`（完了）。6.1.1 と 6.4.2 が `MarkdownView` の形を固定するため、公開が出そろってから書く
- 親 `create-module-markdown` の tasks 6.1・6.2・6.3・6.4・6.5・6.6.2・6.9・6.10・6.14 を引き取る

---

## この proposal で私が取った決め（未承認の仮定）

grilling の質問を2度とも見送られたため、次の4件は私の判断で決めた。**違うなら差し戻すこと。**

| 件 | 決め | 理由 |
| --- | --- | --- |
| 6.14.2 の二択 | 再現しない前提で検知の設計を見直す | アイコン消失は症状。原因側は `markdown-hydration.spec.ts` が拾う。404 の解決待ちにしない |
| 6.2.3 の型 | ガード関数で塞ぐ。branded type は入れない | 消費者が `modules/markdown/` の中だけの今、後続 annotation の API を先に縛らない |
| R6（切り詰めた範囲を返す） | 6.4.2 / 6.5.2 に含める | 同じ経路。項目を増やさない |
| 「わざと壊す」の範囲 | 黙って壊れる3件（6.1 / 6.2 / 6.3）と 6.10 は必須。他はテストの存在確認 | 6.10 は143本を素通りした実績があり、書いただけでは足りないことが分かっている |
