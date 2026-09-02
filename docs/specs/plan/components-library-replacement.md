# components ライブラリ代替可否

`app/components/` の現状の実態と、ライブラリ置換の軸への対応。

軸は **@nuxt/ui (4.10.0) / vueuse (@vueuse/core 14.4.0) / Nuxt 標準機能で代替できるものは置き換える**。

- 棚卸しの本体は `docs/specs/core/file-components.md`（ストローク側）と `docs/specs/core/file-component.md`（ポータル側）。ここは置換の可否だけを扱う
- 別軸（component と composable をまたぐ切り直し `realign-component-composable-boundaries`・置き場の再編 `reorganize-components`）はこの評価に持ち込まない
- 記述は実装と node_modules の実物（型定義・dist ソース）から抽出した事実に限る

## 判定の方針

- **最優先は「本家に近づける」**。本家 spec-workflow-mcp の見た目・挙動の再現をすべての判定に優先させる。置換・削除・再編は本家再現を損なわない場合のみ成立し、条件の検証基準は「現行と同一」ではなく**「本家と同一」**
- **判定は技術的な置換可否で下す。** ADR・specs・コード内コメントの制約記述は据置の理由にしない（本家再現は「制約記述」ではなく最優先要件として扱う）
- 技術的に置換可能で制約と衝突するものは「**置換可（条件付き）**」とし、条件＝検証タスク（theming で現行の見た目・挙動を同一に保てるか）に変換する。検証で満たせないと分かったとき初めて採らない。spec の改定が要る場合は approval を通す（採否はユーザー判断）
- 据置の理由に使ってよいのは技術判断のみ: **置換で消える自前実装が無い**、または**軸のライブラリに相当機能が無い**
- **自前実装は禁止**。ライブラリ（またはその関数）で実現できるものを自前で書かない・残さない。安全策（サニタイズ等）も実績あるライブラリに任せる
- ここでの「置換」は component の廃止ではなく、内部の自前機構をライブラリ部品で組み直すこと。公開インターフェースと参照元は変えない

対象は 19本（.vue 18 + .ts 1。テスト1本は対象外）。結論は**置換可（条件付き）5・部分置換 3・再編 2→1・削除 1・据置 8**。

実装後の本数は **19本**。内訳は、評価対象19本から `SbIcon` / `UpstreamIcon` / `MarkdownNodes.ts` の3本が消え、再編で1本減って **15本**。そこへ範囲を広げて入った4本（後段3 + 承認注釈1）が加わる。棚卸しは `docs/specs/core/file-components.md`。

> **実装後の追記（change `replace-handrolled-with-libraries`）**
>
> 上記をすべて実装した。**条件付き5本は全件が条件を満たし、据置に戻したものは無い**（最も再現コストが高いと見ていた `RecordList` も含む）。
> 以下の「実装結果」「実装で判明」は、この資料が条件・未確定として残した点の検証結果と、prototype 検証では見えていなかった落とし穴である。判定（置換・部分置換・再編・削除・据置）は変えていない。

## 残るもの — 据置8本（技術判断のみ）

| component | 据置の理由（技術） |
| --- | --- |
| `workspace/WorkspacePanel` | 見出し+slot の markup のみ。UCard に載せても markup は残り、消える自前実装が無い |
| `review/CommentCard` | 同上。中身は注釈ドメインの表示で、外枠だけ UCard 化しても得るものが無い |
| `StrokeBreadcrumb` | 本体は粒開き（toggle + 往復全文パネル）。`UBreadcrumb` はリンク列のモデルで、nav 行だけ載せ替えても自前実装は消えない |
| `review/AnnotateSource` | Selection API の一回読取 + オフセット変換。vueuse `useTextSelection` はリアクティブ追跡で用途が異なり、代替できるライブラリが無い |
| `WaitingIndicator` | 置換対象の機構が無い |
| `review/CommentModal` | **@nuxt/ui 採用済み**（UModal/UTextarea/UButton） |
| `review/Modals` | **@nuxt/ui 採用済み**。構造の問題は責務分離の軸 |
| `stroke/OverviewForm` | **@nuxt/ui 採用済み**（UTextarea/UFileUpload/UButton） |

```mermaid
flowchart LR
  subgraph 置換可["置換可・条件付き（5本）"]
    I1[shared/SbIcon]
    I2[shared/UpstreamIcon]
    E[workspace/EmptyState]
    R[workspace/RecordList]
    T[shared/NotificationToaster]
  end
  subgraph 部分置換["部分置換（3本）"]
    D["workspace/DocumentEditor（listener/timer/mounted）"]
    A["workspace/ApprovalCard（formatDate）"]
    DV["workspace/DocumentView（描画経路）"]
  end
  subgraph 削除["削除（1本）"]
    MN[workspace/MarkdownNodes.ts]
  end
  subgraph 再編["再編（2本 → 1本）"]
    Q[stroke/QuestionCard]
    M[AgentQuestionModal]
  end
  subgraph 据置["残るもの（8本）"]
    R3["@nuxt/ui 採用済み（3本）"]
    R4["消える自前実装なし・相当機能なし（5本）"]
  end
  I1 --> UI2["UIcon + customCollections（現行パスを登録・絵は不変）"]
  I2 --> UI2
  E -->|UEmpty + :ui| NU[@nuxt/ui]
  R -->|UTable + :ui| NU
  T -->|"UApp toaster + useToast"| NU
  D -->|useEventListener + useTimeoutFn + useMounted| VU[vueuse]
  A -->|Intl.DateTimeFormat| STD[JS 標準]
  DV -->|"MDC :value（anchorLinks / rehype-raw / prose の3設定）"| MDCX["@nuxtjs/mdc"]
  MN -->|"廃止・役割は rehype-raw を切る設定へ"| MDCX
  Q -->|外殻をページへ畳む| AQ["AgentQuestion 1本（component として残る）"]
  M -->|UModal で包む記述をページに書く| AQ
```

---

# 置換可（条件付き） — 5本

いずれも技術的に置換可能で、**条件は「本家と同じ見た目・挙動を theming / 設定で再現できること」の検証**（最優先要件）。検証で本家再現を損なうと分かった置換は採らない。制約記述との衝突は末尾「制約との衝突」に別立てでまとめる。

## shared/SbIcon.vue / shared/UpstreamIcon.vue — UIcon + カスタムコレクション

自前の `<svg>` + パス定数を、@nuxt/ui の `UIcon` に載せ替える。@nuxt/ui が使う @nuxt/icon は **`customCollections`（`ModuleOptions`、`CustomCollection | IconifyJSON` を受ける）** を持ち、**現行の SVG パスをそのまま IconifyJSON として登録できる。絵は1ピクセルも変えない**（アイコンセットを「選び直す」のではない）。

- 消える自前実装: `<svg>` markup・パス定数の描画部（パス定義自体はコレクション定義へ移動）
- 出どころ2系統の区別（prototype 由来 / 本家由来）は**コレクション名の分離**（例: `sb:` / `upstream:`）で保つ
- 条件: stroke-width / linecap / fill などの描画属性が IconifyJSON の body として同一に出ること、`data-icon` 等のテスト用属性の代替、サイズ指定（属性 vs クラス）の移行を検証

**実装結果（条件は満たした）**: `app/assets/icons.ts` に `sb:` / `upstream:` の2コレクションを置き、現行のパスをそのまま登録した。描画属性は `<svg>` 側に付いていたものを `<path>` 側の直接指定へ移している（継承が直接指定に変わるだけで絵は同じ）。

**実装で判明した落とし穴2件**:

- **`icon.mode: 'svg'` が要る**。@nuxt/icon の既定は `'css'`（`node_modules/@nuxt/icon/dist/module.mjs` の `mode.$default`）で、CSS mask で描くためパスが DOM に出ず、「絵が本家と同じ」をテストで確かめられない。`'svg'` にすると inline SVG になり、`path` の `d` と描画属性（fill / stroke / stroke-width / linecap / linejoin）が DOM に出る。実測で prototype のパスと一致を確認した
- **アイコン名は DOM に出ない**。`data-icon` / `data-upstream-icon` は消え、class も `iconify--sb` / `iconify--upstream`（コレクション単位）までしか出ない。E2E は `svg.iconify--sb path` で絞る形に張り替え、**種別の区別が要るトースト（4種の色とアイコン）はパスの `d` そのもので絞った**

## workspace/EmptyState.vue — UEmpty + :ui

@nuxt/ui `UEmpty`（実在確認済み。icon / title / description の語彙と `ui` prop（slots 上書き）を持つ）に載せ替える。

- 消える自前実装: 空状態の markup 構造（アイコン・見出し・説明の並び）
- 条件: `sb-empty` の寸法（py-12・48px アイコン・無彩色）を `:ui` 上書きで再現できることの検証

**実装結果（条件は満たした）**: `variant="naked"` で枠・背景を消し、寸法は `:ui` の**置換関数**（`SlotClassReplacer` = `(defaults: string) => ClassValue`）で差し替えた。既定 root の `p-4 sm:p-6 lg:p-8` と header の `max-w-sm` は merge の上書きだと breakpoint 付きクラスが残るため、併記では再現できない。不要になった `.sb-empty` 系 CSS は `main.css` から削除した（`sb-empty` の記述は残っていない）。

## workspace/RecordList.vue — UTable + :ui

@nuxt/ui `UTable`（TanStack Table ベース。`<column>-cell` 等の cell slot、`ui` prop（tr/td の上書き）、行選択 API を持つ。行単位の content slot は無い）に載せ替える。

- 消える自前実装: table markup・列の出し分け（`uses()`）は column 定義の condition へ移る
- 残るもの: `RecordItem` → 行データへの変換、進捗バー・バッジの cell 内容
- 条件: `sb-datatable` の様式（行頭 40px タイル・2段テキスト・目のアイコン）を `:ui` と cell slot で再現できること、行クリック遷移とリンクによるキーボード操作の両立、の検証。5本の中で最も再現コストが高い

**実装結果（条件は満たした。据置に戻していない）**。ただし2点、単純な `:ui` 上書きでは成立しなかった。

- **`:ui` は各 slot に関数で渡す**。`UTable` の既定テーマは utilities layer に出るため、`@layer components` の `.sb-datatable` を**必ず**上書きする（`p-4` / `divide-y` / `hover:bg-elevated/50` など）。クラスを併記する形では再現できない。slot に関数を渡すと既定 class の「置換」になる（`SlotClassReplacer`）ので、`root` / `base` / `thead` / `tbody` / `tr` / `th` / `td` / `separator` / `empty` を全て関数で潰し、`.sb-datatable` だけを残した
- **`onSelect` は使えない**。渡すと `tr` に `role="button"` と `tabindex="0"` が無条件に付き、**遷移先を持たない（押せない）行にも付く**。`UTable` は keydown ハンドラを持たないので、フォーカスして Enter を押しても何も起きないタブストップが増える（本家の `tr` は tabindex を持たない）。`:ui` では抑止できない。代わりに `NuxtLink` を `after:absolute after:inset-0` で行いっぱいに広げ、`tr` 側に `.sb-datarow { position: relative }` を当てて起点にした。行のどこを押してもリンクに当たり、タブストップは行ごとに1つ、Enter は `<a>` の既定動作で開く。押せない行はリンクを持たないのでフォーカスも受けない

## shared/NotificationToaster.vue — UApp の toaster + useToast

自前の固定表示 + `setTimeout` Set 管理を、@nuxt/ui の `useToast`（`UApp` が `UToaster` を提供）に載せ替える。

- 消える自前実装: トーストの markup・timer の Set 手管理・手動 dismiss
- 残るもの: `onNotification` 購読 → `toast.add()` への変換、tone → 色クラスのマップ
- 実測済みの適合: `duration` はトースト単位で指定可（5000ms）、`progress: false` で進捗バー無効化可、**UToast は本体クリックに既定動作を持たない**（「押しても何も起きない」は既定で成立）
- 条件: 右上固定（toaster の position 設定）と本家の Tailwind 階調（`*-50/-200/-800`、ダーク `*-900/20`）を `:ui` 上書きで再現できることの検証

**実装結果（条件は満たした）**: 右上固定は `app.vue` の `<UApp :toaster="{ position: 'top-right' }">`（既定は右下）。階調は `toast.add()` の `:ui`（`root` / `icon` / `title` / `close`）で本家のクラスをそのまま載せた。markup も timer も自前では持たず、component は `onNotification` → `toast.add()` の変換と tone → 色クラスの対応だけになった（markup を持たない = `app.vue` 直下に常駐して `useBoardSocket` の購読を保つのが残る役割。composables 側の決定1と対）。

**実装で判明した落とし穴3件**:

- **`closeIcon` の指定が必須**。`@iconify-json/*` をこのプロジェクトは持たないため、指定しないと @nuxt/ui 既定の `i-lucide-x` が解決できず × が空の SVG になる。`closeIcon: 'upstream:close'` を渡す（本家再現でもあり、動作上の必要でもある）
- **`ring-0` で既定の ring を打ち消す**。本家の縁は `border` 1本で、@nuxt/ui の toast が既定で持つ `ring` を残すと縁が二重になる
- **× の `aria-label` は既定が英語 "Close"**。`toast.add()` の `close` prop に `aria-label` を載せて日本語に戻した（`UToast` が既定を書いた直後に `v-bind="props.close"` を展開するため、後から展開される側が勝つ）。`UApp :locale` を触ると他画面の文言まで巻き込むので採らない

---

# 部分置換 — 3本

## workspace/DocumentEditor.vue — listener / timer / mounted 管理のみ委譲

編集・保存の状態機械はドメインの中核で据置。置換するのは**手管理の機構3箇所**のみ:

| 現状 | 置換先 | 根拠 |
| --- | --- | --- |
| `beforeunload` を `onMounted` で addEventListener・`onBeforeUnmount` で removeEventListener（135〜146行） | vueuse `useEventListener('beforeunload', warnOnUnload)` | 登録・解除のペアが1行になり、scope 破棄時の自動解除を持つ。対象未指定時は既定 window（SSR では no-op） |
| `savedNotice` の `setTimeout` 手管理（49・88〜94・127〜130行、呼び出しは 84・113・145行） | vueuse `useTimeoutFn(() => { justSaved.value = false }, 3000, { immediate: false })` の `start` / `stop` | `start()` はクリアしてから張り直す現行と等価。scope 破棄時の自動停止を持つ。**注意**: 現行 `clearSavedNotice()` は「`justSaved.value = false` + `clearTimeout`」の2役で、`stop()` は timer 停止のみ。呼び出し箇所では `justSaved.value = false` を状態機械側の責務として残す（残さないと、保存後3秒以内の文書切替で「保存しました」チップが残留する） |
| `mounted` の手書きパターン `const mounted = ref(false); onMounted(...)`（67〜70行） | vueuse `useMounted()` | 同型（`shallowRef(false)` を `onMounted` で true にする実装。boolean では挙動同一）。hydration mismatch 回避の意図はコメントのまま残す |

残すもの: `dirty` / `saved` / `draft` の状態機械、`justSaved` のリセット（上記のとおり呼び出し箇所の責務）、`onBeforeRouteLeave` の引き止め（vue-router 標準のまま）、保存の失敗処理。

## workspace/ApprovalCard.vue — formatDate のみ委譲

`formatDate`（30〜37行。月日・ゼロ埋めの手組み）を **JS 標準の `Intl.DateTimeFormat('ja-JP', ...)`** に置き換える。無効日付の「不明」は現行の分岐のまま残す。

- 外枠の UCard 化は行わない: 中身（承認/却下の $fetch・却下理由フォーム）はドメインで、枠を替えても自前実装が消えない
- 条件: 現行の表示（`8月25日 00:39` の粒度）と Intl の出力が一致することの検証。`month: 'numeric'` は `8/25` になるため **`month: 'long'`** と `hourCycle: 'h23'` の指定が要る（node v22 実測で一致確認済み）

## workspace/DocumentView.vue — 描画経路を @nuxtjs/mdc へ差し替え

現行は `parseAST` + 自前 `MarkdownNodes`（AST → VNode 直組み）。**自前禁止の方針により、@nuxtjs/mdc の `<MDC :value>` へ差し替える**（選定の実測根拠は「markdown 描画の統一」を参照）。

- `MarkdownNodes.ts` は**削除**（下記「削除」参照）。md4x への依存も不要になる
- `EmptyState` フォールバックは残る
- 条件: `sb-markdown` のスタイルが MDC の出力に同じく当たること（prototype で本家写しスタイル適用済み・目視確認済み）、`headings.anchorLinks: false` の設定（既定は h2〜h4 に自動アンカーが付き本家と異なる。実測で設定1行により解消）

**実装結果（条件は満たした）**: `<MDC :value>` に差し替え、`await init()`（WASM の初期化待ち）は廃止した（`<MDC>` は SSR で描けるため。design 決定7）。`EmptyState` フォールバックは残っている。ただし `nuxt.config.ts` の設定は `anchorLinks: false` の1行では足りず、**`mdc.rehypePlugins: { 'rehype-raw': false }` と `mdc.components.prose: false` の2つが要った**（下の「削除」と「markdown 描画の統一」を参照）。

---

# 削除 — 1本

## workspace/MarkdownNodes.ts

自前の AST → VNode レンダラ。**自前実装の禁止により削除**。役割（生 HTML を描かない・`javascript:` URL を通さない）は @nuxtjs/mdc が parse 時の無条件フィルタ（`validateProps`: `on*` 属性・危険スキーム除去）と Prose コンポーネント（script を描画しない）で引き受ける（prototype 実測で3種の攻撃すべて無害化を確認）。

**実装で判明（上の前提は誤り。削除の判定自体は変わらない）**

**MDC の既定サニタイズは属性しか落とさない。** 実測では `<img>` も `<script>` も**タグとして AST に残る**（落ちるのは `on*` 属性と危険スキームの href だけ）。旧 `MarkdownNodes` は生 HTML を全て捨てていたため、設定なしで載せ替えると既存の E2E「文書に混ざった生 HTML は描かず、実行もしない」（`test/e2e/upstream-style.spec.ts`）が落ちる。

役割の引き受け先は**設定**である。`nuxt.config.ts` に `mdc.rehypePlugins: { 'rehype-raw': false }` を置くと生 HTML が要素化されなくなり、旧実装と同じ振る舞いに戻る。加えて `mdc.components.prose: false`（下記）にすると `ProseScript` も経由しなくなるため、「Prose コンポーネントが script を握り潰す」という当ての方も無くなる。**生 HTML を描かない根拠は `rehype-raw` を切っている一点**であり、この設定を外すと成立しない。

何が落ちて何が残るかは単体テスト `test/app/components/workspace/markdown-sanitize.test.ts` に固定した（同じ `rehype` オプションで `parseMarkdown` を呼び、`<img>` / `<script>` が要素にならないこと・`javascript:` href が除かれること・強調/リンク/表が残ることを見る）。

---

# 再編 — 2本 → AgentQuestion 1本

## stroke/QuestionCard.vue / AgentQuestionModal.vue

**AgentQuestion（問い表示・選択肢・自由入力・排他制御・`answer` emit）を component として残し、外殻はページへ畳む。**

```
画面1（pages/strokes/[sessionId]/index.vue）:
  <AgentQuestion :question="question" @answer="answer" />

画面2（pages/strokes/[sessionId]/proposal.vue）:
  <UModal v-model:open="followupOpen" :dismissible="false">
    <AgentQuestion :question="followupQuestion" @answer="answerFollowup" />
  </UModal>
```

成り立つ根拠:

- **参照元は各1箇所だけ**（`QuestionCard` → `index.vue`、`AgentQuestionModal` → `proposal.vue`）。単一ページ専用の外殻を component として持つ理由が無く、ページへ畳める
- 承認済み `file-components` の棚卸し自身が「FollowupModal（AgentQuestionModal の前身）と QuestionCard は同じ『問いを出して答えを受ける』ことをしている」と記録しており、その**同一部分だけ**が component に残る
- components は **2本 → 1本で実際に減る**。「置かれる画面を知らない = props/emit のみ」の性質は AgentQuestion が引き継ぐ

実装 change で要調整:

- `docs/specs/core/file-components.md`（規範区切り question/ に2本が載っている）と `docs/specs/reference/stroke-modules.md`（AgentQuestionModal の規定）の改定。承認済み仕様のため change + 承認を通す
- waiting 分岐・回答数表示を AgentQuestion に含めるかページ側に書くかは design で確定

**実装結果**: 上の形で成立した（`app/components/AgentQuestion.vue` 1本）。design で確定した点は次のとおり。

- **送信ボタンは component の中**に置き、文言だけ `submitLabel` props で受ける（決定3）。選択・自由入力・排他・notice・送信判定も component に閉じ、親は `@answer` を受けるだけ。waiting も `waiting` / `waitingMessage` / `answered` props で受け、待機表示は面の中に出す
- **寸法はモーダル側（`text-lg` / `p-3` / `rows=2`）に統一**した（決定4）。分岐（`size` props）は作らない

**実装で判明（送信ボタンの置き場）**: 問いは**詳細説明300字＋選択肢5件まで**許容される（`server/utils/stroke/question.ts` の契約）。`UModal` の body は既定で `overflow-y-auto` なので、そこにボタンを置くと長い問いでボタンがスクロール領域の外に出て**押せなくなる**。component 内を「中身（`overflow-y-auto`）」と「ボタン」の2段にし、`:ui="{ body: 'flex min-h-0 flex-col overflow-y-hidden' }"` でモーダル側のスクロールを止めて解消した。

なお design 決定3 が「`UModal` の `divide-y` による区切り線がボタンの上から消える」と見ていた点は**誤り**で、footer slot（注記）は描画され続けるため**区切り線は消えない**。

---

# markdown 描画の統一 — 全画面を @nuxtjs/mdc へ

component の19本勘定の外だが、markdown 描画の関心として本文書で扱う。現状は**2系統が併存**している:

| 系統 | 使用箇所 | 経路 | 安全策 |
| --- | --- | --- | --- |
| md4x + 自前 `MarkdownNodes` | ポータル側（`DocumentView`） | `parseAST` → VNode 直組み | v-html 不使用。生 HTML を AST 段階で捨てる |
| `marked` + DOMPurify | ストローク側（`pages/strokes/[sessionId]/proposal.vue` のプレビュー面2箇所） | `marked.parse` → `DOMPurify.sanitize` → **v-html** | DOMPurify でサニタイズ |

判定: **@nuxtjs/mdc（`<MDC :value>`）の1方式へ統一する**（ユーザー確定 2026-08-25）。

- 全画面（ポータル側 `DocumentView`・ストローク側 `proposal.vue` のプレビュー）が `<MDC :value>` になる。**markdown 処理・サニタイズ・v-html がアプリのコードから全て消える**
- 依存の変更: `marked` / `isomorphic-dompurify` / `md4x` を**削除**、`@nuxtjs/mdc` を追加（差し引き 3 → 1）
- 選定の実測根拠（Nuxt 4.5.2 + @nuxtjs/mdc 0.23.1 の prototype、md4x + DOMPurify 案との並置比較）:
  - 攻撃3種（`<script>` / `onerror` / `javascript:` href）は既定で全て無害化（parse 時の無条件 `validateProps` + ProseScript が本番で何も描画しない）。無害な `<b>`・表・コードは保持
    - **実装で訂正**: 既定で落ちるのは `on*` 属性と危険スキームの href だけで、**`<img>` も `<script>` もタグとして AST に残る**。生 HTML を描かないためには `mdc.rehypePlugins: { 'rehype-raw': false }` の設定が要る（上の「削除」を参照）
  - 留意: script の本文文字列は AST payload（`__NUXT_DATA__`）に残存する（実行はされない）
  - `headings.anchorLinks` 既定で h2〜h4 に自動アンカーが付く → **`anchorLinks: false` の設定が必須**（実測で解消確認）
  - 正常リンクに `rel="nofollow"` が自動付与される（本家との差分として認識）
  - build / SSR とも無エラー。0.23.1（2026-08-10 更新）・@nuxt/content の markdown 基盤
  - **実装で判明**: `@nuxtjs/mdc` を入れると **@nuxt/ui が自前の Prose 一式（`ProseTable` / `ProseTh` …）を自動登録する**。判定は `hasNuxtModule("@nuxtjs/mdc")` との論理和なので（`node_modules/@nuxt/ui/dist/module.mjs` の 121 行）、**`ui: { prose: false }` では止まらない**。登録されると Tailwind クラスが直付けされ、`.sb-markdown` の本家写しスタイルが丸ごと負ける（表が `border-separate` `rounded-md` `text-start` になっていた）。止めるのは `mdc.components.prose: false` の側で、この値は `runtimeConfig.public.mdc` を通って `MDCRenderer` の tag → `prose-*` 差し替えを切る。2モジュールを同居させて初めて出る現象で、prototype の検証では見えていなかった
- mermaid は本家（`enableMermaid` + mermaidPlugin）同様、**どの案でも別途後段（mermaid ライブラリで SVG 化）が必要**。prototype で MDC 出力に対する後段適用を動作確認済み
  - **結論（design 決定6・2026-08-25 改訂）: 後段を入れた。** 当初は「入れない」（新しい振る舞いが増え、純粋なリファクタという性格が崩れる）と決めていたが、方針の序列は **本家に近づけるを最大限優先** が上位にある。本家は mermaid を描いており、「現行と同一」を守るために本家との差を残すのは序列の上位を下位で覆すことになるため、覆した
  - 受け口は `mdc.components.map: { pre: 'MarkdownPre' }`。`MarkdownPre` は `language` を見て mermaid だけ `MermaidDiagram` へ回し、それ以外は `CodeBlock` へ属性ごと素通しする。**置き場は `app/components/global/` が必須**（MDC は map の値を `resolveComponent(名前)` で引き、`app.component()` 登録されるのは `global/` だけ）。props を宣言せず `$attrs` で受ける（宣言すると shiki のクラスが受け側へ届かない）
  - `MermaidDiagram` は `import('mermaid')` の動的 import を `import.meta.client` ガードの内側に置く。**mermaid は `getBBox` などの DOM 計測を使うため Nitro では動かない**。SSR とハイドレーション直後は「Loading diagram...」の枠で両者を一致させ、`onMounted` 以降に SVG へ差し替える（`DocumentView` の SSR 前提を壊さない）。テーマ変数は本家 `hooks/useMDXEditorTheme.ts` の写し
  - **`v-html` は残る。** mermaid が組み立てた SVG の差し込みに使う（本家も `dangerouslySetInnerHTML`）。文書由来の生 HTML を描く経路（`rehype-raw`）は切ったままで、ここに入るのは mermaid 自身の出力に限られる
  - **`skip_specs: true` の根拠が変わる。** 旧決定6 はこれに紐づいていた。後段を入れたことでこの change は「振る舞いを変えない純粋なリファクタ」ではなくなるため、`skip_specs` を維持するか delta spec を起こすかの判断が要る
- 本家との統一性は**描画結果**で判定する（本家の内部方式 MDXEditor は React の実装事情であり、真似る対象ではない）
- 条件: 描画された文書が**本家の文書表示と同等の構造・見た目**になることの検証（`sb-markdown` の当て方は prototype で確認済み。E2E での固定化は実装 change で行う）

---

# 制約との衝突（要判断）

置換可（条件付き）5本は、既存の制約記述と衝突し得る。**制約は據置の理由にせず、置換の条件（検証タスク）に変換した**。本家再現は最優先要件のため、各条件の合否は「本家と同一か」で判定する。採否の最終判断はユーザーが行う。

| 置換 | 衝突し得る記述 | 変換後の条件 | 検証結果 |
| --- | --- | --- | --- |
| SbIcon / UpstreamIcon → UIcon | `SbIcon.vue` 冒頭「アイコンセットの選定は決めていないので、勝手に別のものを選ばない」 | customCollections は**現行パスの登録**であり、別のセットを選ぶことではない。この解釈で進めてよいかを実装前に確認。出どころ2系統の区別はコレクション名で保つ | 満たした。解釈はユーザー確認済み。`sb:` / `upstream:` の2コレクションに現行パスを登録し、`icon.mode: 'svg'` でパスが DOM に出るようにして一致を確認 |
| NotificationToaster → useToast | `openspec/specs/notification-toast`「形は本家と同じ」「押しても何も起きない」 | theming 後の見た目・挙動が spec の Requirement を満たすことを E2E で検証。満たせなければ採らない | 満たした。Requirement 全件（5秒消滅・手動 dismiss・1行テキスト・押しても何も起きない・4種の色・フォーカスを奪わない・初回ロードで過去分を出さない）を `test/e2e/toast.spec.ts` で確認（4種の色とアイコンは `test/e2e/upstream-style.spec.ts`） |
| EmptyState / RecordList → UEmpty / UTable | 各ファイル冒頭の本家（SteeringPage.tsx / SpecsPage.tsx）再現コメント | `:ui` 上書き後の描画が**本家と同一**であることを検証（スクリーンショット比較ではなくテストで） | 満たした。いずれも `:ui` の**置換関数**が要る（併記では既定テーマに負ける）。`EmptyState` の `text-lg`/`text-sm` に対の line-height が付く差は、本家も同じユーティリティを使うため許容（2026-08-25 ユーザー確認） |

---

## 判定の要約

| 判定 | 本数 | 対象 | 実装結果 |
| --- | --- | --- | --- |
| 置換可（条件付き） | 5 | SbIcon / UpstreamIcon（UIcon + customCollections）、EmptyState(UEmpty)、RecordList(UTable)、NotificationToaster(useToast) | **全件が条件を満たし、据置に戻したものは無い** |
| 部分置換 | 3 | DocumentEditor（useEventListener / useTimeoutFn / useMounted）、ApprovalCard（Intl.DateTimeFormat）、DocumentView（描画経路を `<MDC :value>` へ） | 実施済み。`DocumentView` は `await init()` も廃止（決定7） |
| 再編（2→1） | 2 | QuestionCard + AgentQuestionModal → AgentQuestion 1本（外殻はページへ畳む） | 実施済み。送信ボタンは component の中（決定3）、寸法はモーダル側に統一（決定4） |
| 削除 | 1 | MarkdownNodes.ts（自前禁止。役割は MDC の**設定**が引き受ける） | 実施済み。役割の引き受けは既定フィルタではなく `rehype-raw: false` の設定 |
| 据置 | 8 | @nuxt/ui 採用済み3・消える自前実装なし/相当機能なし5 | 変更なし |
| markdown 統一（ページ側含む） | — | 全画面 `@nuxtjs/mdc`（`<MDC :value>`）の1方式。`marked` / `isomorphic-dompurify` / `md4x` を削除 | 実施済み。要る設定は4つ（`headings.anchorLinks: false` / `rehypePlugins: { 'rehype-raw': false }` / `components: { prose: false }` / `components.map: { pre: 'MarkdownPre' }`）。mermaid の後段は**入れた**（決定6 改訂） |
| 新設（後段） | 3 | MarkdownPre（`global/`・振り分け）、MermaidDiagram（client のみ・動的 import）、CodeBlock（shiki の `span.line` に行番号） | 実施済み。決定6 の改訂で範囲に入った |
| 新設（承認注釈） | 1 | ApprovalAnnotator（`review/`・3面と指摘の一覧。`preview` の中身は `#preview` スロットで呼ぶ側から受ける） | 実施済み。**この資料の評価対象ではなく**、change の範囲をユーザー判断で広げて入った（決定9）。`review/` の既存部品と `useAnnotations` を使い回す |

上表の「部分置換」行は、当初 `DocumentView` の置換先を `renderToHtml + DOMPurify` と書いていた。本文の判定（`<MDC :value>` の1方式に統一・2026-08-25 ユーザー確定）と食い違う書き残しだったため、本文に合わせて直した。
