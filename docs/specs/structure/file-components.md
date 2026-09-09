# components の棚卸し

`app/components/` の現状の実態と、規範（`docs/specs/structure/system-structure.md` の区切り）への対応を書き出したもの。参照元の `pages/…` は現状の置き場で、到達点ではページの実装は `components/page/<PageName>/<PageType>/Container.vue` が持つ（`page-structure.md` / `page-component-structure.md`）。

## 規範への対応 — 全14本

規範の区切りは **`ui/`（機能に属さない共通部品）＋ 機能単位**。棚卸しの14本をこの区切りへ写すと:

| 区切り | 部品（現在の置き場 →） | 根拠 |
| --- | --- | --- |
| `ui/` | `WaitingIndicator`（直下）、`EmptyState` `RecordList` `WorkspacePanel`（workspace/） | どの機能にも属さない見た目の部品。一覧・外枠・待機表示 |
| `notification/` | `NotificationToaster`（shared/） | 通知の受け手 |
| `project/` | `OverviewForm`（stroke/） | 概要入力はプロジェクトを起こす入口 |
| `question/` | `AgentQuestion` `StrokeBreadcrumb`（直下） | 問いの提示・回答と、ストローク履歴の表示。`Question` / `Answer` / `Stroke` 型を扱う |
| `proposal/` | `AnnotateSource` `CommentCard` `CommentModal` `Modals`（review/） | proposal の確認・注釈・差し戻し。`Annotation` / `HighlightColor` 型を扱う |
| `approval/` | `ApprovalCard`（workspace/）、`ApprovalAnnotator`（review/） | 承認1件の表示と、対象文書への指摘・差し戻し |

移動の実施は `docs/specs/plan/structure-migration.md`。**未実施。**

**棚卸しに未追従のものが7本ある**（2026-09-01 時点。`app/components/` の実ファイルは21本）。この資料は markdown のモジュール化で消えた分を落としただけで、これらの区切りへの対応はまだ書いていない。

- `project/CreationNotice.vue` / `project/CreationChoiceModal.vue` — 生成の決着を知らせ、次を選ばせる（`specs/project/generation`）。`pages/projects/index.vue` と `pages/strokes/[sessionId]/proposal.vue` から使う
- `prototype/` の5本（`PrototypeCelebrationA/B/C` / `PrototypeRowStyles` / `PrototypeVariantSwitcher`） — `/prototype` の使い捨て。`pages/prototype/projects.vue` からのみ。規範の区切りへ写す対象ではなく、決まったら消す

### markdown はモジュールへ移った

markdown を描く・直す部品5本が `app/components/` から `modules/markdown/runtime/` へ移った。**モジュールは画面の部品ではない**ので、この棚卸しの対象外になる。全数と切り方は `docs/specs/structure/system-structure.md` §3。

| 消えたもの | 今どこにあるか |
| --- | --- |
| `global/MarkdownPre.vue` | `modules/markdown/runtime/render/MarkdownFence.vue`。global 登録は `modules/markdown/index.ts` の `addComponent({ global: true })` が行う。**`app/components/global/` はもう要らない**（消えた） |
| `workspace/CodeBlock.vue` | `modules/markdown/runtime/render/MarkdownCode.vue` |
| `workspace/MermaidDiagram.vue` | `modules/markdown/runtime/render/MarkdownDiagram.vue`。`v-html` はここにだけ在る（mermaid 自身の出力に限る） |
| `workspace/DocumentView.vue` | `modules/markdown/runtime/render/MarkdownView.vue`（書き直し。`<MDC>` のスロットで位置の対応を出す） |
| `workspace/DocumentEditor.vue` | `modules/markdown/runtime/edit/MarkdownEditor.vue` |

- 使う側は `#markdown/render/MarkdownView.vue` / `#markdown/edit/MarkdownEditor.vue` を明示 import で引く（specs / steering / approvals の3画面、`pages/strokes/[sessionId]/proposal.vue`、`review/ApprovalAnnotator.vue`）
- markdown の parse 設定（`headings.anchorLinks: false` / `rehypePlugins: {'rehype-raw': false}` / `components.prose: false` / `components.map: { pre: 'MarkdownFence' }`）は `modules/markdown/index.ts` にだけ在る。`nuxt.config.ts` には無い
- 検証は `test/modules/markdown/` 配下。何が落ちるかは `sanitize.test.ts`、崩れた前提は `docs/specs/reference/mdc-observations.md`

### アイコンは component ではなくなった

自前の実装をライブラリへ置き換えた際に、次の3本が component の一覧から消えた。

| 消えたもの | 今どこにあるか |
| --- | --- |
| `shared/SbIcon.vue` | `UIcon` + カスタムコレクション `sb:`（`app/assets/icons.ts`、8個。prototype 由来） |
| `shared/UpstreamIcon.vue` | `UIcon` + カスタムコレクション `upstream:`（`app/assets/icons.ts`、本家由来） |
| `workspace/MarkdownNodes.ts` | `@nuxtjs/mdc` の `<MDC :value>`（当時は `workspace/DocumentView.vue`。今は `modules/markdown/runtime/render/MarkdownView.vue`） |

- アイコンのコレクションは `nuxt.config.ts` の `icon.customCollections` に登録し、`mode: 'svg'`（inline SVG）で描く。`UIcon :name="sb:…" / "upstream:…"` を書く場所は `workspace/ApprovalCard.vue`（6箇所）・`shared/NotificationToaster.vue`（3）・`workspace/RecordList.vue`（2）・`workspace/EmptyState.vue`（1）と、pages / layouts の5ファイル。

---

## 一覧

棚卸しの14本の置き場は5層。**直下 / `review/` / `shared/` / `stroke/` / `workspace/`。** `global/` は markdown のモジュール化で消えた。未追従の `project/` `prototype/` は上に書いた。

| ファイル | 行 | 受け取るもの | 返すもの |
|---|---|---|---|
| `AgentQuestion.vue` | 198 | `question: Question \| null` / `waiting` / `waitingMessage` / `answered` / `submitLabel` | `answer: [Answer]` |
| `StrokeBreadcrumb.vue` | 116 | `strokes: Stroke[]` / `current` | — |
| `WaitingIndicator.vue` | 11 | `message: string` | — |
| `review/AnnotateSource.vue` | 248 | `source: string` / `comments: Annotation[]` / `port?: PositionPort \| null`（面の `ref` を素通し）+ default slot（面。`sourceShown: SourceRange[]` を渡す） | `select: [{text,start,end}]` / `clickMark: [id]`。`defineExpose({ reveal })`（一覧→本文） |
| `review/ApprovalAnnotator.vue` | 835 | `source` / `projectId` / `approvalId` / `approvalTitle` / `canRespond` + `#preview` slot | — 。決める操作の行（レビューを閉じる／即時承認／即時却下／修正を依頼）を持ち、その場で決めて一覧へ戻す。面は2つ（プレビュー／注釈）。コメント欄はしまえる（幅固定） |
| `review/CommentCard.vue` | 57 | `comment: Annotation` | `edit: [id]` / `remove: [id]` |
| `review/CommentModal.vue` | 62 | 編集対象ほか + `v-model:open` | `save: [comment, color]` |
| `review/RejectModal.vue` | 66 | `v-model:open` | `submit: [reason]`。即時却下の理由（本家の Reject Approval の写し。空では送れない） |
| `review/Modals.vue` | 94 | **`review: ReturnType<typeof useProposalReview>`** | — |
| `shared/NotificationToaster.vue` | 35 | — | — 。tone → 色クラスと `toast.add()` は `useUpstreamToast` へ抜き出した |
| `stroke/OverviewForm.vue` | 65 | — | `submit: [overview]` |
| `workspace/ApprovalCard.vue` | 197 | `approval: ApprovalDto` / `to` / `projectId` | `responded: []`。却下は `RejectModal`、結果は `useUpstreamToast` |
| `workspace/EmptyState.vue` | 43 | `testid` / `title` / `icon` + 既定 slot | — |
| `workspace/RecordList.vue` | 209 | `items: RecordItem[]` / `testid` / `labels` | — |
| `workspace/WorkspacePanel.vue` | 28 | `title` / `subtitle` / `testid` + `actions` slot | — |
| `workspace/WorkspaceShell.vue` | 182 | 既定 slot | — 。下層の殻（ヘッダー・左のナビ・本文余白）。`layouts/workspace.vue` と `layouts/approval.vue` が共用 |

### 参照元

| 部品 | 使っている場所 |
|---|---|
| `AgentQuestion` | `pages/strokes/[sessionId]/index.vue`（素置き）、`pages/strokes/[sessionId]/proposal.vue`（`UModal` の body slot） |
| `StrokeBreadcrumb` | `pages/strokes/[sessionId]/index.vue`、`pages/strokes/[sessionId]/proposal.vue` |
| `WaitingIndicator` | `pages/strokes/index.vue`、`pages/strokes/[sessionId]/proposal.vue`、`AgentQuestion.vue` |
| `review/*` | `pages/strokes/[sessionId]/proposal.vue`（`CommentModal` だけは `review/Modals.vue` 経由） |
| `review/ApprovalAnnotator` | `pages/projects/[projectId]/approvals/[approvalId].vue`。`AnnotateSource` / `CommentCard` / `CommentModal` / `useAnnotations` をポータル側から使い回す唯一の経路 |
| `shared/NotificationToaster` | `app.vue` 直下 |
| `stroke/OverviewForm` | `pages/strokes/index.vue` |
| `review/RejectModal` | `workspace/ApprovalCard` と `review/ApprovalAnnotator`（一覧のカードと対象文書を読む画面で同じモーダル） |
| `workspace/ApprovalCard` | `pages/projects/[projectId]/approvals/` の2画面 |
| `workspace/WorkspaceShell` | `layouts/workspace.vue` と `layouts/approval.vue`（承認依頼をその場のモーダルとして開く器） |
| `workspace/EmptyState` | `workspace/WorkspaceShell.vue` と下層の5画面。モジュール側（`MarkdownView`）は参照しない — 中身が無いときに出すものは `#empty` slot で呼ぶ側が渡す |
| `workspace/RecordList` | specs / tasks / steering の4画面 |
| `workspace/WorkspacePanel` | 下層の9画面すべて |

## 個別

props と挙動まで書き出してあるのは、ポータル側の5本。残る9本は上の「一覧」の表が持つ。

### shared/NotificationToaster.vue

通知トースト。128行。props なし。**`<template>` は空で、markup を持たない。**

`app.vue` に常設され、`useBoardSocket().onNotification` を購読して `toast.add()` へ変換する役だけを持つ。描画は `app.vue` の `<UApp :toaster>`。**要素を出さないことがこの component の正しい姿。**

`app.vue` 直下から外せない。外すと購読が0になり、`createSharedComposable` が参照カウント式で state ごと接続を捨てる。

| 挙動 | 仕様 |
| --- | --- |
| 位置 | 右上固定・縦積み |
| 消滅 | 5秒で自動、× で手動 |
| 内容 | 1行テキスト |
| 押下 | **何も起きない** |

トーストから対象へ進ませないのは、対象を開く導線を通知一覧に一本化しているため。本家 spec-workflow-mcp と同じ形にしている（`specs/notification-toast`）。

`info` / `success` / `warning` / `error` の4トーンを持ち、それぞれに面の色とグリフを対応させている。

### workspace/ApprovalCard.vue

承認依頼1件のカード。208行。**`workspace/` で唯一 emit を持つ。**

```ts
defineProps<{ approval: ApprovalDto; to: string; projectId: string }>()
defineEmits<{ responded: [] }>()
```

`responded` は承認/却下を送り終えたときに発火する。親が一覧を取り直すために使う。

本家の承認画面は一覧ではなく**カードの縦積み**（`ApprovalsPage.tsx` の `space-y-3 sm:space-y-4` の中に1件1枚）。他の下層画面が表なのに対し、ここだけ形が違う。

却下は理由の入力を伴う。**操作を押しても対象の画面へは飛ばない。**

日時は `Intl.DateTimeFormat`（`ja-JP` / `hourCycle: 'h23'`）に預けてある。

### workspace/EmptyState.vue

中身が無いことを示す。43行。

```ts
withDefaults(
  defineProps<{ testid?: string; title?: string; icon?: 'document' | 'tasks' | 'check-circle' }>(),
  { icon: 'document' }
)
```

説明文は既定スロットで渡す。

形は本家の Empty State（`SteeringPage.tsx` / `SpecsPage.tsx`）に合わせる。中央寄せの `py-12` に 48px のアイコン、見出し、説明の順。無彩色にするのは `ui.md` の Visual Language による。

`layouts/workspace.vue` からも使われる唯一の `workspace/` コンポーネント。本家から解決できないプロジェクトを「未接続」として示すのに使う。

中身は `UEmpty` + `:ui` の置換関数（`SlotClassReplacer`）に預けてある（`variant="naked"`）。

### workspace/RecordList.vue

下層の一覧。209行。**各行はリンクで、URL で対象を指せる。**

```ts
export type RecordTone = 'success' | 'pending' | 'info' | 'in-progress' | 'warning' | 'error';

export interface RecordItem {
  key: string;                  // 一覧内で一意
  label: string;
  detail?: string;              // 行の下段に出す補足
  icon?: 'document' | 'steering' | 'tasks' | 'check-circle';
  badge?: { text: string; tone: RecordTone };
  progress?: { completed: number; total: number };   // badge と併用しない
  meta?: string;                // 3列目。最終更新など
  to?: string;                  // 無ければ選べない行になる
}
```

`labels`（列見出し）を呼び出し側から渡すのは、本家が画面ごとに文言を変えているため。

`to` を省くと選べない行になる。**未作成の文書にリンクを張らない**のはこの仕組みによる。

行全体がリンクになっている（`1ea2bec fix: 一覧の行全体を押せるようにする`）。

**設計の背景** — 本家のダッシュボードは `projectId` を localStorage に持ち URL に出さないため、「どのプロジェクトの何」を指すリンクが作れない。stroke-board はそれを繰り返さない。

中身は `UTable`（TanStack Table）に預けてある。列は `columns`、様式は `:ui` の置換関数と cell slot。

### workspace/WorkspacePanel.vue

下層の画面の外枠。28行。**下層で最も使われるコンポーネント**（9画面すべて）。

```ts
defineProps<{ title: string; subtitle?: string; testid?: string }>()
```

スロットは2つ — 既定スロット（中身）と `actions`（見出しの右）。

本家は下層の各画面を1枚のパネルに載せ、その中に見出しと副題を置いてから中身を出す（`SteeringPage.tsx` / `SpecsPage.tsx` の `Content`）。画面ごとに枠を書くと寸法がずれるため、ここに集約している。

`actions` スロットは本家が検索や並び替えを置く位置だが、**stroke-board は読むだけなので通常は空**。

---

## 置き場の区分

現状の5層は、**基準が揃っていない。**

```
app/components/
├── AgentQuestion.vue        ← 直下。両方の画面で使う
├── StrokeBreadcrumb.vue     ← 直下。両方の画面で使う
├── WaitingIndicator.vue     ← 直下。両方の画面で使う
├── review/                  ← 「レビュー」という役割。画面2 と承認画面の両方で使う
│   ├── AnnotateSource.vue
│   ├── ApprovalAnnotator.vue
│   ├── CommentCard.vue
│   ├── CommentModal.vue
│   ├── Modals.vue
│   └── RejectModal.vue
├── shared/                  ← ポータル側の共用
│   └── NotificationToaster.vue
├── stroke/                  ← 画面1でしか使わないもの
│   └── OverviewForm.vue
└── workspace/               ← ポータル側の下層（プロジェクト作業画面）
    ├── ApprovalCard.vue
    ├── EmptyState.vue
    ├── RecordList.vue
    ├── WorkspacePanel.vue
    └── WorkspaceShell.vue
```

（未追従の `project/` と `prototype/` はこの図に含めていない。）

**直下 = 共用、サブディレクトリ = その画面専用**、という区分になっている。ただしそれはどこにも書かれていない。

`stroke/` という名前も紛らわしい。`review/` が「proposal のレビュー」という**役割**の名前なのに対し、`stroke/` は「画面1（ストローク画面）」という**場所**を指している。両者の命名の基準が違う。`shared/` は「共用」という**使われ方**、`workspace/` は「下層の作業画面」という**場所**で、さらに基準が増えている。

かつては `global/` という**Nuxt の仕組みが要求する置き場**（ここに置いたものだけが `app.component()` で登録され、`resolveComponent(名前)` から引ける）がもう1つの基準としてあった。`MarkdownPre` がそこに居たのは `mdc.components.map` が名前で引くからだったが、モジュール側の `addComponent({ global: true })` が同じ登録を行うため、この置き場は要らなくなり消えた。

なお、直下に置かれているのは Nuxt の auto-import 名を裸の `AgentQuestion` にするためでもある（サブディレクトリに置くと `StrokeAgentQuestion` のように接頭辞が付く）。画面1・画面2 の両方から同じ名前で呼ぶのはこの1本だけ。

## 受け渡しの形

15本は **props と emit**（と slot）で閉じている。型は `#shared/stroke`（ストローク側）と `#shared/types`（ポータル側）から取る。素直な形。

**1本だけ違う。**

```ts
// review/Modals.vue
const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>()
```

`Modals.vue` は composable の**戻り値そのもの**を受け取る。39 個のプロパティを持つオブジェクトを丸ごと渡していて、この1本だけ結合の仕方が違う。

`review/` のモーダル一式（本文コメント・全体コメント・削除確認・停止理由・承認確認の5つ）を1箇所にまとめる役をしていて、それぞれへ `review.xxx` を配り直している。切り直しは**未実施。**

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

自前の markup / 処理をライブラリに置き換えた。

| 部品 | 預けた先 |
|---|---|
| `workspace/EmptyState.vue` | `UEmpty` + `:ui` の置換関数（`SlotClassReplacer`）。`variant="naked"` |
| `workspace/RecordList.vue` | `UTable`（TanStack Table）。列は `columns`、様式は `:ui` の置換関数と cell slot |
| `shared/NotificationToaster.vue` | `useToast`。**markup を持たない**（`<template>` は空）。描画は `app.vue` の `<UApp :toaster>`。この component は `onNotification` → `toast.add()` の変換役として `app.vue` 直下に残る（`useBoardSocket` の購読を保つため外せない） |
| `workspace/ApprovalCard.vue` | `Intl.DateTimeFormat`（`ja-JP` / `hourCycle: 'h23'`） |

`DocumentView`（`<MDC :value>`）と `DocumentEditor`（`useEventListener` / `useTimeoutFn` / `useMounted`）もここに載っていたが、モジュールへ移った（上の「markdown はモジュールへ移った」）。

## 気づいたこと

- **置き場の区分の基準が混ざっている。** 直下は「共用」という**使われ方**、`review/` は「レビュー」という**役割**、`stroke/` は「画面1」という**場所**、`shared/` は「共用」、`workspace/` は「下層の作業画面」。「Nuxt が登録する場所」という**仕組みの要求**（`global/`）は、markdown のモジュール化で消えた
- **`Modals.vue` だけ結合の仕方が違う。** 他は props と emit、これだけ composable の戻り値を丸ごと受ける
- **`WaitingIndicator.vue` は 11 行。** props 1つで、`.sb-stroke-blink` クラスを当てるだけ
- **画面1の問いと画面2の問い返しの重複は解消済み。** かつては `stroke/QuestionCard.vue`（画面1の問い）と `review/FollowupModal.vue`（画面2の問い返し）が同じ「問いを出して答えを受ける」ことを別々に書いていた。`AgentQuestion.vue` 1本に統合し、両方がこれを使う。オーバーレイの外殻は持たず、画面1は素置き、画面2は `UModal` の body slot に置く。画面ごとに変わるのは `submitLabel` と `waitingMessage` の2つの文言だけ
- **コンポーネントから composable への import が1件ある**（`CommentModal` → `useAnnotations` の色定義）。依存の向きとしては逆向き
