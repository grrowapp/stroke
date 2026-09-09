---
status: ready-for-agent
change: adr0017-sub-create-position-port-preview
tags:
  - enhancement
---

# adr0017-sub-create-position-port-preview

整形された本文の面から、位置の口が出ていない。

`openspec/specs/markdown/module` の Requirement「描いた本文と生テキストの位置の対応を公開する」は「外から引ける形で公開しなければならない（SHALL）」と定める。生テキストの面（`MarkdownSource.vue`）は `defineExpose({ toSourceRange, toDomRange } satisfies PositionPort)` で口を出しているが、`MarkdownView.vue` は出していない。変換の実装（`position/preview.ts` の `createPreviewPositionPort`）は在るのに公開の手続きが無く、呼び出し元は単体テスト3本だけである。

`create-module-markdown` から分けた。あちらの tasks にこの穴を閉じる項目が無い。あちらの design.md が「位置インターフェースは原文の表示からは提供済みだが、整形済み本文の表示からは未提供である。`annotation-module` の着手前に対応が必要になる」と記していたのがこれに当たる。

後続の `adr0017-sub-create-module-annotation` の着手条件でもある。

**解析の段には触れない。** `<MDC>` のスロットだけを差し替えている形から外れると、クライアントの再解析で shiki の色が SSR とずれ、アプリ全体のアイコンが消える（実測）。足すのは器の `ref` と `defineExpose` だけである。

あわせて tasks 5.1（`keepPosition` を立てる）を閉じる。`MarkdownView.vue` の `parser-options` から既に渡っており、記帳が漏れているだけである。
