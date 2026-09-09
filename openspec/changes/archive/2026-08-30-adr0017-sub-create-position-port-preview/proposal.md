# adr0017-sub-create-position-port-preview

## Why

整形された本文を描くコンポーネント `MarkdownView` は、描かれた範囲と生テキストの位置を対応づける手段を外へ公開していない。

`openspec/specs/markdown/module` は「描いた本文と生テキストの位置の対応を公開する」を要件として持ち、「外から引ける形で公開しなければならない（SHALL）」と定める。変換の実装は在る（`modules/markdown/runtime/position/preview.ts` の `createPreviewPositionPort`）。**無いのは公開の手続きだけ**で、呼び出し元は単体テスト3本しかない。

生テキストを描く `MarkdownSource` は `defineExpose({ toSourceRange, toDomRange } satisfies PositionPort)` で既に公開している。2つの面のうち片方だけが揃っていない。

この非対称のため、後続の `adr0017-sub-create-module-annotation`（tasks 0/23、未着手）が着手できない。注釈は面ごとに実装を持たず `PositionPort` だけを見る設計で、片面が公開されていないと成立しない。親 change の `design.md` が「整形済み本文の表示からは未提供。`annotation-module` の着手前に対応が必要になる」と記していたのがこれである。

親 change `create-module-markdown` の tasks にこれを閉じる項目が無い。実装の途中で生じた抜けで、放っておくと親が archive されたときに要件だけが残って実体が伴わない状態になる。

## What Changes

- **`MarkdownView` が `PositionPort` を `defineExpose` で公開する。** 公開するのは `toSourceRange(Range): SourceRange | null` と `toDomRange(SourceRange): Range | null` の2つのメソッドだけで、描画に使っている DOM 要素そのものは外へ出さない。`MarkdownSource` と同じ形にし、使う側が2つの面を区別せずに扱えるようにする
- **`PositionPort` が返すオフセットの基準を型のドキュメントに明記する。** 基準は「渡された文字列の先頭からの位置」である。改行の表現や front matter を**誰が**正規化するかはこの change では決めない（`adr0017-sub-fix-normalization-offset` が決める）。ここで定めるのは基準だけなので、後続がどちらに決めてもこの契約は動かない
- **本文が描かれていないとき、変換は `null` を返す。** 描画対象が無いのに位置を答えない
- **公開が消えたら落ちるコンポーネントテストを置く。** いま検知が無く、`defineExpose` を外しても単体テストは全部通る
- 親 change の tasks 5.1 を閉じる。`keepPosition` は `MarkdownView` の `parser-options` から既に渡っており、記帳が漏れているだけである

**対象外**

- `MarkdownEditor` は `PositionPort` を中継しない。注釈が付く承認レビュー画面は `MarkdownEditor` を使わず `MarkdownView` を直に使う。編集中プレビューで注釈を付けるかどうかは後続の annotation 側の決めであり、先回りしない
- 解析の段（`<MDC>` と `parser-options`）には触れない。`<MDC>` のスロットだけを差し替えている形から外れると、クライアントの再解析で shiki の色が SSR とずれ、**アプリ全体のアイコンが消える**（実測。markdown 本文には症状が出ない）。この change で足すのは器の `ref` と `defineExpose` だけである
- 「口」という語の一括置換。`CONTEXT.md` の1箇所は本 change の grilling で直したが、コードコメント41箇所・spec の要件見出し2本・`CLAUDE.md` は別 change に切る

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `markdown/module`: 要件「描いた本文と生テキストの位置の対応を公開する」に、**整形された本文を描くコンポーネントが対応を実装すること**と、**返すオフセットの基準が「渡された文字列の先頭から」であること**を加える。現行の要件は「モジュールが公開する」としか定めておらず、2つの面のうちどちらが実装するのかを縛っていないため、片面だけ実装した現状が要件違反として検知されない

**この capability は `openspec/specs/` にまだ存在しない。** 親 change `create-module-markdown` のデルタで ADDED されるもので、親は未 archive である。したがって本 change は親より先に archive できない。

## Impact

**コード**

- `modules/markdown/runtime/render/MarkdownView.vue` — 描画の器に `ref` を付け、`createPreviewPositionPort({ container, source })` を `defineExpose` で公開する
- `modules/markdown/runtime/position/types.ts` — `PositionPort` が返すオフセットの基準をドキュメントに明記する

**テスト**

- `test/modules/markdown/runtime/render/`（新規）— 公開が消えたら落ちるテスト。既存の `test/modules/markdown/runtime/position/preview.test.ts`（35本）は変換そのものを固定しており、公開の有無は見ていない

**依存**

追加なし。`createPreviewPositionPort` も `PositionPort` も実装済みである。

**資料**

- 親 change `create-module-markdown` の `tasks.md` — 5.1 を閉じる
- `CONTEXT.md` — 本 change の grilling で「公開する口」を「外へ公開するもの」へ直した（実施済み）

**他の change との関係**

- 前提: 無し。この epic の Wave 0 である
- 後続: `adr0017-sub-add-detection-assumptions` / `adr0017-sub-fix-normalization-offset` / `adr0017-sub-create-reference-mdc`、および `adr0017-sub-create-module-annotation`
- 親 `create-module-markdown` は残る。archive は分割した4件が全部終わってから（ADR-0017）
