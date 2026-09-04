# 構造の移行課題

構造の規範（`docs/specs/structure/system-structure.md`。以下「規範」。棚卸しは同ディレクトリの `file-components.md` / `file-composables.md` / `server-structure.md`）に対する現状の差分。いずれも別 change で寄せる。

**差があること自体は違反ではない。** 規範は到達点を定め、`openspec/specs/app-structure` は区切りの名前を持たない（判定だけを持つ）ので、ここに載っている差を寄せる作業が spec に反することはない（`update-docs-structure` で整理）。

| 現状 | 規範との差 |
| --- | --- |
| `components/` が project / prototype / review / shared / stroke / workspace ＋直下平置き | `ui/` ＋機能単位へ移す（全数の対応は components の棚卸し。`project/` 2本と `prototype/` 5本は棚卸しに未追従）。**移行課題として残る。** ~~ただし `global/MarkdownPre.vue` は動かせない~~ → **解消済み**（markdown のモジュール化）。`MarkdownPre` は `modules/markdown/runtime/render/MarkdownFence.vue` へ移り、`mdc.components.map` が要求する `app.component()` 登録は `modules/markdown/index.ts` の `addComponent({ global: true })` が行う。`components/global/` は消え、規範の区切りに従えない例外は無くなった |
| ~~`composables/` が shared / workspace ＋直下平置き~~ | **平置きは実施済み。** 全数が `app/composables/` 直下。残るのは `useProposalReview` の分割と、`useAnnotations` の色定数の扱い——**色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ**（検討）——（composables の棚卸し） |
| `composables/useRelativeTime.ts` が `useXxx` を持たない | 中身は純関数 `formatRelativeTime` のみで、規範の「関心単位の `useXxx` を平置き」に当てはまらない。参照元は5ページ。**規範のツリーに純関数の置き場（`app/utils/` 等）が無い**ため、置き場の新設とあわせて決める |
| auto-import が有効のまま | steering（`.spec-workflow/steering/structure.md` の Import Patterns）が定める明示 import に、実装が従っていない。`nuxt.config.ts` に `imports` の設定が無く、ストローク側は明示 import 無しで動いている（統一は `align-coding-conventions`） |
| `server/utils/` が upstream / control / stroke | 関心単位へ再編（区分は server/utils の棚卸し） |
| ~~`assets/css/stroke.css`~~ | **解消済み。** `main.css` のストロークの区画へ畳んだ |
| `prompt/first-order.md`（1ファイルのための第1階層ディレクトリ） | 置き場を見直す（規範のツリーに含めない） |
| ~~markdown 操作が `MarkdownNodes.ts`（defineComponent）と `DocumentView.vue` / `DocumentEditor.vue` に分散~~ | **解消済み。** まず `MarkdownNodes.ts` を削除し、描画を `@nuxtjs/mdc` の `<MDC :value>` 1方式へ寄せた。次に描画・編集・フェンスの後段・parse 設定・見た目をすべて `modules/markdown/` に閉じた（`MarkdownView` / `MarkdownSource` / `MarkdownEditor` / `MarkdownFence` / `MarkdownCode` / `MarkdownDiagram`、`index.ts`、`markdown.css`）。`app/components/` にも `nuxt.config.ts` にも markdown の実体は無い。全数は規範 §3 |
