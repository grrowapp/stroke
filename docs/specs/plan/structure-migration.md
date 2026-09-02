# 構造の移行課題

規範（`docs/specs/core/system-structure.md`）に対する現状の差分。いずれも別 change で寄せる。

**差があること自体は違反ではない。** 規範は到達点を定め、`openspec/specs/app-structure` は区切りの名前を持たない（判定だけを持つ）ので、ここに載っている差を寄せる作業が spec に反することはない（`update-docs-structure` で整理）。

| 現状 | 規範との差 |
| --- | --- |
| `pages/strokes/**` | ルーティングを `pages/projects/create/` 配下へ |
| `components/` が project / prototype / review / shared / stroke / workspace ＋直下平置き | `ui/` ＋機能単位へ移す（全数の対応は `docs/specs/core/file-components.md`。`project/` 2本と `prototype/` 5本は棚卸しに未追従）。**`update-docs-structure` では動かさない。移行課題として残る。** ~~ただし `global/MarkdownPre.vue` は動かせない~~ → **解消済み**（`create-module-markdown`）。`MarkdownPre` は `modules/markdown/runtime/render/MarkdownFence.vue` へ移り、`mdc.components.map` が要求する `app.component()` 登録は `modules/markdown/index.ts` の `addComponent({ global: true })` が行う。`components/global/` は消え、規範の区切りに従えない例外は無くなった |
| ~~`composables/` が shared / workspace ＋直下平置き~~ | **平置きは実施済み**（`replace-handrolled-with-libraries`）。9本すべてが `app/composables/` 直下。残るのは `useProposalReview` の分割と、`useAnnotations` の色定数の扱い——**色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ**（検討）——（`docs/specs/core/file-composables.md`） |
| `composables/useRelativeTime.ts` が `useXxx` を持たない | 中身は純関数 `formatRelativeTime` のみで、規範の「関心単位の `useXxx` を平置き」に当てはまらない。参照元は5ページ。**規範のツリーに純関数の置き場（`app/utils/` 等）が無い**ため、置き場の新設とあわせて決める |
| auto-import が有効のまま | steering（`.spec-workflow/steering/structure.md` の Import Patterns）が定める明示 import に、実装が従っていない。`nuxt.config.ts` に `imports` の設定が無く、ストローク側は明示 import 無しで動いている（統一は `align-coding-conventions`） |
| `server/utils/` が upstream / control / stroke | 関心単位へ再編（区分は `docs/specs/core/server-structure.md`） |
| `assets/css/stroke.css` | design token の統合（`openspec/changes/adopt-upstream-design-tokens`）とあわせて畳む |
| `prompt/first-order.md`（1ファイルのための第1階層ディレクトリ） | 置き場を見直す（規範のツリーに含めない） |
| ~~markdown 操作が `MarkdownNodes.ts`（defineComponent）と `DocumentView.vue` / `DocumentEditor.vue` に分散~~ | **解消済み**（`replace-handrolled-with-libraries` → `create-module-markdown`）。前者で `MarkdownNodes.ts` を削除し、描画を `@nuxtjs/mdc` の `<MDC :value>` 1方式へ寄せた。後者で描画・編集・フェンスの後段・parse 設定・見た目をすべて `modules/markdown/` に閉じた（`MarkdownView` / `MarkdownSource` / `MarkdownEditor` / `MarkdownFence` / `MarkdownCode` / `MarkdownDiagram`、`index.ts`、`markdown.css`）。`app/components/` にも `nuxt.config.ts` にも markdown の実体は無い。全数は `docs/specs/core/system-structure.md` §3 |
