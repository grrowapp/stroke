# components の棚卸し

`app/components/` の現状の実態と、規範（`docs/specs/core/system-structure.md` の区切り）への対応を書き出したもの。

## 規範への対応 — 全18本

規範の区切りは **`ui/`（機能に属さない共通部品）＋ 機能単位**。現在の18本をこの区切りへ写すと:

| 区切り | 部品（現在の置き場 →） | 根拠 |
| --- | --- | --- |
| `ui/` | `SbIcon` `UpstreamIcon`（shared/）、`WaitingIndicator`（直下）、`EmptyState` `RecordList` `DocumentView` `DocumentEditor` `WorkspacePanel`（workspace/） | どの機能にも属さない見た目の部品。一覧・本文・外枠・アイコン・待機表示 |
| `notification/` | `NotificationToaster`（shared/） | 通知の受け口 |
| `project/` | `OverviewForm`（stroke/） | 概要入力はプロジェクトを起こす入口 |
| `question/` | `QuestionCard`（stroke/）、`AgentQuestionModal` `StrokeBreadcrumb`（直下） | 問いの提示・回答と、ストローク履歴の表示。`Question` / `Answer` / `Stroke` 型を扱う |
| `proposal/` | `AnnotateSource` `CommentCard` `CommentModal` `Modals`（review/） | proposal の確認・注釈・差し戻し。`Annotation` / `HighlightColor` 型を扱う |
| `approval/` | `ApprovalCard`（workspace/） | 承認1件の表示 |

### markdown 操作の集約（方向のみ。詳細設計は未定）

`MarkdownNodes.ts`（md4x の AST を Vue のノードに落とす defineComponent）は `DocumentView.vue` へマージして Vue コンポーネント化し、markdown 操作のコンポーネント——名前は `MarkdownComponent`、または `MarkdownView` / `MarkdownEdit` の対——へ集約する。本家 spec-workflow-mcp の mdx（`MDXEditorWrapper`）と md4x の使い方を参考に、まず markdown 操作のコンポーネントを固める。**詳細設計は未定**（名前の最終決定・props の設計は集約の change で行う）。

移動の実施は `docs/specs/plan/structure-migration.md`。

---

以下は統合前の棚卸しの記録。

## 一覧

置き場が3層に分かれている。**直下 / `stroke/` / `review/`。**

| ファイル | 行 | 受け取るもの | 返すもの |
|---|---|---|---|
| `StrokeBreadcrumb.vue` | 116 | `strokes: Stroke[]` / `current` | — |
| `WaitingIndicator.vue` | 11 | `message: string` | — |
| `stroke/OverviewForm.vue` | 65 | — | `submit: [overview]` |
| `stroke/QuestionCard.vue` | 109 | `question: Question` | `answer: [Answer]` |
| `review/AnnotateSource.vue` | 132 | `source: string` / `comments: Annotation[]` | 選択・編集など |
| `review/CommentCard.vue` | 57 | `comment: Annotation` | `edit: [id]` / `remove: [id]` |
| `review/CommentModal.vue` | 62 | 編集対象ほか + `v-model:open` | `save: [comment, color]` |
| `review/FollowupModal.vue`（**削除済み**） | 107 | 問いほか + `v-model:open` | `answer: [Answer]` |
| `review/Modals.vue` | 94 | **`review: ReturnType<typeof useProposalReview>`** | — |

## 置き場の区分

現状の3層は、**基準が揃っていない。**

```
app/components/
├── StrokeBreadcrumb.vue    ← 直下。両方の画面で使う
├── WaitingIndicator.vue    ← 直下。両方の画面で使う
├── stroke/                 ← 画面1でしか使わないもの
│   ├── OverviewForm.vue
│   └── QuestionCard.vue
└── review/                 ← 画面2でしか使わないもの
    ├── AnnotateSource.vue
    ├── CommentCard.vue
    ├── CommentModal.vue
    ├── FollowupModal.vue   ← 削除済み（現存しない）
    └── Modals.vue
```

**直下 = 共用、サブディレクトリ = その画面専用**、という区分になっている。ただしそれはどこにも書かれていない。

`stroke/` という名前も紛らわしい。`review/` が「proposal のレビュー」という**役割**の名前なのに対し、`stroke/` は「画面1（ストローク画面）」という**場所**を指している。両者の命名の基準が違う。

## 受け渡しの形

7本は **props と emit** で閉じている。型は `#shared/types` から取る。素直な形。

**1本だけ違う。**

```ts
// review/Modals.vue
const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>()
```

`Modals.vue` は composable の**戻り値そのもの**を受け取る。46 個のプロパティを持つオブジェクトを丸ごと渡していて、この1本だけ結合の仕方が違う。

`review/` の4つのモーダルを1箇所にまとめる役をしていて、それぞれへ `review.xxx` を配り直している。

## `#shared/types` への依存

| 型 | 使うコンポーネント |
|---|---|
| `Stroke` | `StrokeBreadcrumb` |
| `Question` / `Answer` | `stroke/QuestionCard`、`review/FollowupModal`（**削除済み**） |
| `Annotation` | `review/AnnotateSource`、`review/CommentCard` |
| `HighlightColor` | `review/AnnotateSource`、`review/CommentModal` |

`review/CommentModal.vue` だけ、型以外も import している。

```ts
import { defaultHighlightColor, highlightColors } from '~/composables/useAnnotations'
```

**コンポーネントが composable から値（色の定義5件）を取っている。**

## 気づいたこと

- **置き場の区分の基準が2つ混ざっている。** 直下は「共用」という**使われ方**、`review/` は「レビュー」という**役割**、`stroke/` は「画面1」という**場所**
- **`Modals.vue` だけ結合の仕方が違う。** 他は props と emit、これだけ composable の戻り値を丸ごと受ける
- **`WaitingIndicator.vue` は 11 行。** props 1つで、`.blink` クラスを当てるだけ
- **`FollowupModal.vue`（画面2の問い返し）と `stroke/QuestionCard.vue`（画面1の問い）が、同じ「問いを出して答えを受ける」ことをしている。** 置き場も名前も違うが、扱っているものは同じ `Question` と `Answer`
- **コンポーネントから composable への import が1件ある**（`CommentModal` → `useAnnotations` の色定義）。依存の向きとしては逆向き
