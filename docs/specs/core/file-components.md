# components の棚卸し

`app/components/` の現状の実態と、規範（`docs/specs/core/system-structure.md` の区切り）への対応を書き出したもの。

- 層の積み方と全体の構造は `docs/specs/core/system-structure.md`
- 置き場所の規約は `docs/specs/core/system-structure.md` §2
- ストローク側のモジュール（`AgentQuestion` / `useAgentQuestion`）の使い方は `docs/specs/reference/stroke-modules.md`
- 記述は実装から抽出した事実に限る。行数は実測（2026-08-28）

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

移動は**未実施**。差分の記録は `docs/specs/plan/structure-migration.md` が持つ。

### アイコンは component ではない

`replace-handrolled-with-libraries` で、アイコンは component の一覧から外れた。

| かつての component | 今どこにあるか |
| --- | --- |
| `shared/SbIcon.vue` | `UIcon` + カスタムコレクション `sb:`（`app/assets/icons.ts`、8個。prototype 由来） |
| `shared/UpstreamIcon.vue` | `UIcon` + カスタムコレクション `upstream:`（`app/assets/icons.ts`、本家由来） |

コレクションは `nuxt.config.ts` の `icon.customCollections` に登録し、`mode: 'svg'`（inline SVG）で描く。パスが DOM に出るので、prototype / 本家と絵が同じであることをテストで突き合わせられる。

`UIcon :name="sb:…" / "upstream:…"` を書く場所は `workspace/ApprovalCard.vue`（6箇所）・`shared/NotificationToaster.vue`（3）・`workspace/RecordList.vue`（2）・`workspace/EmptyState.vue`（1）と、pages / layouts の5ファイル。

**出どころ2系統（prototype 由来 / 本家由来）の区別はコレクション名で保つ。** 混ぜると、どちらの出どころに合わせているのかが後から分からなくなる。パスの実体と `SbIconName` / `UpstreamIconName` の型は `app/assets/icons.ts` にある。**アイコンセットの選定は未決なので、勝手に別のものを選ばない。**

### markdown は MDC が描き、フェンスの後段に3本ある

本文の描画は `@nuxtjs/mdc` の `<MDC :value>` に預けてある（`workspace/DocumentView.vue`）。AST を Vue のノードへ落とす自前の仕組みは持たない。

parse 設定は `nuxt.config.ts` の `mdc`（`headings.anchorLinks: false` / `rehypePlugins: {'rehype-raw': false}` / `components.prose: false` / `components.map: { pre: 'MarkdownPre' }`）。生 HTML は要素にならないので、**描く側は自前のサニタイズを持たない**。検証は `test/app/components/workspace/` の `markdown-roundtrip.test.ts` と `markdown-sanitize.test.ts`。

`pre` の受け口だけ自前に差し替えてある（`replace-handrolled-with-libraries` の design 決定6・2026-08-25 改訂）。

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
| `StrokeBreadcrumb.vue` | 116 | `strokes: Stroke[]` / `current` | — |
| `WaitingIndicator.vue` | 11 | `message: string` | — |
| `global/MarkdownPre.vue` | 37 | **props を宣言しない**（`$attrs` で `language` / `code` ほかを受ける） | — |
| `review/AnnotateSource.vue` | 140 | `source: string` / `comments: Annotation[]` | `select: [{text,start,end}]` / `clickMark: [id]` |
| `review/ApprovalAnnotator.vue` | 430 | `source` / `projectId` / `approvalId` / `canRespond` + `#preview` slot | — |
| `review/CommentCard.vue` | 57 | `comment: Annotation` | `edit: [id]` / `remove: [id]` |
| `review/CommentModal.vue` | 62 | 編集対象ほか + `v-model:open` | `save: [comment, color]` |
| `review/Modals.vue` | 94 | **`review: ReturnType<typeof useProposalReview>`** | — |
| `shared/NotificationToaster.vue` | 128 | — | — |
| `stroke/OverviewForm.vue` | 65 | — | `submit: [overview]` |
| `workspace/ApprovalCard.vue` | 214 | `approval: ApprovalDto` / `to` / `projectId` | `responded: []` |
| `workspace/CodeBlock.vue` | 89 | `$attrs`（shiki のクラス・`code`・`language`）+ 既定 slot | — |
| `workspace/DocumentEditor.vue` | 266 | `content` / `save` / `canSave` / `editOnOpen` / `testid` | — |
| `workspace/DocumentView.vue` | 48 | `content` / `missing` | — |
| `workspace/EmptyState.vue` | 43 | `testid` / `title` / `icon` + 既定 slot | — |
| `workspace/MermaidDiagram.vue` | 116 | `code: string` | — |
| `workspace/RecordList.vue` | 223 | `items: RecordItem[]` / `testid` / `labels` | — |
| `workspace/WorkspacePanel.vue` | 28 | `title` / `subtitle` / `testid` + `actions` slot | — |

最大は `review/ApprovalAnnotator.vue`（430行）、最小は `WaitingIndicator.vue`（11行）。

単体テストはソースと同居させない。markdown の2本を検証するテストは `test/app/components/workspace/` にある。

### 参照元

| 部品 | 使っている場所 |
|---|---|
| `AgentQuestion` | `pages/strokes/[sessionId]/index.vue`（素置き）、`pages/strokes/[sessionId]/proposal.vue`（`UModal` の body slot） |
| `StrokeBreadcrumb` | `pages/strokes/[sessionId]/index.vue`、`pages/strokes/[sessionId]/proposal.vue` |
| `WaitingIndicator` | `pages/strokes/index.vue`、`pages/strokes/[sessionId]/proposal.vue`、`AgentQuestion.vue` |
| `global/MarkdownPre` | `nuxt.config.ts` の `mdc.components.map` から**名前で**引かれる（import される場所は無い） |
| `review/*` | `pages/strokes/[sessionId]/proposal.vue`（`CommentModal` だけは `review/Modals.vue` 経由） |
| `review/ApprovalAnnotator` | `pages/projects/[projectId]/approvals/[approvalId].vue`。`AnnotateSource` / `CommentCard` / `CommentModal` / `useAnnotations` をポータル側から使い回す唯一の経路 |
| `shared/NotificationToaster` | `app.vue` 直下 |
| `stroke/OverviewForm` | `pages/strokes/index.vue` |
| `workspace/ApprovalCard` | `pages/projects/[projectId]/approvals/` の2画面 |
| `workspace/CodeBlock` / `workspace/MermaidDiagram` | `global/MarkdownPre.vue` からのみ |
| `workspace/DocumentEditor` | steering / specs / approvals の3画面 |
| `workspace/DocumentView` | `pages/projects/[projectId]/approvals/[approvalId].vue`、`DocumentEditor.vue` |
| `workspace/EmptyState` | `layouts/workspace.vue` と下層の5画面、`DocumentView.vue` |
| `workspace/RecordList` | specs / tasks / steering の4画面 |
| `workspace/WorkspacePanel` | 下層の9画面すべて |

### 参照関係

```
app.vue
 └── shared/NotificationToaster        （markup を持たない。購読を保つためだけに常駐）

layouts/workspace.vue ── workspace/EmptyState

下層ページ ┬ workspace/WorkspacePanel   (9)
           ├ workspace/RecordList       (4)
           ├ workspace/DocumentEditor   (3)   ← steering / specs / approvals
           ├ workspace/DocumentView     (1)   ← 承認画面が直接使う
           ├ workspace/ApprovalCard     (2)
           └ workspace/EmptyState       (6)
                       │
              DocumentEditor ── workspace/DocumentView（読みのとき）
                                 ├── workspace/EmptyState
                                 └── MDC ── global/MarkdownPre ┬ workspace/MermaidDiagram
                                                               └ workspace/CodeBlock

ストローク側の画面 ┬ AgentQuestion ── WaitingIndicator
                   ├ StrokeBreadcrumb
                   ├ stroke/OverviewForm
                   └ review/*        （Modals が5つのモーダルを束ねる）

承認画面 ── review/ApprovalAnnotator ┬ review/AnnotateSource
                                     ├ review/CommentCard
                                     └ review/CommentModal
```

アイコンは component ではないため、この図に現れない。

---

## 個別

props と挙動まで書き出してあるのは、ポータル側の7本。残る12本は上の「一覧」の表が持つ。

### shared/NotificationToaster.vue

通知トースト。128行。props なし。**`<template>` は空で、markup を持たない。**

`app.vue` に常設され、`useBoardSocket().onNotification` を購読して `toast.add()` へ変換する役だけを持つ。描画は `app.vue` の `<UApp :toaster>`。**要素を出さないことがこの component の正しい姿**（`replace-handrolled-with-libraries` の design 決定1）。

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

承認依頼1件のカード。214行。**`workspace/` で唯一 emit を持つ。**

```ts
defineProps<{ approval: ApprovalDto; to: string; projectId: string }>()
defineEmits<{ responded: [] }>()
```

`responded` は承認/却下を送り終えたときに発火する。親が一覧を取り直すために使う。

本家の承認画面は一覧ではなく**カードの縦積み**（`ApprovalsPage.tsx` の `space-y-3 sm:space-y-4` の中に1件1枚）。他の下層画面が表なのに対し、ここだけ形が違う。

却下は理由の入力を伴う。**操作を押しても対象の画面へは飛ばない。**

日時は `Intl.DateTimeFormat`（`ja-JP` / `hourCycle: 'h23'`）に預けてある。

### workspace/DocumentEditor.vue

文書を直して保存する。266行。**`workspace/` で最大。** 仕様書・ステアリング・承認対象の本文がこれを使う。

```ts
defineProps<{
  content: string | null | undefined;         // 保存されている内容。null は未作成
  save: (content: string) => Promise<string | null>;  // 失敗の理由を返す。成功なら null
  canSave?: boolean;                          // 本家に繋がっていないと保存できない
  editOnOpen?: boolean;                       // 開いた時点で編集に入る
  testid?: string;
}>()
```

読みと編集の2モードを持ち、**既定では開いた時点は読み**。編集を押すと markdown の生テキストが `textarea` に出る。読みのときは内部で `DocumentView` を使う。

`editOnOpen` は承認の対象文書のために立てる。承認から来た人は読んで直すために来ており、もう一手を挟ませない。

扱うのは markdown のテキストそのもので、**読み込みと保存のあいだで変換を挟まない**。開いて保存しただけで内容が変わることが構造的に起こらない。

| 状態 | 出るもの |
| --- | --- |
| 保存中 | 「保存中…」。二重送信を受け付けない |
| 保存後 | 「保存しました」。3秒で消える |
| 未保存の変更あり | 「未保存」 |
| 保存の失敗 | 理由の文言。**直しかけは捨てない** |
| 本家に未接続 | 保存できない旨 |

**変更の有無は保存されている内容との比較で決める。** 編集操作をしたかどうかではないので、直して元に戻せば「変更なし」に戻る。

離脱の引き止めは2系統。画面内の遷移は `onBeforeRouteLeave`、再読み込みとタブを閉じる操作は `beforeunload`（`useEventListener`）。保存チップの3秒は `useTimeoutFn`、hydration 前の接続状態は `useMounted` に預けてある。

WYSIWYG を採らなかった理由は `markdown-roundtrip.test.ts` に残してある（TipTap は表が1行に潰れる）。

### workspace/DocumentView.vue

文書の本文を出す。48行。仕様書・ステアリング・承認対象の**いずれもこれを使う**。

```ts
withDefaults(
  defineProps<{ content: string | null | undefined; missing?: string }>(),
  { missing: 'この文書はまだ作られていません。' }
)
```

読むだけ。**編集も承認も置かない**（`specs/project-workspace`）。

`content` が空なら `missing` の文言を `EmptyState` で出す。

**本文の型は Tailwind Typography（`prose`）が持つ。** class 列は本家 `MDXEditorWrapper.tsx` の `contentEditableClassName` を1文字も変えずに写したもの。本家の `theme.css` にある `.markdown-content` は本家のどの `.tsx` からも名乗られていない使われていない CSS で、そちらを写して起きたずれ（h1 が 36px ではなく 16px になっていた等）を繰り返さない。

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

下層の一覧。223行。**各行はリンクで、URL で対象を指せる。**

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

**`portal/` は無い。** 上層はページを2つ持つのみで、専用のコンポーネントを1つも持たない。欠落ではなく、上層が薄いという実態の反映である。上層専用の部品が初めて生まれたとき、そのとき初めて作る。

## 受け渡しの形

18本は **props と emit**（と slot）で閉じている。型は `#shared/stroke`（ストローク側）と `#shared/types`（ポータル側）から取る。素直な形。emit を持つのは6本 — `AgentQuestion`、`review/AnnotateSource`、`review/CommentCard`、`review/CommentModal`、`stroke/OverviewForm`、`workspace/ApprovalCard`。

**1本だけ違う。**

```ts
// review/Modals.vue
const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>()
```

`Modals.vue` は composable の**戻り値そのもの**を受け取る。39 個のプロパティを持つオブジェクトを丸ごと渡していて、この1本だけ結合の仕方が違う。

`review/` のモーダル一式（本文コメント・全体コメント・削除確認・停止理由・承認確認の5つ）を1箇所にまとめる役をしていて、それぞれへ `review.xxx` を配り直している。切り直しは change `realign-component-composable-boundaries`。**未実施。**

**編集できる画面とできない画面が、使うコンポーネントで分かれている。** 仕様書・ステアリング・承認対象の本文は `DocumentEditor`、読むだけの本文は `DocumentView` を直接。読み取り専用のものにモードを足すと「編集できるが編集させない」状態を持つことになるため、境界をコンポーネントで分けてある。

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
| `shared/NotificationToaster.vue` | `useToast`。**markup を持たない**（`<template>` は空）。描画は `app.vue` の `<UApp :toaster>` |
| `workspace/DocumentView.vue` | `<MDC :value>`（`@nuxtjs/mdc`） |
| `workspace/DocumentEditor.vue` | `useEventListener`（beforeunload）/ `useTimeoutFn`（保存チップの3秒）/ `useMounted`（hydration 前の接続状態） |
| `workspace/ApprovalCard.vue` | `Intl.DateTimeFormat`（`ja-JP` / `hourCycle: 'h23'`） |

## 気づいたこと

- **置き場の区分の基準が混ざっている。** 直下は「共用」という**使われ方**、`review/` は「レビュー」という**役割**、`stroke/` は「画面1」という**場所**、`shared/` は「共用」、`workspace/` は「下層の作業画面」、`global/` は「Nuxt が登録する場所」という**仕組みの要求**
- **`Modals.vue` だけ結合の仕方が違う。** 他は props と emit、これだけ composable の戻り値を丸ごと受ける
- **`WaitingIndicator.vue` は 11 行。** props 1つで、`.blink` クラスを当てるだけ
- **画面1の問いと画面2の問い返しの重複は解消済み。** かつては `stroke/QuestionCard.vue`（画面1の問い）と `review/FollowupModal.vue`（画面2の問い返し）が同じ「問いを出して答えを受ける」ことを別々に書いていた。`replace-handrolled-with-libraries` で `AgentQuestion.vue` 1本に統合し、両方がこれを使う。オーバーレイの外殻は持たず、画面1は素置き、画面2は `UModal` の body slot に置く。画面ごとに変わるのは `submitLabel` と `waitingMessage` の2つの文言だけ
- **コンポーネントから composable への import が1件ある**（`CommentModal` → `useAnnotations` の色定義）。依存の向きとしては逆向き
- **個別の記述が7本にしか無い。** ストローク側12本は表の1行しか持たず、props の意味も挙動の規定もこの文書から読めない
