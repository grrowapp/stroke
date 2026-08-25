## 1. 依存の入替

- [x] 1.1 `@nuxtjs/mdc` を追加し、`nuxt.config.ts` の `modules` に登録する
- [x] 1.2 `mdc: { headings: { anchorLinks: false } }` を設定し、h2〜h4 に自動アンカーが付かないことを確認する
- [x] 1.3 `yarn install` を通し、`yarn build` が無エラーで終わることを確認する

## 2. markdown 統一（決定7）

- [x] 2.1 `DocumentView.vue` の描画経路を `<MDC :value>` に差し替え、`await init()` と `parseAST` を除く
- [x] 2.2 `EmptyState` フォールバック（`testid="document-missing"`）が現行どおり出ることを確認する
- [x] 2.3 `app/pages/strokes/[sessionId]/proposal.vue` のプレビュー2箇所（`shownMode === 'preview'` と左右分割の右）を `<MDC :value>` に差し替え、`v-html` を除く
- [x] 2.4 `MarkdownNodes.ts` を削除する
- [x] 2.5 MDC 経路のサニタイズを検証するテストを**新規に**追加する（`markdown-sanitize.test.ts`）。`on*` 属性と `javascript:` href は AST で除去されるが、**`<script>` は AST に残る**（無害化は描画側の役割）ため、実行されないことの検証は 2.7 の E2E に置く。`markdown-roundtrip.test.ts` は TipTap の往復検証で `MarkdownNodes` とは無関係のため、そのまま残す
- [x] 2.6 `marked` / `isomorphic-dompurify` / `md4x` を `package.json` から削除し、参照が残っていないことを `grep` で確認する
- [x] 2.7 `sb-markdown` のスタイルが MDC の出力に当たっていることを E2E で固定する（`upstream-style` / `workspace` 全52件パス）
- [x] 2.8 生 HTML を描かない振る舞いを維持するため `mdc.rehypePlugins: { 'rehype-raw': false }` を設定する（MDC の既定サニタイズは属性しか落とさず、`<img>` / `<script>` はタグとして残る）
- [x] 2.9 `mdc.components.prose: false` を設定する（`@nuxtjs/mdc` を入れると @nuxt/ui の Prose 一式が自動登録され、Tailwind クラス直付けで `sb-markdown` の本家写しスタイルに勝ってしまう。`ui.prose: false` では止まらない）

### mermaid とコードブロックの後段（決定6 改訂・2026-08-25 追加）

- [x] 2.10 `mdc.components.map: { pre: 'MarkdownPre' }` を設定し、受け口 `app/components/global/MarkdownPre.vue` を新設する。**置き場は `global/` が必須**（MDC は map の値を `resolveComponent(名前)` で引き、`app.component()` 登録されるのは `components/global/` だけ。`workspace/` に置くと名前が解けず未知の要素がそのまま出る）。props を宣言せず `$attrs` で受ける（宣言すると shiki のクラスが受け側へ届かない）
- [x] 2.11 `app/components/workspace/MermaidDiagram.vue` を新設する。`import('mermaid')` の動的 import を `import.meta.client` ガードの内側に置き、mermaid をサーバのバンドルに引き込まない
- [x] 2.12 SSR とハイドレーション直後は「Loading diagram...」の枠を出し、`onMounted` 以降に SVG へ差し替える（mermaid は `getBBox` などの DOM 計測を使うため Nitro で動かない。本文の SSR は止めない）
- [x] 2.13 テーマ変数を本家 `hooks/useMDXEditorTheme.ts` の `mermaidThemeVariables` の写しにする。`colorMode` の変化と `code` の差し替えで描き直す（本家の `useEffect` の依存と同じ）
- [x] 2.14 `app/components/workspace/CodeBlock.vue` を新設し、mermaid 以外のフェンスを描く。本家の DOM が出す形（枠・右上の帯に言語名の札・行番号・折り返し）を素の `pre` で組む。行番号は shiki の `span.line` に CSS counter で振り、**language 無しのフェンスは shiki を通らず `.line` が無い**ため生ソースから行を組み立てる
- [x] 2.15 `package.json` に `mermaid` を追加する（`shiki` は `@nuxtjs/mdc` から推移的に入る）
- [x] 2.16 `.sb-mermaid` / コードブロックの様式を `app/assets/css/main.css` に置く（本家 `.mermaid-container` の写し）
- [x] 2.17 mermaid フェンスが図として描かれ、それ以外のフェンスが行番号付きのコードブロックとして描かれることを E2E で固定する（`e2e/upstream-style.spec.ts`。`mermaid-diagram` が出て `mermaid-loading` / `mermaid-error` が残らないことを確認）

## 3. vueuse 置換（他段と独立）

- [x] 3.1 `useRelativeTime` の本体を `formatTimeAgo` に差し替える（`messages` で日本語・`invalid: '—'`・`rounding: 'floor'`・`units` は day を最大単位）。**既定 units は minute が46分・hour が20時間で切り替わる**ため明示指定が要る
- [x] 3.2 未来時刻が「たった今」のままであることを確認する（決定5。`messages.future` を関数で上書き）
- [x] 3.3 `useWaitingRetry` の timer 管理を `useIntervalFn({ immediate: false })` に委譲する（`stopPolling` → `pause`、張り直し → `resume`）
- [x] 3.4 `useWaitingRetry` の `import.meta.server` early return を温存する（`resume()` に client ガードは無い）
- [x] 3.5 `DocumentEditor.vue` の `beforeunload` を `useEventListener` に置き換える
- [x] 3.6 `DocumentEditor.vue` の `savedNotice` を `useTimeoutFn(..., 3000, { immediate: false })` に置き換え、**`clearSavedNotice()` に `justSaved.value = false` を残す**（決定8のリスク欄）
- [x] 3.7 保存後3秒以内に別の文書へ切り替えても「保存しました」チップが残らないことを E2E で確認する（`document-editing.spec.ts` に新規追加、16件パス）
- [x] 3.8 `DocumentEditor.vue` の `mounted` の手書きを `useMounted()` に置き換える
- [x] 3.9 `ApprovalCard.vue` の `formatDate` を `Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })` に置き換え、`8月25日 00:39` の粒度が一致することを確認する
- [x] 3.10 無効日付の「不明」の分岐が現行のまま残っていることを確認する
- [x] 3.11 `useRelativeTime` の出力が現行と一致することを固定する単体テストを新規に追加する（`useRelativeTime.test.ts`）

## 4. WebSocket の組み直し（決定1・決定2）

- [x] 4.1 パスと型を引数に取る汎用チャンネル composable を1本作る（`useSessionChannel`。`useWebSocket` ベース・`autoReconnect`・最後の1件で上書き）
- [x] 4.2 `useQuestionChannel` / `useProposalChannel` を**削除**し、参照元3箇所（画面1・`useAgentQuestion`・`useProposalReview`）が `useSessionChannel<T>(sessionId, channel)` を直接呼ぶ形にする。判定の本体が「2本 → 1本」であり、ラッパを残すと3ファイルに増えるため（決定2）
- [x] 4.3 URL 組み立ての重複（scheme/host 判定）が1箇所に集約されたことを確認する
- [x] 4.4 `useBoardSocket` の内部を `useWebSocket` + `createEventHook` で組み直す（`autoReconnect: { delay: 2000 }` で現行の2秒に揃える）
- [x] 4.5 `useBoardSocket` を `createSharedComposable` で包み、モジュール変数 `shared` を除く
- [x] 4.6 `NotificationToaster` が `app.vue` 直下に在り続けること（常駐購読の置き場）を確認する
- [x] 4.7 `onNotification` の返り値が `createEventHook` の `on`（scope 破棄で自動解除）になり、`Set` + `onScopeDispose` が消えたことを確認する
- [x] 4.8 レイアウトを跨いで画面遷移しても接続が張り替わらないことを E2E で確認する（全150件パス）
- [x] 4.9 サーバー再起動後に再接続し、通知が再び届くことを確認する（`autoReconnect` + `e2e/degraded.spec.ts`）
- [x] 4.10 `useBoardSocket` の参照元が design 記載の5箇所ではなく**8箇所**であることを確認し、proposal を直す（下層3ページが `upstreamConnected` を取っている。`app.vue` と `DocumentEditor.vue` はコメントで言及するだけで呼んでいない）

## 5. @nuxt/ui 置換（決定8）

- [x] 5.1 `customCollections` が「現行パスの登録であって別のアイコンセットの選定ではない」という解釈で進めてよいかをユーザーに確認する（design のリスク欄）
- [x] 5.2 現行の SVG パスを IconifyJSON として `sb:` / `upstream:` の2コレクションに登録する（`app/assets/icons.ts`。絵は変えない）
- [x] 5.3 `customCollections` を `nuxt.config.ts` に設定し、`SbIcon` / `UpstreamIcon` を `UIcon` へ載せ替える（20箇所。2本は削除）
- [x] 5.4 stroke-width / linecap / fill が現行と同一に描画されることを確認する。**`icon.mode: 'svg'` が要る**（既定 `'css'` は CSS mask で描き、パスが DOM に出ない）
- [x] 5.5 `data-icon` 等のテスト用属性の代替を決め、`e2e/upstream-style.spec.ts` / `e2e/design-token.spec.ts` を張り直す（`svg.iconify--sb path` で絞る。種別の区別が要るトーストはパスそのもので絞る）
- [x] 5.6 `EmptyState.vue` を `UEmpty` + `:ui` に載せ替え、`sb-empty` の寸法（py-12・48px アイコン・無彩色）を再現する。`variant="naked"` + `:ui` の置換関数（`SlotClassReplacer`）で既定テーマを外す。不要になった `.sb-empty` 系 CSS 29行を削除。`text-lg`/`text-sm` に対の line-height が付く差は、本家も同じユーティリティを使うため許容（2026-08-25 ユーザー確認）
- [x] 5.7 `RecordList.vue` を `UTable` + `:ui` に載せ替え、`sb-datatable` の様式（行頭 40px タイル・2段テキスト・目のアイコン）を再現する。**`:ui` の各 slot に関数を渡して既定テーマを置換する**（併記だと utilities layer の既定が components layer の `.sb-datatable` に勝つ）
- [x] 5.8 `RecordList` の行クリック遷移とリンクによるキーボード操作が両立することを E2E で確認する。**`onSelect` は使わない**（渡すと `tr` に `role="button"` と `tabindex="0"` が付き、押せない行にも Enter で何も起きないタブストップができる）。代わりに `NuxtLink` を `after:absolute after:inset-0` で行いっぱいに広げる
- [x] 5.9 5.7 / 5.8 とも満たせたため据置に戻していない
- [x] 5.10 `NotificationToaster` を `useToast` に載せ替える（`duration: 5000`・`progress: false`・本体クリックに動作を持たせない）。**`closeIcon: 'upstream:close'` が必須**（`@iconify-json/*` が無く、既定の lucide `x` が解決できず × が空になる）
- [x] 5.11 `onNotification` → `toast.add()` の変換と tone → 色クラスのマップを残し、本家の階調（`*-50/-200/-800`・ダーク `*-900/20`）を `:ui` で再現する。`ring-0` で既定の ring を打ち消す
- [x] 5.12 右上固定・縦積みを toaster の position 設定で再現する（`<UApp :toaster="{ position: 'top-right' }">`。既定は右下）
- [x] 5.13 `e2e/toast.spec.ts` / `e2e/notifications.spec.ts` のセレクタを `UToast` の構造へ張り直し、`openspec/specs/notification-toast` の Requirement 全件（5秒消滅・手動 dismiss・1行テキスト・押しても何も起きない・4種の色・フォーカスを奪わない・初回ロードで過去分を出さない）が通ることを確認する
- [x] 5.14 × の `aria-label` を日本語に戻す（`toast.add()` の `close` prop で渡す。既定は英語 "Close"）

## 6. AgentQuestion の再編（決定3・決定4）

- [x] 6.1 `AgentQuestion.vue` を新設する（話題タグ → 詳細説明 → 問い本文 → 選択肢 → 自由入力欄 → notice。寸法はモーダル側の `text-lg` / `p-3` / `rows=2` に統一）。置き場は `app/components/` 直下（auto-import 名が `AgentQuestion` になるのはここだけ）
- [x] 6.2 `waiting` / `waitingMessage` / `answered` を props で受け、待機中は `WaitingIndicator` を面の中に出す
- [x] 6.3 送信ボタンを component 内に置き、文言を `submitLabel` props で受ける。排他・notice・送信判定も component に閉じ、親へは `@answer` だけを出す
- [x] 6.4 問いが置き換わったとき・開き直したときに書きかけを空に戻す挙動を引き継ぐ（開き直しは `UModal` の `unmountOnHide` 既定 true で body ごと破棄される）
- [x] 6.5 画面1（`index.vue`）を `<AgentQuestion submit-label="送信">` に書き換える
- [x] 6.6 画面2（`proposal.vue`）を `<UModal>`（`:dismissible="false"` `:close="false"`）の body に `<AgentQuestion submit-label="答える">`、footer に注記だけを置く形に書き換える
- [x] 6.7 **問いが長いとき送信ボタンがスクロール領域の外に出る**問題を直す。component 内を「中身（`overflow-y-auto`）」と「ボタン」の2段にし、`:ui="{ body: 'flex min-h-0 flex-col overflow-y-hidden' }"` でモーダル側のスクロールを止める。区切り線は元々消えない（footer slot は描画され続けるため）
- [x] 6.8 `QuestionCard.vue` と `AgentQuestionModal.vue` を削除する
- [x] 6.9 `openspec/specs/agent-question` の Requirement 全件（オーバーレイで開く・並びが画面で変わらない・排他・答えるまで閉じない・待機は面の中・書きかけを持ち越さない・送り直せる）が通ることを E2E で確認する（`e2e/agent-question.spec.ts` を新規追加。12件）

## 7. 承認画面の注釈と差し戻し（決定9・2026-08-25 追加）

- [x] 7.1 `app/components/review/ApprovalAnnotator.vue` を新設し、`preview` / `annotate` / `side-by-side` の3面と指摘の一覧を持たせる。`review/` の既存部品（`AnnotateSource` / `CommentCard` / `CommentModal`）と `useAnnotations` を使い回す
- [x] 7.2 `preview` の中身を `#preview` スロットで呼ぶ側から受ける。**面を切り替えてもスロットを外さない**（外すと対象文書の編集の直しかけが黙って消える）
- [x] 7.3 `app/pages/projects/[projectId]/approvals/[approvalId].vue` を、対象文書の取得と保存だけを持ち、面と指摘は `ApprovalAnnotator` に委ねる形へ書き換える
- [x] 7.4 `shared/types.ts` に `ApprovalActionName` / `ApprovalRevisionRecord` / `ApprovalRevisionPayload` を足す。記録の形は本家 `ApprovalsPage.tsx` に合わせる（`decision` / `comments` / `summary` / `timestamp`）
- [x] 7.5 `useProjectApi` に `respondToApproval()` を足す。失敗の理由は保存の `reasonOf` と混ぜず `approvalReasonOf` を別に持つ
- [x] 7.6 サーバの `[action].post.ts` に `needs-revision` を足し、`annotations` / `comments` を zod で検証する。`response` の上限を 2000 → 200000 に上げる（差し戻しの `response` はコメントから組み立てた要約で件数に比例して伸びる）
- [x] 7.7 境界で弾く3つを実装する（差し戻しでコメント0件 → `revision-needs-comments`、却下で理由が空 → `reject-needs-reason`、承認・却下に注釈 → `annotations-need-revision`）
- [x] 7.8 delta spec `specs/project-workspace/spec.md` の Requirement 全件が通ることを E2E で確認する（`e2e/approval-annotation.spec.ts`。10件）
- [x] 7.9 差し戻しの成功後に保留中の一覧を捨てる。一覧ページと詳細ページは `usePendingApprovals` の**自動生成キーを共有**しており、捨てないと一覧が詳細ページで取った古い中身をそのまま描く（実測: 一覧 API への GET が1件も出ない）。`pendingApprovalsKey()` を明示キーにして `refreshNuxtData()` で捨てる
- [x] 7.10 承認画面を preview 先頭にした変更に `e2e/workspace.spec.ts` を追随させる（「対象文書の中身が読める」「承認依頼の通知からその承認依頼へ着地する」の2件。`document-input` → `document-content` + `document-edit`）

## 8. docs/specs の追随

- [x] 8.1 `docs/specs/core/file-components.md` の `question/` 区分を `AgentQuestion` 1本に改め、置換した components の記述を更新する
- [x] 8.2 `docs/specs/core/file-composables.md` を集約後の一覧（チャンネル2本 → 汎用1本 + ラッパ2本）に改める
- [x] 8.3 `docs/specs/reference/stroke-modules.md` の `AgentQuestionModal` の規定を `AgentQuestion` へ改める（送信ボタンが外殻の責務であることを含む）
- [x] 8.4 `docs/specs/plan/composables-library-replacement.md` / `components-library-replacement.md` に、design で確定した点（決定1〜9）を反映する（決定6 の改訂を含む）

## 9. delta spec

- [x] 9.1 `skip_specs: true` を取り下げ、proposal の Capabilities 欄を新設1・改定1に改める
- [x] 9.2 `specs/markdown-rendering/spec.md`（新設）を書く。生 HTML を要素にしない・mermaid を図にする・それ以外をコードブロックにする
- [x] 9.3 `specs/project-workspace/spec.md`（改定）を書く。差し戻しを持たない記述を外し、注釈と3フィールド送信を定める
- [x] 9.4 `.openspec.yaml` から `skip_specs: true` を外す（**ユーザーの操作。`Edit(/openspec/changes/**/.openspec.yaml)` が deny のため**）

## 10. 検証と commit

- [x] 10.1 `yarn typecheck` を通す
- [x] 10.2 `yarn test` を通す
- [x] 10.3 `yarn build` で `.output` を作り直したうえで `yarn test:e2e` を全件通す（`playwright.config.ts` は `node .output/server/index.mjs` を起動するだけで、`yarn test:e2e` にビルド段が無い）。199件パス
- [x] 10.6 e2e のポートをワークツリー専用にする。3ワークツリー（base2 / base3 / base4）が既定の 3199/5199 を共有しており、**別のワークツリーが e2e を起動した瞬間にこちらの web サーバが落ちていた**（実測: `[WebServer] Killed` が2回、base2 の `.e2e-tmp` 更新時刻と一致）。base3 は 3300/5300
- [x] 10.4 `openspec validate replace-handrolled-with-libraries --strict` を通す
- [x] 10.5 ここまでの成果物を1つの commit にまとめる（`63cd650`。70ファイル。別 change の文書・ADR-0012・`openspec/config.yaml` の構文修正・計測スクリプトは含めない）
