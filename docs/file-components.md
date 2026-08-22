# components の棚卸し

`app/components/` に8本。現状の実態を書き出したもの。

**これは棚卸しであって規則ではない。** 今こうなっている、という記録にすぎない。どう切り直すべきかは決めていない。置き場の規則は `docs/structure.md`。

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
| `review/FollowupModal.vue` | 107 | 問いほか + `v-model:open` | `answer: [Answer]` |
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
    ├── FollowupModal.vue
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
| `Question` / `Answer` | `stroke/QuestionCard`、`review/FollowupModal` |
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
