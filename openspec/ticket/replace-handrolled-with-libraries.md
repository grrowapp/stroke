# replace-handrolled-with-libraries

app/composables/ と app/components/ のライブラリ置換・再編・markdown 統一を1本で行う（接点が多く分割すると中間状態が生まれるため統合。2026-08-25 合意）。

定義（承認済み・本体）:
- `docs/specs/plan/composables-library-replacement.md`（spec-workflow 2026-08-25 承認）
- `docs/specs/plan/components-library-replacement.md`（spec-workflow 2026-08-25 承認。santa-method + prototype 実測で検証済み）

方針の序列: **本家に近づけるを最大限優先**（検証基準は「本家と同一」）→ 制約記述を據置理由にしない → **自前実装の禁止**。

範囲（要約。詳細は定義側）:
- composables 置換: `useBoardSocket`（useWebSocket + 生存期間担保。方式 a/b は design で確定）/ `useRelativeTime`（formatTimeAgo）/ `useWaitingRetry`（timer のみ useIntervalFn）
- composables 集約: `useQuestionChannel` + `useProposalChannel` → 汎用チャンネル1本
- components 置換（条件付き）: `SbIcon`/`UpstreamIcon`（UIcon + customCollections、絵は不変）/ `EmptyState`（UEmpty）/ `RecordList`（UTable）/ `NotificationToaster`（useToast。useBoardSocket 置換と配線が絡む）
- components 部分置換: `DocumentEditor`（useEventListener / useTimeoutFn / useMounted）/ `ApprovalCard`（Intl.DateTimeFormat、`month: 'long'`）/ `DocumentView`（`<MDC>` へ）
- components 再編: `QuestionCard` + `AgentQuestionModal` → `AgentQuestion` 1本（外殻はページへ畳む。`useAgentQuestion` と配線が絡む）
- 削除: `MarkdownNodes.ts`
- markdown 統一: 全画面 `@nuxtjs/mdc`（`<MDC :value>` + `anchorLinks: false`）。依存は `marked` / `isomorphic-dompurify` / `md4x` 削除 → `@nuxtjs/mdc` 追加。mermaid 後段の導入是非は design で確定
- 仕様改定が必要: `file-components.md`（question/ 区分）・`stroke-modules.md`（AgentQuestionModal の規定）

関連: `flatten-composables`（置き場）・`separate-composable-responsibilities`（責務分離）・`realign-component-composable-boundaries`（境界の切り直し）とは別軸。
