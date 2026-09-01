---
status: Tasks
change: create-module-annotation
tags:
  - enhancement
---

# create-module-annotation

注釈を別のモジュールとして切り出し、整形された本文の面でも指摘を付けられるようにする。

注釈は本家（`react-text-annotate-blend`）の写しで、生テキストの面にしか付けられない。整形された本文を読みながら指摘したい場でも、指摘のためだけに面を切り替えることになる。

`create-module-markdown` から委譲された。あちらは markdown を扱う実体をモジュールに閉じ、「描いた本文と生テキストの位置の対応」を口として公開するところまでを持つ。この change はその口の利用者として、注釈の側を扱う。**親の分割ではなく別の関心事なので、独立した change として扱う**（ADR-0017「委譲の内訳」）。

起票時点で意図したのは次の3つ。

- 注釈が markdown の描き方を知らずに済むようにする（起票時は「`modules/annotation/` に閉じる」としていたが、2026-09-01 に作らないと決まった。実体は `app/` のまま。理由は change の design 決定13）
- 整形された本文の面でも注釈を付けられるようにし、どちらの面で付けた注釈も両方の面に出るようにする
- 面を2つ（整形された本文・生テキスト）に絞る。並べて見せる面は、読む面と指摘する面が別だったことに由来するもので、どちらでも付けられるなら要らない

---

## 引き継いだ判断

### `SourceRange` を型で「offset 0」と「位置が無い」に分けるか（2026-09-01 に `create-module-markdown` から）

親 change の tasks 6.2.3 が「位置を扱う関数が `undefined` と 0 を取り違えられない型にする」を挙げ、3点を指摘した。うち2点は塞がっている。

- `preview.ts` の `readOffset` が `Number('') === 0` を通す → `if (value.trim() === '') return null;` のガードで解決
- `FenceSource.position` の `if (!position)` → 型は変えず、`fence.ts:237-248` にコメントで固定

**残る1点をこの change が引き取る。** `MDCNode.position` は `position?`、`SourceRange` は素の `number` で、「offset 0」と「位置が無い」を型で分ける仕組みが無い。規律が書き方の側にしかない。

**先送りにした理由。** `adr0017-sub-add-detection-assumptions`（archive 済み）の proposal「対象外」がこう定めている — 「`SourceRange` を branded type にしない。ガード関数と単体テストで塞ぐ。型で分ける案は後続 `create-module-annotation` の API を先に縛るため、**消費者が実在してから判断する**」。その消費者がこの change である。いま型を決めると、まだ形の定まっていない注釈側の API を先に縛ることになる。

**いま実害は無い。** 実際に踏みうる2つは塞がっており、残るのは設計上の弱さのみ。位置の口を実際に使い始めてから、branded type にするか・ガード関数のままでよいかを判断すること。

判断材料:

- `modules/markdown/runtime/position/types.ts` — `SourceRange` は `start: number; end: number;` の素の形
- `modules/markdown/runtime/position/fence.ts:237-248` — `!position` のままコメントで固定
- 実際に踏んだ不具合は「offset 0 から始まる要素の `position` が `undefined` になり、そこに 0 を書くと文書の冒頭が `[0,0)` を指す」（`docs/specs/reference/mdc-observations.md`）

### `MarkdownSource.vue` の最初の使い手になる

生テキストの面（`modules/markdown/runtime/render/MarkdownSource.vue`）は実装済みだが、実コードからの import が0件である。この change が最初の利用者になる。

### develop に prototype のコードが入っている

`add-full-width-markdown-editor` の prototype が develop に入っており（`34b58428`）、`ApprovalAnnotator.vue` と `workspace.vue` を書き換えている。版は1つに収束済み（旧版 `usePrototypeFullWidth.ts` / `PrototypeVariantBar.vue` は存在しない。2026-09-01 実測）。`add-full-width-markdown-editor` が撤去するので、着手前に残っていないことを確かめること。
