# 構造の移行課題

規範（`docs/specs/core/system-structure.md`）に対する現状の差分。いずれも別 change で寄せる。

| 現状 | 規範との差 |
| --- | --- |
| `components/` が global / shared / workspace / stroke / review ＋直下平置き | `ui/` ＋機能単位へ移す（全数の対応は `docs/specs/core/file-components.md`）。**ただし `global/MarkdownPre.vue` は動かせない** — `mdc.components.map` が `resolveComponent(名前)` で引き、`app.component()` 登録されるのは `components/global/` だけ（実測）。規範の区切りに従えない唯一の例外 |
| ~~`composables/` が shared / workspace ＋直下平置き~~ | **平置きは実施済み**（`replace-handrolled-with-libraries`）。9本すべてが `app/composables/` 直下。残るのは `useProposalReview` の分割と、`useAnnotations` の色定数の扱い——**色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ**（検討）——（`docs/specs/core/file-composables.md`） |
| `composables/useRelativeTime.ts` が `useXxx` を持たない | 中身は純関数 `formatRelativeTime` のみで、規範の「関心単位の `useXxx` を平置き」に当てはまらない。参照元は5ページ。**規範のツリーに純関数の置き場（`app/utils/` 等）が無い**ため、置き場の新設とあわせて決める |
| auto-import が有効のまま | `file-composables.md` は「平置き後も明示 import を維持する（`nuxt.config` の `autoImport: false` 前提）」と定めるが、`nuxt.config.ts` に `imports` の設定が無い。ストローク側は明示 import 無しで動いている（統一は `align-coding-conventions`） |
| `server/utils/` が upstream / control / stroke | 関心単位へ再編（区分は `docs/specs/core/server-structure.md`） |
| `assets/css/stroke.css` | design token の統合（`openspec/changes/adopt-upstream-design-tokens`）とあわせて畳む |
| コーディング規約（auto-import 不使用・テスト・画面は判断しない） | steering へ移す（steering の連動更新で反映） |
| `prompt/first-order.md`（1ファイルのための第1階層ディレクトリ） | 置き場を見直す（規範のツリーに含めない） |
| ~~markdown 操作が `MarkdownNodes.ts`（defineComponent）と `DocumentView.vue` / `DocumentEditor.vue` に分散~~ | **解消済み**（`replace-handrolled-with-libraries`）。`MarkdownNodes.ts` を削除し、描画は `@nuxtjs/mdc` の `<MDC :value>` 1方式へ。フェンスの後段は `global/MarkdownPre`（振り分け）→ `workspace/MermaidDiagram` / `workspace/CodeBlock` に集約した |
