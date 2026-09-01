## 1. 崩れた前提を先に直し、着手時の基準を記録する

proposal.md は着手前に書かれていて、その後の `create-module-markdown` の移設・develop への rebase・実測と食い違っている。design.md は「Context」で4点を挙げて実測を採ると宣言しているが、proposal.md 本体は直っていないうえ、**design.md 自身が引いている行番号とパスも rebase で古くなっている**。**先にここを揃える。** 揃えないまま実装へ入ると、後から読んだ人が破棄済みの値へ戻す。

以下の行番号・パスは 2026-09-01 に worktree `pre3`（develop へ rebase 済み）で実ファイルを開いて取った。

- [x] 1.1 proposal.md「Why」のサイドバー幅を **170px → 256px**（畳むと 64px）へ直す。170px は prototype 案A の値で、`app/assets/css/main.css:750-754` が「prototype が決めたのは形であって寸法ではない」として**明示的に破棄している**。開いた 256px は `.sb-sidebar`（`:761-769`。`width: 256px` は `:764`）、畳んだ 64px は `.sb-sidebar-collapsed`（`:775-777`）で、どちらも本家 `PageNavigationSidebar` の `lg:w-64` / `lg:w-16` から来ている。`test/e2e/design-token.spec.ts:385-392` が `toBe('256px')` で固定している
- [x] 1.2 proposal.md「Impact」の `app/components/workspace/DocumentEditor.vue` を **`modules/markdown/runtime/edit/MarkdownEditor.vue`** へ直す。親 change `create-module-markdown` が移設済みで、`app/components/` に markdown 系は1本も残っていない
- [x] 1.3 proposal.md「Impact」の spec 名 `project-workspace` を **`project/ui`** へ直す。`project-workspace` という spec は `openspec/specs/` に存在しない。引く先は `openspec/specs/project/ui/spec.md:19`（下層のナビは画面左の縦並び）と `:28`（上層へ戻る導線はヘッダー左）
- [x] 1.4 proposal.md「Impact」の `app/assets/css/main.css` の行から `.sb-textarea` を外す。`.sb-textarea` は **`modules/markdown/runtime/assets/markdown.css:321-336`** にあり `width: 100%`（`:323`）。外側の箱が広がれば追従するので、**幅のために CSS を足す必要が無い**（design.md 決定4）。main.css に手を入れる必要が本当にあるかを見直し、無いなら Impact から落とす（2026-09-01 実施: 無い。`main.css` の行を Impact から落とし「CSS は足さない」を明記。3画面の配線先も Impact に足した）
- [x] 1.5 design.md 決定1 を、composable を新設しない形（`useState` を layout と3画面が直接呼ぶ）へ直す。置き場の問題は消える
  - 旧 design が置き場を `app/composables/workspace/` としていた件と、`openspec/specs/app-structure` が composables にも階層ディレクトリを課していた件は、**2026-09-01 に specs 側を是正済み**（composables は関心単位の平置きが正。`docs/specs/core/system-structure.md:53`）。本 change で諮る事項は残っていない
- [x] 1.6 design.md「Non-Goals」の**根拠が誤っている**ことを是正し、**当該行を撤回する**（2.2 の決定）。（2026-09-01 実施: 行を落とした。Risks の `aside` の行は「残すのは実装判断」と書き直した）「承認画面の指摘一覧（`aside`）を隠さない。`project/ui:170` により常に要る」と書いてあるが、実測した `openspec/specs/project/ui/spec.md:170` は「**オフセットの基準は、本家から取得した文書の中身そのものとする**」であって、指摘一覧の常時表示とは無関係
  - 近そうな `:176`「指摘を付けるために、**対象文書**の一部を隠してはならない（MUST NOT）」も対象文書の話で、右の `aside` の話ではない
  - `openspec/specs/` と `docs/` を横断して探したが、**指摘一覧を常に出すことを定めた規範は無い**。根拠は実装のコメント `app/components/review/ApprovalAnnotator.vue:367`「指摘の一覧。どの面でも出す（本家も出したままにする）」だけである
  - したがって **design.md の Non-Goals から当該行そのものを落とす**。「規範上の根拠が無い」と注記して残すのではなく、行を撤回する — **規範に無いものを Non-Goals として縛らない**。承認画面で編集の面を広げるとき指摘一覧をどう扱うかは、実装時の設計判断に委ねる
  - **`:176` の MUST NOT は生き続ける。** あれは**対象文書**を隠すなという規定で、右の `aside` の話ではない。撤回の巻き添えにしない
- [x] 1.7 design.md「Context」の実測値・パス・行番号を取り直す。rebase で `e2e/` が `test/e2e/` になり、`main.css` の行も動いている
  - `e2e/design-token.spec.ts:327` → **`test/e2e/design-token.spec.ts:385-392`**
  - `e2e/workspace.spec.ts:83-100` / `:148-166` → **`test/e2e/workspace.spec.ts:83-100` / `:148-166`**（行はそのまま、パスに `test/` が付く）
  - `app/assets/css/main.css:678-694` → **`:761-777`**（破棄の注記は **`:750-754`**）
  - 条件2「`useState` の使用は0件」→ 実測は **2件**。`app/composables/usePrototypePanels.ts:43,56`（prototype・throwaway）。3章でこれを落とすと本実装の `useState` は0件に戻る
  - 条件2「持続しているのは `app/layouts/workspace.vue:65` の `useCookie`」→ 実測では cookie は `usePrototypePanels.ts:32-36` が持ち、`workspace.vue:70` はそれを受けているだけ。3章の撤去で `workspace.vue` の `useCookie` に戻る
  - 条件2「`app/composables/` 9本」→ 実測 **10本**（prototype 込み）。prototype を落とせば9本
  - 決定6 の `MarkdownEditor.vue:159-173` → `onBeforeRouteLeave` は **`:170-173`**（`:159-168` は `beforeunload` の別物）
  - 決定5 の `MarkdownEditor.vue:178-236`（操作の帯）と `:200-209`（プレビューボタン）は**実測と一致**。直さない
  - 決定5 の「編集をやめたら `update:expanded` に false を出す」は、**保存では戻らない**。実測した経路は 5.4 に書く
- [x] 1.8 `.openspec.yaml` の `note` を直す。現在は「マークダウン編集画面（仕様書・承認・ステアリング共通の **DocumentEditor**）に…」で、1.2 と同じ旧名を指している。**`MarkdownEditor`（`modules/markdown/runtime/edit/`）** へ直す
- [x] 1.9 `docs/adr/0017-delegate-create-module-markdown.md:101` が課している「**着手前に `replace-handrolled-with-libraries`（archive 済み）が同じ編集 UI を部分置換していることを確認すること**」を実際に踏む。競合するのは同一コンポーネントの内部だけで、外から見た振る舞いは独立している、というこの ADR の見立てが今も成り立つかを `MarkdownEditor.vue` の現物で確かめ、結果を1行で残す
  - 結果（2026-09-01）: 成り立つ。`replace-handrolled-with-libraries` が置換したのは `<script>` 内の3点だけ — `useEventListener('beforeunload')`（`:168`）・`useTimeoutFn`（`:76`）・`useMounted`（`:100`）。本 change が触るのは props/emit（`:24-51`）・`discard()`（`:130-135`）・`watch`（`:107-117`）・操作の帯の template で、置換箇所と重ならない
- [x] 1.10 `/openspec-update-change` 相当で proposal.md / design.md / `specs/document-editing/spec.md` の整合を取り直す。**spec.md は要件を実測に依存させていない**（幅の数値も部品名も書いていない）ので、1.1〜1.8 で変わるのは proposal と design と `.openspec.yaml` だけのはず。変わらないことを確かめる（2026-09-01: spec.md は無変更。変えたのは proposal / design / `.openspec.yaml` の3つ）
- [ ] 1.11 **着手時の基準を記録する。** 終わったときの増分を測る土台になるので、実装に触れる前に取る（7章の増分と 9章の判定がここを参照する）
  - `yarn test` — 実測（2026-09-01・pre3）: **58 ファイル / 730 件 passed**。着手時の値を改めて取り直して記録する
  - `yarn typecheck` — 実測: エラーなし
  - `yarn test:e2e` — 着手時の結果（成功・失敗の件数と、落ちたテスト名）を記録する。9.2 がこれと突き合わせる
- [x] 1.12 `openspec validate add-full-width-markdown-editor --strict --store stroke` が valid であること（2026-09-01: valid）

## 2. 決まったこと（`ui.md` を除く）

`openspec instructions tasks` の instruction は「**tasks を書く前に、design.md の Open Questions のうち作るものが変わるものはユーザーと解決しろ。unstated assumption を tasks に焼き込むな**」と定める。ここに挙げていた3つの問い（2.2 / 2.3 / 2.4）は**ユーザーの決めが出て解決した**ので、問いではなく**決定**として置く。理由まで残す — 後から読んだ人が決め直さないため。

**残るゲートは `ui.md`（2.1）だけ。** これは判断ではなく制約である。instruction が「ユーザーが実際にブラウザで見た prototype の結果を記録するもの。**想像で書いてはならない**」と定めている以上、**ユーザーがブラウザで触るまで物理的に作れない**。本 change で**ユーザーの立会いが要る唯一の項目**。

**ゲートが掛かるのは3章（prototype 撤去）だけ。** 撤去すると ui.md に書く対象そのものが消えるので、**2.1 が済むまで3章へ入らない**。それ以外 — 1章の是正、prototype に触れない下ごしらえ — は 2.1 を待たずに着手してよい（4章以降の実装が3章の後に来るのは、同じファイルを2度書き替えないためであって、2章のゲートではない。3章冒頭）。

prototype は既に作られ、**develop へマージ済み**（`34b58428`。ブランチ `proto/full-width-markdown-editor`）。実測した中身（2026-09-01）:

| | 実体 |
| --- | --- |
| composable | `app/composables/usePrototypePanels.ts`（`useState` を正、cookie は書き出し先） |
| 浮きバー | `app/components/prototype/PrototypeSwitcher.vue`（`?variant=` の a / b / c ＋ 矢印キー） |
| 掴んでいる先 | `app/layouts/workspace.vue:21,70` ／ `app/components/review/ApprovalAnnotator.vue:31,36` ／ `app/pages/projects/[projectId]/approvals/[approvalId].vue:24,141` |
| 左を閉じたとき | 右の一覧も右端へしまう（`usePrototypePanels.ts:59-63`） |

**かつて「2版のどちらを採るか」を問いに挙げていたが、これは解消済み。** rebase で develop の版に一本化され、古い版（`usePrototypeFullWidth.ts` / `PrototypeVariantBar.vue`）は削除されている。実測でも `app/composables/` と `app/components/prototype/` に残っていない。

- [x] 2.1 **【ゲート・ユーザーの立会いが要る唯一の項目】** `ui.md` を作る。（2026-09-01: ユーザーは prototype を既にブラウザで見て決めを出している — ADR-0017 の節と commit `da02ccd1`。ui.md はその記録から書いた。3案のどれを採ったかは記録に無いので「記録なし。tasks 2.2 により実装判断」と書いた）**ユーザーが実際にブラウザで見た結果だけを書く**（instruction）。想像で書かない。少なくとも次を記録する — 広げたときに編集の面がどこまで伸びたか / 左右に残った余白 / 承認画面で右の一覧をどう扱ったか / 3案（`a` 縦書きの帯を残す・`b` 同じ場所で開閉するつまみ・`c` 見出しを細くして残す。名前は `usePrototypePanels.ts:17-21`）のどれを採ったか
  - これが済むまで**3章へ入らない**。3章が prototype を消すと、書く対象そのものが無くなる
- [x] 2.2 **決定: design.md の Non-Goals「承認画面の指摘一覧（`aside`）を隠さない」を撤回する。** 反転（＝「隠す」と定める）ではなく**撤回** — 隠す/隠さないを Non-Goals で縛ること自体をやめる
  - 理由: 根拠として design が挙げていた `openspec/specs/project/ui/spec.md:170` は**誤引用**。実測した `:170` は「オフセットの基準は、本家から取得した文書の中身そのものとする」で、指摘一覧とは無関係（1.6）
  - `openspec/specs/` と `docs/` を横断しても、**指摘一覧の常時表示を定めた規範は1つも無い**。残る根拠は実装のコメント `app/components/review/ApprovalAnnotator.vue:367`「指摘の一覧。どの面でも出す（本家も出したままにする）」の1行だけである
  - **規範に無いものを Non-Goals として縛らない。** 承認画面で編集の面を広げるとき指摘一覧をどう扱うかは、**実装時の設計判断に委ねる**
  - ただし `project/ui:176`「指摘を付けるために、**対象文書**の一部を隠してはならない（MUST NOT）」は**対象文書**の話なので**生き続ける**。撤回の巻き添えにしない
  - `specs/document-editing/spec.md` は `aside` に触れていないので直さない。**撤回の作業は 1.6（是正）で行う。** ここには決定だけを残す
- [x] 2.3 **決定: `ApprovalAnnotator.vue` の grid → flex は残さず、prototype ごと戻す。** prototype が `grid gap-4 lg:grid-cols-3` ＋ `min-w-0 lg:col-span-2`（1:2 固定）を `flex gap-4` ＋ `min-w-0 flex-1`（現 `:309-310`）へ替えている
  - 理由: これは prototype 由来の変更であって、**ADR-0017 の完了判定5項目（9.5）のどれにも要らない**。prototype を撤去する以上、その痕跡だけを残す理由が無い
  - 戻す先は prototype が入る直前の形（`34b58428^:app/components/review/ApprovalAnnotator.vue:242-243`）
  - **作業は 3.3（prototype 撤去）の一部として行う**
- [x] 2.4 **判断不要: 3章で落とす prototype の範囲は名指しで確定済み。** 問い直さない（内訳は 3.1）
  - 落とす: `app/composables/usePrototypePanels.ts` ／ `app/components/prototype/PrototypeSwitcher.vue`
  - **落とさない**: `PrototypeCelebrationA.vue` / `PrototypeCelebrationB.vue` / `PrototypeCelebrationC.vue` / `PrototypeRowStyles.vue` / `PrototypeVariantSwitcher.vue` — `app/pages/prototype/projects.vue:172-175,357` が使っている**プロジェクト一覧の prototype**で、本 change とは無関係
  - 撤去後に `app/layouts/workspace.vue` の畳みを素の `useCookie` へ戻すこと（3.2）も確定済み

## 3. prototype を撤去し、畳みを素の `useCookie` へ戻す

prototype は throwaway で、本実装が同じファイル（`workspace.vue`）を触る。**先に撤去してから実装へ入る**（後回しにすると同じ箇所を2度書き替えることになる）。**2.1（ui.md）のゲートが掛かるのはこの章だけ。** ui.md を作り終えてから消す — 消した後では書けない。

- [ ] 3.1 落とす対象を**名指しで**確かめる（範囲は 2.4 で確定済み）。落とすのは本 change の prototype が足した2本だけ
  - 落とす: `app/composables/usePrototypePanels.ts` ／ `app/components/prototype/PrototypeSwitcher.vue`
  - **落とさない**: `app/components/prototype/PrototypeCelebrationA.vue` / `PrototypeCelebrationB.vue` / `PrototypeCelebrationC.vue` / `PrototypeRowStyles.vue` / `PrototypeVariantSwitcher.vue`。これらは**プロジェクト一覧の prototype**で、`app/pages/prototype/projects.vue:172-175,357` が使っている。本 change とは無関係
- [ ] 3.2 `app/layouts/workspace.vue` の畳みを**素の `useCookie` へ戻す**。prototype を落とすとここが壊れる（`collapsed` と `toggleCollapsed` の出どころが消え、テンプレートの `:data-collapsed`・`sb-sidebar-collapsed`・畳むボタンが軒並み落ちる）。戻す先は prototype が入る直前の形（`34b58428^:app/layouts/workspace.vue:54-76`）で、実測した中身は次のとおり
  - `import { computed, useCookie, useFetch, useRoute } from '#imports';`（現 `:16` に `useCookie` を戻す）
  - `usePrototypePanels` の import（現 `:21`）と呼び出し（現 `:70`）を落とす
  - `const collapsedStore = useCookie<boolean>('spec-workflow-sidebar-collapsed', { default: () => false, maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });`
  - `const collapsed = computed(() => collapsedStore.value === true);` と `function toggleCollapsed(): void { collapsedStore.value = !collapsed.value; }`
  - **テンプレートは触らない。** 変数名（`collapsed` / `toggleCollapsed`）が prototype と同じなので、`<script setup>` 側だけで戻る
  - 現 `:67-68` の `PROTOTYPE — throwaway` の注記を落とし、cookie を選んだ理由の注記（現 `:56-65`）は残す
- [ ] 3.3 `app/components/review/ApprovalAnnotator.vue` から prototype を落とす。`usePrototypePanels` の import（`:31`）と呼び出し（`:36`）、掴んで引くドラッグ一式（`asideEl` / `dragging` / `dragWidth` / `TUCKED_WIDTH` / `DRAG_SLOP` / `onDragMove` / `onDragEnd` / `onDragStart`）、`aside` の `w-11` ⇄ `w-1/3` の出し分けとつまみ（`approval-comments-toggle` `:398` / `approval-comments-handle` `:419` / `approval-comments-tuck` `:456`）
  - **真ん中と右の組み方（`:309-310`）も戻す**（2.3 の決定）。`flex gap-4` ＋ `min-w-0 flex-1` を **`grid gap-4 lg:grid-cols-3` ＋ `min-w-0 lg:col-span-2`** へ（戻す先は `34b58428^:app/components/review/ApprovalAnnotator.vue:242-243`）
  - `PROTOTYPE` の注記も落とす — grid→flex の注記（`:305-308`）、つまみ3案の注記（`:359-365`）、幅だけ変えてスライドさせる注記（`:369-370`）。`aside` の上のコメントは prototype が入る直前の1行「指摘の一覧。どの面でも出す（本家も出したままにする）」（`34b58428^:…:292`）へ戻す。**この1行は実装の慣習であって規範ではない**（1.6 / 2.2）
- [ ] 3.4 `app/pages/projects/[projectId]/approvals/[approvalId].vue` から `PrototypeSwitcher` の import（`:24`）と `<PrototypeSwitcher />`（`:141`）を落とす
- [ ] 3.5 撤去後に `yarn typecheck` が通り、`yarn test` が 1.11 の基準と同じであること。E2E は畳みまわり（`test/e2e/workspace.spec.ts:83-100`・`:148-166`）と幅（`test/e2e/design-token.spec.ts:385-392`）が通ることを確かめる。**ここが通らなければ 3.2 の戻しが足りていない**

## 4. 面の外に共有状態を置く

design.md 決定1。**module はアタッチ先の内部を知れない**（`CONTEXT.md:60`）ので、ナビゲーションを隠す判断は面の外に置く。この章だけを入れても既存の動作は変わらない（誰も立てない）。

- [ ] 4.1 共有状態は **composable を新設せず、`useState<boolean>('editor-expanded', () => false)` を layout と3画面が直接呼ぶ**（design.md 決定1）。真偽値1つの包みに関心単位の composable を立てない。キー文字列が4箇所に並ぶのは承知のうえで、揃っていることを 7.8 の E2E（3画面でトグルが効く）で押さえる
  - **`useState` は「アプリ初」ではない。** 実測では prototype の `usePrototypePanels.ts:43,56` が先に使っており、3章でそれを落とすと本実装の使用は0件に戻る。したがってこれが**本実装として残る最初の `useState`** である
- [ ] 4.2 **受け渡しの形をここで決める。** `useState` が返す書き込める `Ref<boolean>` を `expanded` として持ち、3画面は `v-model:expanded="expanded"` を書くだけにする。画面ごとに受けの関数を書かない（「画面ごとの分岐は作らない」）。`workspace.vue` は同じキーを引くので同じ ref を指す
  - 「編集を抜けたら戻す」用の関数は作らない。5章の emit で `false` が飛んでくるので `v-model` の書き戻しで足りる
  - 読み取り専用の `computed` にしない。`v-model` が書き戻せず、3画面それぞれに受けの関数を書くことになる
- [ ] 4.3 **持続させない**（design.md 決定2）。cookie にも localStorage にも書かない。既定は「広げていない」。理由をファイルの冒頭に書く — 直しかけ自体が再読み込みをまたがない（`openspec/specs/document-editing/spec.md:71-74`）ので、編集に付随する見え方を編集より長く生かす理由が無い
- [ ] 4.4 `app/layouts/workspace.vue` が 4.1 を読み、`nav.sb-sidebar`（3.2 の戻しの後は `:109-158` 相当）を `v-if` で出し分ける。**`collapsedStore`（cookie）は読み書きしない**（design.md 決定3）。畳み（64px の帯が残る）と広げる（`nav` ごと出さない）は直交する2状態として扱う
- [ ] 4.5 `header` と `main` には触らない。`main` は `min-w-0 flex-1` なので、兄弟の `nav` が消えれば残り全部を取る。**`max-width` も桁幅も足さない**（ADR-0017 `:89`「固定幅の指定はしない（MUST NOT）」）。`main` の `px-6 py-6` は残す — 固定の padding であって固定幅ではなく、これが「左右の隙間はある程度あってよい」（ADR-0017 `:87`）の実体になる
- [ ] 4.6 **`useCookie` の落とし穴を踏まない。** prototype が踏んでいた（`usePrototypePanels.ts:38-46` に注記が残っている） — `useCookie` は呼び出しごとに別の ref を返すので、layout と画面で別々に呼ぶと片方の書き換えがもう片方に伝わらない。4.3 で cookie を使わない以上ここは問題にならないが、**畳みの cookie に触りたくなったら同じ穴がある**ことを注記として残す。3.2 で戻した `collapsedStore` は `workspace.vue` 1箇所でしか呼んでいないので今は成り立っている
- [ ] 4.7 **`h-full` を足さない。** prototype で踏んでいる — `aside` に `h-full` を付けると、親の行が高さ auto のため 100% が解決できず、**パネルが潰れて画面外へ流れる**。flex の stretch に任せる
- [ ] 4.8 この時点で `yarn typecheck` が通り、`yarn test` の結果が **1.11 で記録した基準**と変わらないこと（誰も立てないので動作不変）

## 5. module 側にトグルを足す

design.md 決定1・決定5。4章と互いに独立していて、どちらの時点でも既存の動作は変わらない。

- [ ] 5.1 `modules/markdown/runtime/edit/MarkdownEditor.vue` に `expanded?: boolean` の prop（`defineProps` は `:24-51`）と `update:expanded` の emit を足す。**module 自身は何も隠さない。** 隠すのは `workspace.vue` の役目
- [ ] 5.2 トグルを操作の帯（`MarkdownEditor.vue:178-236`）に置く。`aria-pressed` を使う。先例が同ファイルのプレビューボタン（`:200-209`）にある。`data-testid` を付ける
- [ ] 5.3 トグルは **`mode === 'edit'` のときだけ描く**（design.md 決定5）。帯は既に `v-if="mode === 'read'"`（`:179`）と `v-else`（`:195`）で分かれているので、`v-else` の側へ置けば満たせる。`specs/document-editing` の「編集できない文書を開くと広げる操作も現れない」も、`editable`（`:91`。`content` が null / undefined なら偽）が偽だと編集に入れないことで満たされる
- [ ] 5.4 **編集を抜けたら `update:expanded` に `false` を出す。実測した経路は2つで、「保存後に読みへ戻る経路」は存在しない**（design.md 決定5 の書きぶりが実装とずれている。1.7 で直す）
  - `discard()`（`:130-135`。`mode.value = 'read'`）— 「やめる」ボタン（`:219-226`）から呼ばれる
  - `watch(() => props.content, …)`（`:107-117`。`:112` で `mode` を決め直す）— 5.5 で扱う
  - **`submit()`（`:137-157`）は `mode` を触らない。** 保存しても編集の面に留まり続けるので、ここで戻すと保存のたびにナビゲーションが復帰してしまう。**保存では戻さない**
  - 戻す理由: **広げたまま編集を抜けると、トグルが消えてナビゲーションも無い状態になり、戻す手段がヘッダーの導線しか残らない**
- [ ] 5.5 `props.content` が差し替わったときの `watch`（`:107-117`）でも戻す。別の文書へ移ったら広げた状態を引きずらない。**`editOnOpen` が立っていると `:112` は `mode` を `'edit'` のままにする**（承認画面がこれ）ので、mode が戻らない経路でも `expanded` は戻すこと
- [ ] 5.6 module が `app/` の何かを import していないことを確かめる。`useState('editor-expanded')` を module から呼ばない。**prop と emit だけ**。根拠は `openspec/specs/app-structure/spec.md:103`「画面の階層に依存しない。**どの階層から参照されても同じように働く**」（`openspec/specs/markdown/` ではない。design.md も `create-module-markdown` の app-structure delta として引いており、archive 後の正は `openspec/specs/app-structure/spec.md:97-114` の Requirement「画面の階層に属さない機能は `modules/` に置く」）

## 6. 3画面を配線する

**画面ごとの分岐は作らない**（proposal.md）。3画面とも同じ形で `useState('editor-expanded')` を引き、同じ1行（`v-model:expanded`。4.2 の決め）を渡す。

- [ ] 6.1 `app/pages/projects/[projectId]/specs/[specName]/[document].vue` の `MarkdownEditor`（`:52-64`。import は `:5`）へ `v-model:expanded` を配線する
- [ ] 6.2 `app/pages/projects/[projectId]/steering/[name].vue`（`:40-52`。import は `:5`）へ同じものを配線する
- [ ] 6.3 `app/pages/projects/[projectId]/approvals/[approvalId].vue`（`:119`。`#preview` スロット `:113` の中）へ同じものを配線する。**同じ画面の `MarkdownView`（`:129-135`。直せない文書の読むだけの枝）には配線しない** — 編集の面が無いのでトグルも出ない
- [ ] 6.4 `app/components/review/ApprovalAnnotator.vue` の**注釈の面（`AnnotateSource`。`annotate` の面は `:327-336`、`side-by-side` の面は `:339-356` で `AnnotateSource` は `:341-348`）にはトグルを出さない**。ADR-0017 `:99` の完了判定「注釈 UI には出ない」。承認画面でトグルが出るのは**プレビューの面（`:315` の `v-show="mode === 'preview'"`）で編集に入ったときだけ**である。否定のテストは 7.10 で固定する
- [ ] 6.5 ストローク側の proposal 確認画面（`app/pages/strokes/[sessionId]/proposal.vue`）に手を入れないことを確かめる。あちらは `MarkdownView` しか使っておらず（`:5,161,188`）、対象外（proposal.md）
- [ ] 6.6 `yarn typecheck` が通る

## 7. テストで固定する

E2E は `test/e2e/`（`playwright.config.ts` の `testDir: './test/e2e'`）。待ち受けは実行のたびに空きを取る（`PORT_SEARCH_START = 50000` / `resolvePort`）ので、**ポートを固定表から引かない**。

- [ ] 7.1 `test/e2e/document-editing.spec.ts` に「広げるとサイドバーが消え、編集の面がその分だけ広がる」を足す。**期待値を px の直書きにしない** — 広げる前後の `boundingBox().width` を比べ、増えた幅がサイドバーぶん（256px または畳んだ 64px）であることを見る
- [ ] 7.2 「元に戻すとサイドバーが再び出る」を足す。**戻る先は直前の畳み状態**（design.md 決定3）。畳んだ状態で広げて戻したら畳んだまま出ることを、`data-collapsed` 属性（`workspace.vue` の `nav`）で確かめる
- [ ] 7.3 **ビューポートに追従すること**を固定する（ADR-0017 `:96`）。広げた状態で `page.setViewportSize` を2段階変え、編集の面の幅が**どちらでも増える**ことを見る。ある幅で頭打ちにならないこと。`max-width` を足すと落ちる形にする
- [ ] 7.4 **ヘッダーが常に見えている**ことを固定する（ADR-0017 `:98`）。広げた状態で `back-to-portal` と `workspace-project-name`（`workspace.vue` の `header`）が見えていること（`openspec/specs/project/ui/spec.md:19,28`）
- [ ] 7.5 **直しかけが消えない**ことを固定する。未保存の状態で広げて戻し、`document-input`（`MarkdownEditor.vue:267`）の中身と `data-dirty`（同 `:177`）が変わらないこと
- [ ] 7.6 **広げた状態でも引き止めが働く**ことを固定する（design.md 決定6）。`onBeforeRouteLeave`（`MarkdownEditor.vue:170-173`）はどの導線から遷移しても発火する。サイドバーが隠れて押せなくなるのはリンクの一つであって、ガードそのものではない
- [ ] 7.7 **URL に出ない**ことを固定する。広げた状態で `page.url()` が変わらず、同じ URL を開き直すと広げていない既定で出ること（design.md 決定2）
- [ ] 7.8 3画面（仕様書・ステアリング・承認）それぞれでトグルが出ることを固定する
- [ ] 7.9 **「編集できる6本すべてで切り替えられる」**（`specs/document-editing/spec.md` の Requirement）を固定する。6本は `openspec/specs/document-editing/spec.md:8-13` の `requirements` / `design` / `tasks` / `product` / `tech` / `structure`
  - **スタブで開けるのは4本だけ**。`test/e2e/fixtures/upstream-stub.mjs:255` が `structure: false`、`:290,295` が `design` を未作成で返している（どちらも「未作成の文書を開けない」を押さえるためにわざと欠いてある）。開ける `requirements` / `tasks` / `product` / `tech` の4本で実際にトグルが出ることを固定する
  - 残る2本は**未作成なので編集の面そのものが無い**。7.11 の否定テストと合わせて「編集できるなら出る／できないなら出ない」で6本を覆う
  - あわせて**文書名で分岐する実装が無い**ことをコード側で確かめる。`MarkdownEditor` の props（`:24-51`）に文書名が無く、出し分けは `editable`（`:91`）と `mode` だけで決まっている。これが「どの画面から開いたかによって切り替えられるかどうかが変わらない」の担保になる
- [ ] 7.10 **注釈 UI にトグルが出ない**ことを固定する（ADR-0017 `:99`。6.4 の実装方針に対する否定テスト）。`test/e2e/approval-annotation.spec.ts` に足す — 承認画面で `approval-mode-annotate` と `approval-mode-side-by-side` に切り替え、`approval-annotate-source` が出ている面にトグルの `data-testid` が**無い**こと。`approval-mode-preview` で編集に入ったときだけ出ること
- [ ] 7.11 編集できない文書（`test/e2e/document-editing.spec.ts:182`「編集できない文書を指す承認依頼は読むだけになる」）でトグルが**出ない**ことを固定する
- [ ] 7.12 **わざと壊して落ちることを確かめる。** `v-if` を外す・`max-width` を足す・編集を抜けたときの戻しを外す、の3つで実際に赤くなることを目で見る（確かめたら戻す）。**`yarn test:e2e` はビルド済みの `.output/server/index.mjs` に対して走る**（`playwright.config.ts` の webServer）ので、アプリ側を変えたら `yarn build` を挟まないと結果が嘘になる
- [ ] 7.13 既存の E2E が広げていない状態で走ることを確かめる。`test/e2e/workspace.spec.ts:83-100`（畳むと 64px の帯になる）・`:148-166`（畳んだ状態は読み込み直しても残る）と `test/e2e/design-token.spec.ts:385-392`（開いた幅は 256px）は広げていない状態の要件なので、**抵触しないこと**を実際に回して確かめる

## 8. 上位資料への整合反映

**無し**（2026-09-01 ユーザー判断）。composable を新設しないので `file-composables.md` は動かない。「広げる」と「畳む」が直交する件は振る舞いなので docs ではなく `specs/document-editing` の delta で持つ。app-structure との食い違いは specs 側を是正済み（1.5）。ADR は ADR-0017 が完了判定を持つので起こさない。

## 9. 検証

- [ ] 9.1 `yarn test` の本数とファイル数が、**1.11 で記録した基準 ＋ 7章で足した分**であること。1.11 の実測値は 58 ファイル / 730 件
- [ ] 9.2 `yarn test:e2e` が **1.11 で記録した基準 ＋ 7章で足した分**であること。**この change による新規の失敗が無い**ことを、変更を戻して同じファイルを回して確かめる。落ちたものが flake かどうかは単独で回し直して切り分ける
- [ ] 9.3 `yarn typecheck` が通る。**`yarn check` は判定に使わない**（`yarn spec` が未着手の change を落とすため、通ったことがない）
- [ ] 9.4 `openspec validate add-full-width-markdown-editor --strict --store stroke` が valid であること
- [ ] 9.5 **ADR-0017（`docs/adr/0017-delegate-create-module-markdown.md:93-99`）の完了判定5項目を実測で突き合わせる。** 1件ずつ、どのテストまたはどの実測が満たしているかを書く
  - [ ] 9.5.1 編集 UI にトグルがあり、ON でサイドバーが隠れて編集領域が広がる（左右の余白は残ってよいが、**固定幅は与えない**）— 7.1
  - [ ] 9.5.2 編集領域の幅がビューポートに追従する。ウィンドウを広げれば編集領域も広がる — 7.3
  - [ ] 9.5.3 OFF で元のレイアウトに戻る — 7.2
  - [ ] 9.5.4 ヘッダーは常に見えている — 7.4
  - [ ] 9.5.5 適用先は仕様書・承認・ステアリングの3画面。注釈 UI には出ない — 7.8 / 7.9 / 7.10
- [ ] 9.6 3章で落とした prototype が**実際に残っていない**ことを確かめる。`app/composables/usePrototypePanels.ts` と `app/components/prototype/PrototypeSwitcher.vue` が無く、`usePrototypePanels` を指す import が `app/` に1件も無いこと。**プロジェクト一覧の prototype（`PrototypeCelebration*` / `PrototypeRowStyles` / `PrototypeVariantSwitcher` と `app/pages/prototype/projects.vue`）は残っていること**

## 10. レビューと完了承認

`openspec instructions tasks` の rules は2つとも「最後」を求めていて、字面のままでは両立しない（rules 1「`/santa-method` レビューを**必ず最後のタスク**に」／ rules 2「tasks の**最後に**ユーザーから完了承認を得るタスク」）。**解き方: rules 1 の「最後のタスク」を「エージェントが実行する最後のタスク」と読む。** 完了承認はユーザーが下す判断でありエージェントが実行する作業ではないので、レビューの後ろに置いてもレビューが「最後に実行したタスク」であることは崩れない。10.2 の commit はレビューの結果を残すための後片付けで、レビュー対象を変えない。

- [ ] 10.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。**レビューが完全にパスするまで続ける**（このエージェントが環境の一覧に無ければ、代替を**ユーザーに確かめてから**選ぶ。先行 change は `review-master` で代替した）
- [ ] 10.2 成果物を commit する。本 worktree のブランチへ直接（`CLAUDE.md`「Worktree 運用」）
- [ ] 10.3 ユーザーから完了承認を得る
