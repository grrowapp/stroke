# components の棚卸し

`app/components/` の現状の実態と、規範（`docs/specs/core/system-structure.md` の区切り）への対応を書き出したもの。

## 規範への対応 — 全19本

規範の区切りは **`ui/`（機能に属さない共通部品）＋ 機能単位**。現在の19本をこの区切りへ写すと:

| 区切り | 部品（現在の置き場 →） | 根拠 |
| --- | --- | --- |
| `ui/` | `WaitingIndicator`（直下）、`EmptyState` `RecordList` `DocumentView` `DocumentEditor` `WorkspacePanel`（workspace/） | どの機能にも属さない見た目の部品。一覧・本文・外枠・待機表示 |
| `ui/`（続き） | `MarkdownPre`（global/）、`MermaidDiagram` `CodeBlock`（workspace/） | markdown のフェンスの後段。どの機能にも属さない見た目の部品。ただし `MarkdownPre` だけは **`global/` から動かせない**（`mdc.components.map` が `resolveComponent(名前)` で引き、`app.component()` 登録されるのは `components/global/` だけ）。規範の区切りに従えない唯一の例外 |
| `notification/` | `NotificationToaster`（shared/） | 通知の受け口 |
| `project/` | `OverviewForm`（stroke/） | 概要入力はプロジェクトを起こす入口 |
| `question/` | `AgentQuestion` `StrokeBreadcrumb`（直下） | 問いの提示・回答と、ストローク履歴の表示。`Question` / `Answer` / `Stroke` 型を扱う |
| `proposal/` | `AnnotateSource` `CommentCard` `CommentModal` `Modals`（review/） | proposal の確認・注釈・差し戻し。`Annotation` / `HighlightColor` 型を扱う |
| `approval/` | `ApprovalCard`（workspace/）、`ApprovalAnnotator`（review/） | 承認1件の表示と、対象文書への指摘・差し戻し |

移動の実施は `docs/specs/plan/structure-migration.md`（change: `reorganize-components`）。**未実施。**

### アイコンは component ではなくなった

`replace-handrolled-with-libraries` で、次の3本が component の一覧から消えた。

| 消えたもの | 今どこにあるか |
| --- | --- |
| `shared/SbIcon.vue` | `UIcon` + カスタムコレクション `sb:`（`app/assets/icons.ts`、8個。prototype 由来） |
| `shared/UpstreamIcon.vue` | `UIcon` + カスタムコレクション `upstream:`（`app/assets/icons.ts`、本家由来） |
| `workspace/MarkdownNodes.ts` | `@nuxtjs/mdc` の `<MDC :value>`（`workspace/DocumentView.vue`） |

- アイコンのコレクションは `nuxt.config.ts` の `icon.customCollections` に登録し、`mode: 'svg'`（inline SVG）で描く。`UIcon :name="sb:…" / "upstream:…"` を書く場所は `workspace/ApprovalCard.vue`（6箇所）・`shared/NotificationToaster.vue`（3）・`workspace/RecordList.vue`（2）・`workspace/EmptyState.vue`（1）と、pages / layouts の5ファイル。
- markdown の parse 設定は `nuxt.config.ts` の `mdc`（`headings.anchorLinks: false` / `rehypePlugins: {'rehype-raw': false}` / `components.prose: false` / `components.map: { pre: 'MarkdownPre' }`）。生 HTML は要素にならないので、`DocumentView` は自前のサニタイズを持たない。検証は `test/app/components/workspace/` の markdown-roundtrip.test.ts（63行）と markdown-sanitize.test.ts（97行）。

### markdown のフェンスには後段の component が3本ある

`replace-handrolled-with-libraries` の design 決定6（2026-08-25 改訂）で、`pre` の受け口を自前に差し替えた。

| 部品 | 役割 |
| --- | --- |
| `global/MarkdownPre.vue` | `mdc.components.map` の受け口。`language` を見て振り分けるだけ。**`global/` 以外に置くと動かない**（MDC は map の値を `resolveComponent(名前)` で引き、`app.component()` 登録されるのは `components/global/` だけ） |
| `workspace/MermaidDiagram.vue` | mermaid フェンスを図にする。`import('mermaid')` を `import.meta.client` の内側で動的 import。SSR と hydration 直後は「Loading diagram...」の枠で揃え、`onMounted` 以降に SVG へ差し替える |
| `workspace/CodeBlock.vue` | mermaid 以外のフェンス。本家の DOM が出す形（枠・右上の言語名の札・行番号・折り返し）を素の `pre` で組む |

- `MarkdownPre` は props を宣言せず `$attrs` で受ける。宣言すると属性として出ず、`CodeBlock` に shiki のクラスが届かない。
- **`v-html` はここにだけ残る。** `MermaidDiagram` が mermaid の組み立てた SVG を差し込む（本家も `dangerouslySetInnerHTML`）。文書由来の生 HTML を描く経路は `rehype-raw: false` で切ったままで、ここに入るのは mermaid 自身の出力に限られる。

---

## 一覧

置き場が6層に分かれている。**直下 / `global/` / `review/` / `shared/` / `stroke/` / `workspace/`。**

| ファイル | 行 | 受け取るもの | 返すもの |
|---|---|---|---|
| `AgentQuestion.vue` | 198 | `question: Question \| null` / `waiting` / `waitingMessage` / `answered` / `submitLabel` | `answer: [Answer]` |
| `global/MarkdownPre.vue` | 37 | **props を宣言しない**（`$attrs` で `language` / `code` ほかを受ける） | — |
| `StrokeBreadcrumb.vue` | 116 | `strokes: Stroke[]` / `current` | — |
| `WaitingIndicator.vue` | 11 | `message: string` | — |
| `review/AnnotateSource.vue` | 132 | `source: string` / `comments: Annotation[]` | `select: [{text,start,end}]` / `clickMark: [id]` |
| `review/ApprovalAnnotator.vue` | 430 | `source` / `projectId` / `approvalId` / `canRespond` + `#preview` slot | — |
| `review/CommentCard.vue` | 57 | `comment: Annotation` | `edit: [id]` / `remove: [id]` |
| `review/CommentModal.vue` | 62 | 編集対象ほか + `v-model:open` | `save: [comment, color]` |
| `review/Modals.vue` | 94 | **`review: ReturnType<typeof useProposalReview>`** | — |
| `shared/NotificationToaster.vue` | 128 | — | — |
| `stroke/OverviewForm.vue` | 65 | — | `submit: [overview]` |
| `workspace/ApprovalCard.vue` | 208 | `approval: ApprovalDto` / `to` / `projectId` | `responded: []` |
| `workspace/CodeBlock.vue` | 89 | `$attrs`（shiki のクラス・`code`・`language`）+ 既定 slot | — |
| `workspace/MermaidDiagram.vue` | 116 | `code: string` | — |
| `workspace/DocumentEditor.vue` | 211 | `content` / `save` / `canSave` / `editOnOpen` / `testid` | — |
| `workspace/DocumentView.vue` | 28 | `content` / `missing` | — |
| `workspace/EmptyState.vue` | 43 | `testid` / `title` / `icon` + 既定 slot | — |
| `workspace/RecordList.vue` | 209 | `items: RecordItem[]` / `testid` / `labels` | — |
| `workspace/WorkspacePanel.vue` | 28 | `title` / `subtitle` / `testid` + `actions` slot | — |

この2本を検証するテストは `test/app/components/workspace/`（`markdown-roundtrip.test.ts` / `markdown-sanitize.test.ts`）にある。

### 参照元

| 部品 | 使っている場所 |
|---|---|
| `AgentQuestion` | `pages/strokes/[sessionId]/index.vue`（素置き）、`pages/strokes/[sessionId]/proposal.vue`（`UModal` の body slot） |
| `global/MarkdownPre` | `nuxt.config.ts` の `mdc.components.map` から**名前で**引かれる（import される場所は無い） |
| `workspace/MermaidDiagram` / `workspace/CodeBlock` | `global/MarkdownPre.vue` からのみ |
| `StrokeBreadcrumb` | `pages/strokes/[sessionId]/index.vue`、`pages/strokes/[sessionId]/proposal.vue` |
| `WaitingIndicator` | `pages/strokes/index.vue`、`pages/strokes/[sessionId]/proposal.vue`、`AgentQuestion.vue` |
| `review/*` | `pages/strokes/[sessionId]/proposal.vue`（`CommentModal` だけは `review/Modals.vue` 経由） |
| `review/ApprovalAnnotator` | `pages/projects/[projectId]/approvals/[approvalId].vue`。`AnnotateSource` / `CommentCard` / `CommentModal` / `useAnnotations` をポータル側から使い回す唯一の経路 |
| `shared/NotificationToaster` | `app.vue` 直下 |
| `stroke/OverviewForm` | `pages/strokes/index.vue` |
| `workspace/ApprovalCard` | `pages/projects/[projectId]/approvals/` の2画面 |
| `workspace/DocumentEditor` | steering / specs / approvals の3画面 |
| `workspace/DocumentView` | `pages/projects/[projectId]/approvals/[approvalId].vue`、`DocumentEditor.vue` |
| `workspace/EmptyState` | `layouts/workspace.vue` と下層の5画面、`DocumentView.vue` |
| `workspace/RecordList` | specs / tasks / steering の4画面 |
| `workspace/WorkspacePanel` | 下層の9画面すべて |

## 置き場の区分

現状の6層は、**基準が揃っていない。**

```
app/components/
├── AgentQuestion.vue        ← 直下。両方の画面で使う
├── StrokeBreadcrumb.vue     ← 直下。両方の画面で使う
├── WaitingIndicator.vue     ← 直下。両方の画面で使う
├── global/                  ← Nuxt が app.component() で登録する場所（名前で引かれるもの）
│   └── MarkdownPre.vue
├── review/                  ← 「レビュー」という役割。画面2 と承認画面の両方で使う
│   ├── AnnotateSource.vue
│   ├── ApprovalAnnotator.vue
│   ├── CommentCard.vue
│   ├── CommentModal.vue
│   └── Modals.vue
├── shared/                  ← ポータル側の共用
│   └── NotificationToaster.vue
├── stroke/                  ← 画面1でしか使わないもの
│   └── OverviewForm.vue
└── workspace/               ← ポータル側の下層（プロジェクト作業画面）
    ├── ApprovalCard.vue
    ├── CodeBlock.vue
    ├── DocumentEditor.vue
    ├── DocumentView.vue
    ├── EmptyState.vue
    ├── MermaidDiagram.vue
    ├── RecordList.vue
    └── WorkspacePanel.vue
```

**直下 = 共用、サブディレクトリ = その画面専用**、という区分になっている。ただしそれはどこにも書かれていない。

`stroke/` という名前も紛らわしい。`review/` が「proposal のレビュー」という**役割**の名前なのに対し、`stroke/` は「画面1（ストローク画面）」という**場所**を指している。両者の命名の基準が違う。`shared/` は「共用」という**使われ方**、`workspace/` は「下層の作業画面」という**場所**で、さらに基準が増えている。

`global/` はさらに別の基準で、**Nuxt の仕組みが要求する置き場**（ここに置いたものだけが `app.component()` で登録され、`resolveComponent(名前)` から引ける）。役割でも使われ方でも場所でもない。`MarkdownPre` がここにあるのは `mdc.components.map` が名前で引くからで、`CodeBlock` / `MermaidDiagram` は `MarkdownPre` から import されるだけなので `workspace/` に置いてある。

なお、直下に置かれているのは Nuxt の auto-import 名を裸の `AgentQuestion` にするためでもある（サブディレクトリに置くと `StrokeAgentQuestion` のように接頭辞が付く）。画面1・画面2 の両方から同じ名前で呼ぶのはこの1本だけ。

## 受け渡しの形

18本は **props と emit**（と slot）で閉じている。型は `#shared/stroke`（ストローク側）と `#shared/types`（ポータル側）から取る。素直な形。

**1本だけ違う。**

```ts
// review/Modals.vue
const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>()
```

`Modals.vue` は composable の**戻り値そのもの**を受け取る。39 個のプロパティを持つオブジェクトを丸ごと渡していて、この1本だけ結合の仕方が違う。

`review/` のモーダル一式（本文コメント・全体コメント・削除確認・停止理由・承認確認の5つ）を1箇所にまとめる役をしていて、それぞれへ `review.xxx` を配り直している。切り直しは change `realign-component-composable-boundaries`。**未実施。**

## 共有型への依存

| 型 | 出どころ | 使うコンポーネント |
|---|---|---|
| `Stroke` | `#shared/stroke` | `StrokeBreadcrumb` |
| `Question` / `Answer` | `#shared/stroke` | `AgentQuestion` |
| `Annotation` | `#shared/stroke` | `review/AnnotateSource`、`review/CommentCard` |
| `HighlightColor` | `#shared/stroke` | `review/AnnotateSource`、`review/CommentModal` |
| `NotificationTone` | `#shared/types` | `shared/NotificationToaster` |
| `ApprovalDto` | `#shared/types` | `workspace/ApprovalCard` |

`review/CommentModal.vue` だけ、型以外も import している。

```ts
import { defaultHighlightColor, highlightColors } from '~/composables/useAnnotations'
```

**コンポーネントが composable から値（色の定義5件）を取っている。**

## ライブラリに預けたもの

`replace-handrolled-with-libraries` で、自前の markup / 処理をライブラリに置き換えた。

| 部品 | 預けた先 |
|---|---|
| `workspace/EmptyState.vue` | `UEmpty` + `:ui` の置換関数（`SlotClassReplacer`）。`variant="naked"` |
| `workspace/RecordList.vue` | `UTable`（TanStack Table）。列は `columns`、様式は `:ui` の置換関数と cell slot |
| `shared/NotificationToaster.vue` | `useToast`。**markup を持たない**（`<template>` は空）。描画は `app.vue` の `<UApp :toaster>`。この component は `onNotification` → `toast.add()` の変換役として `app.vue` 直下に残る（`useBoardSocket` の購読を保つため外せない） |
| `workspace/DocumentView.vue` | `<MDC :value>`（`@nuxtjs/mdc`） |
| `workspace/DocumentEditor.vue` | `useEventListener`（beforeunload）/ `useTimeoutFn`（保存チップの3秒）/ `useMounted`（hydration 前の接続状態） |
| `workspace/ApprovalCard.vue` | `Intl.DateTimeFormat`（`ja-JP` / `hourCycle: 'h23'`） |

## 気づいたこと

- **置き場の区分の基準が混ざっている。** 直下は「共用」という**使われ方**、`review/` は「レビュー」という**役割**、`stroke/` は「画面1」という**場所**、`shared/` は「共用」、`workspace/` は「下層の作業画面」、`global/` は「Nuxt が登録する場所」という**仕組みの要求**
- **`Modals.vue` だけ結合の仕方が違う。** 他は props と emit、これだけ composable の戻り値を丸ごと受ける
- **`WaitingIndicator.vue` は 11 行。** props 1つで、`.blink` クラスを当てるだけ
- **画面1の問いと画面2の問い返しの重複は解消済み。** かつては `stroke/QuestionCard.vue`（画面1の問い）と `review/FollowupModal.vue`（画面2の問い返し）が同じ「問いを出して答えを受ける」ことを別々に書いていた。`replace-handrolled-with-libraries` で `AgentQuestion.vue` 1本に統合し、両方がこれを使う。オーバーレイの外殻は持たず、画面1は素置き、画面2は `UModal` の body slot に置く。画面ごとに変わるのは `submitLabel` と `waitingMessage` の2つの文言だけ
- **コンポーネントから composable への import が1件ある**（`CommentModal` → `useAnnotations` の色定義）。依存の向きとしては逆向き
