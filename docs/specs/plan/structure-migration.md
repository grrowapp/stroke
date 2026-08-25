# 構造の移行課題

規範（`docs/specs/core/system-structure.md`）に対する現状の差分。いずれも別 change で寄せる。

| 現状 | 規範との差 |
| --- | --- |
| `pages/strokes/**` | ルーティングを `pages/projects/create/` 配下へ |
| `components/` が shared / workspace / stroke / review ＋直下平置き | `ui/` ＋機能単位へ移す（全数の対応は `docs/specs/core/file-components.md`） |
| `composables/` が shared / workspace ＋直下平置き | 関心単位の平置きへ統一。`useProposalReview` の分割と、`useAnnotations` の色定数の扱い——**色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ**（検討）——を含む（`docs/specs/core/file-composables.md`） |
| `server/utils/` が upstream / control / stroke | 関心単位へ再編（区分は `docs/specs/core/server-structure.md`） |
| `assets/css/stroke.css` | design token の統合（`openspec/changes/adopt-upstream-design-tokens`）とあわせて畳む |
| コーディング規約（auto-import 不使用・テスト・画面は判断しない） | steering へ移す（steering の連動更新で反映） |
| `prompt/first-order.md`（1ファイルのための第1階層ディレクトリ） | 置き場を見直す（規範のツリーに含めない） |
| markdown 操作が `MarkdownNodes.ts`（defineComponent）と `DocumentView.vue` / `DocumentEditor.vue` に分散 | markdown 操作のコンポーネントへ集約する（`MarkdownNodes` の component 化を含む。方向は `docs/specs/core/file-components.md`、詳細設計は未定） |
