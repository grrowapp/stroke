# コンポーネント一覧

`app/components/` にある10のコンポーネントのリファレンス。

- 置き場所の規約は `openspec/changes/restructure-app-directories/specs/app-structure/spec.md`
- 層の積み方と全体の構造は `docs/structure-design.md`
- 記述は実装から抽出した事実に限る

配置は**実際の参照範囲**で決まる。複数の階層から使われるものが `shared/`、下層からしか使われないものが `workspace/`。

---

## shared/ — 階層をまたぐ

### SbIcon.vue

prototype 由来のアイコン。47行。

```ts
withDefaults(defineProps<{ name: SbIconName; size?: number }>(), { size: 16 })
```

| props | 型 | 既定 |
| --- | --- | --- |
| `name` | `SbIconName` | 必須 |
| `size` | `number` | `16` |

`name` に取れる値は8つ — `bell` / `folder` / `plus` / `link` / `back` / `down` / `grid` / `x`

パスと描画属性を prototype（archive の `steering-dashboard-portal/prototype/navigation.prototype.html`）からそのまま持ち込んでいる。**アイコンセットの選定は未決なので、勝手に別のものを選ばない。**

**参照元**（4）— `layouts/portal.vue`、`layouts/workspace.vue`、`pages/index.vue`、`pages/projects/index.vue`

上層とレイアウトからしか使われていないが、両方の階層のシェルが使うため `shared/` にある。

### UpstreamIcon.vue

本家 spec-workflow-mcp 由来のアイコン。78行。

```ts
defineProps<{ name: UpstreamIconName }>()
```

`name` に取れる値は7つ — `document` / `steering` / `tasks` / `clock` / `calendar` / `eye` / `close`

パスを本家のソースからそのまま持ち込んでいる。`SbIcon` と**分けてあるのは意図的**で、prototype 由来と本家由来を混ぜると、どちらの出どころに合わせているのかが後から分からなくなるため。

**参照元**（5）— `components/workspace/EmptyState.vue`、`components/workspace/RecordList.vue`、`components/workspace/ApprovalCard.vue`、`components/shared/NotificationToaster.vue`、`pages/projects/[projectId]/index.vue`

### NotificationToaster.vue

通知トースト。124行。props なし。

`app.vue` に常設され、`useBoardSocket().onNotification` を購読して発火する。

| 挙動 | 仕様 |
| --- | --- |
| 位置 | 右上固定・縦積み |
| 消滅 | 5秒で自動、× で手動 |
| 内容 | 1行テキスト |
| 押下 | **何も起きない** |

トーストから対象へ進ませないのは、対象を開く導線を通知一覧に一本化しているため。本家 spec-workflow-mcp と同じ形にしている（`specs/notification-toast`）。

`info` / `success` / `warning` / `error` の4トーンを持ち、それぞれに面の色とグリフを対応させている。

**参照元**（1）— `app.vue`

---

## workspace/ — 下層専用

7つすべて、下層のページと `layouts/workspace.vue` からしか参照されていない。

### WorkspacePanel.vue

下層の画面の外枠。28行。**下層で最も使われるコンポーネント**。

```ts
defineProps<{ title: string; subtitle?: string; testid?: string }>()
```

スロットは2つ — 既定スロット（中身）と `actions`（見出しの右）。

本家は下層の各画面を1枚のパネルに載せ、その中に見出しと副題を置いてから中身を出す（`SteeringPage.tsx` / `SpecsPage.tsx` の `Content`）。画面ごとに枠を書くと寸法がずれるため、ここに集約している。

`actions` スロットは本家が検索や並び替えを置く位置だが、**stroke-board は読むだけなので通常は空**。

**参照元**（9）— 下層の全ページ（`[document].vue` を除く9ページ）

### RecordList.vue

下層の一覧。155行。**各行はリンクで、URL で対象を指せる。**

```ts
withDefaults(defineProps<{
  items: RecordItem[];
  testid?: string;
  labels?: { name: string; status: string; meta: string };
}>(), ...)
```

型を2つ export している。

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

**参照元**（4）— `specs/index.vue`、`specs/[specName]/index.vue`、`steering/index.vue`、`tasks/index.vue`

### DocumentEditor.vue

文書を直して保存する。仕様書とステアリングの本文がこれを使う。

```ts
defineProps<{
  content: string | null | undefined;         // 保存されている内容。null は未作成
  save: (content: string) => Promise<string | null>;  // 失敗の理由を返す。成功なら null
  canSave?: boolean;                          // 本家に繋がっていないと保存できない
  testid?: string;
}>()
```

読みと編集の2モードを持ち、**開いた時点では読み**。編集を押すと markdown の生テキストが `textarea` に出る。読みのときは内部で `DocumentView` を使う。

扱うのは markdown のテキストそのもので、**読み込みと保存のあいだで変換を挟まない**。開いて保存しただけで内容が変わることが構造的に起こらない。

| 状態 | 出るもの |
| --- | --- |
| 保存中 | 「保存中…」。二重送信を受け付けない |
| 保存後 | 「保存しました」。3秒で消える |
| 未保存の変更あり | 「未保存」 |
| 保存の失敗 | 理由の文言。**直しかけは捨てない** |
| 本家に未接続 | 保存できない旨 |

**変更の有無は保存されている内容との比較で決める。** 編集操作をしたかどうかではないので、直して元に戻せば「変更なし」に戻る。

離脱の引き止めは2系統。画面内の遷移は `onBeforeRouteLeave`、再読み込みとタブを閉じる操作は `beforeunload`。

**承認画面はこれを使いません。** 承認対象の本文は読むだけなので `DocumentView` を直接使います。読み取り専用のものにモードを足すと「編集できるが編集させない」状態を持つことになるため、境界をコンポーネントで分けています。

WYSIWYG を採らなかった理由は `markdown-roundtrip.test.ts` に残してあります（TipTap は表が1行に潰れる）。

**参照元**（2）— `specs/[specName]/[document].vue`、`steering/[name].vue`

### DocumentView.vue

文書の本文を出す。40行。仕様書・ステアリング・承認対象の**いずれもこれを使う**。

```ts
withDefaults(
  defineProps<{ content: string | null | undefined; missing?: string }>(),
  { missing: 'この文書はまだ作られていません。' }
)
```

読むだけ。**編集も承認も置かない**（`specs/project-workspace`）。

`content` が空なら `missing` の文言を `EmptyState` で出す。

markdown は md4x で描く。md4x は WASM を読み込むまで描けないため `await init()` してから描画する。SSR でも本文を出す（画面を開いた時点で読める）ためで、Nuxt のページは Suspense の下にあるので `await` できる。

**参照元**（2）— `components/workspace/DocumentEditor.vue`（読みのとき）、`approvals/[approvalId].vue`

### ApprovalCard.vue

承認依頼1件のカード。197行。**下層で最大のコンポーネント**で、唯一 emit を持つ。

```ts
defineProps<{ approval: ApprovalDto; to: string; projectId: string }>()
defineEmits<{ responded: [] }>()
```

`responded` は承認/却下を送り終えたときに発火する。親が一覧を取り直すために使う。

本家の承認画面は一覧ではなく**カードの縦積み**（`ApprovalsPage.tsx` の `space-y-3 sm:space-y-4` の中に1件1枚）。他の下層画面が表なのに対し、ここだけ形が違う。

却下は理由の入力を伴う。**操作を押しても対象の画面へは飛ばない。**

**参照元**（1）— `approvals/index.vue`

### EmptyState.vue

中身が無いことを示す。28行。

```ts
withDefaults(
  defineProps<{ testid?: string; title?: string; icon?: 'document' | 'tasks' | 'check-circle' }>(),
  { icon: 'document' }
)
```

説明文は既定スロットで渡す。

形は本家の Empty State（`SteeringPage.tsx` / `SpecsPage.tsx`）に合わせる。中央寄せの `py-12` に 48px のアイコン、見出し、説明の順。無彩色にするのは `ui.md` の Visual Language による。

**参照元**（7）— 下層6ページ、`components/workspace/DocumentView.vue`、`layouts/workspace.vue`

`layouts/workspace.vue` からも使われる唯一の `workspace/` コンポーネント。本家から解決できないプロジェクトを「未接続」として示すのに使う。

### MarkdownNodes.ts

md4x の AST を Vue のノードに落とす。**唯一 `.vue` でないファイル**で、`defineComponent` を default export する。

md4x の `parseAST` は `{ nodes: [...] }` を返し、要素は `[tag, props, ...children]`、テキストは素の文字列で入る（`md4x/lib/types.d.mts` の `ComarkElement` / `ComarkText`）。

**参照元**（1）— `components/workspace/DocumentView.vue` のみ。事実上 `DocumentView` の内部実装。

---

## portal/ は存在しない

上層はページを2つ持つのみで、専用のコンポーネントを1つも持たない。**欠落ではなく、上層が薄いという実態の反映**である。

上層専用の部品が初めて生まれたとき、そのとき初めて `app/components/portal/` を作る。

---

## 参照関係

```
app.vue
 └── shared/NotificationToaster ──┐
                                   │
layouts/portal.vue ── shared/SbIcon│
layouts/workspace.vue ┬ shared/SbIcon
                      └ workspace/EmptyState
                                   │
下層ページ ┬ workspace/WorkspacePanel   (9)
           ├ workspace/RecordList       (4) ─┐
           ├ workspace/DocumentEditor    (2)  │
           ├ workspace/DocumentView      (1) ─┤   ← 承認画面だけが直接使う
           ├ workspace/ApprovalCard      (1) ─┼── shared/UpstreamIcon
           └ workspace/EmptyState        (6) ─┘
                       │
              DocumentEditor ── workspace/DocumentView（読みのとき）
                                 └── workspace/MarkdownNodes
                                 └── workspace/EmptyState
```

**編集できる画面とできない画面が、使うコンポーネントで分かれています。** 仕様書とステアリングの本文は `DocumentEditor`、承認対象の本文は `DocumentView` を直接。承認画面が編集の口を持たないことは、import の一覧で確かめられます。

`shared/UpstreamIcon` は下層のコンポーネント3つとトーストから使われ、`shared/SbIcon` は両レイアウトと上層ページから使われる。どちらも単一の階層に閉じていないため `shared/` にある。
