# fix-relative-time-hydration

## Why

相対時刻の表示が SSR とクライアントで食い違い、Hydration mismatch を起こしている。

`formatRelativeTime`（`app/composables/useRelativeTime.ts`）は基準時刻の既定を `Date.now()` にしている。SSR で描いたときとブラウザで描き直したときでは実行時刻が違うため、刻みの境界をまたぐと文言が変わる（「19時間前」↔「20時間前」、7日の境界では相対表示と絶対日時が入れ替わる）。呼び出し側5画面はいずれも基準時刻を渡していない。

害は表示のちらつきに留まらない。

- **dev のログが VNode のダンプで埋まる。** Vue は mismatch の報告に対象の VNode を添える。それが JSON 化されてログへ出るため、警告1件あたり数百 KB になる。実測 2026-08-28: `yarn dev` のログが 267 行で **2.7MB**、`children` キーが 1,666 回。プロジェクト一覧のテーブル（プロジェクト名・状態・最終更新）がそのまま何度も吐き出されていた
- そのせいで、調べたい `[stroke-board]` のログが埋もれて探せない
- `Hydration completed but contains mismatches.` が ERROR として出るため、本物の異常と見分けがつかない

実測は `provide-operations-via-mcp` の検証中に見つけた（ストロークの往復とは無関係の既存の不具合）。

## What Changes

- **変更**: 相対時刻の基準時刻を、SSR とクライアントで同じ値にする。`formatRelativeTime` の既定を `Date.now()` にしたままにせず、描画の基準として1つ決めた値を使う
- **変更**: 呼び出し側5画面（`pages/projects/index.vue` / `pages/index.vue` / `pages/projects/[projectId]/specs/index.vue` / 同 `tasks/index.vue` / 同 `steering/index.vue`）を、その形に合わせる

方式（サーバーの時刻を配る・クライアントでのみ描く・一定の粒度に丸める等）は design で決める。

## Capabilities

### New Capabilities

- `portal/relative-time`: 一覧に出る相対時刻の表示規定。サーバーで描いた結果とブラウザで描き直した結果が一致すること、それを理由に描き直しの不一致を出さないこと。

## Impact

- **影響コード**: `app/composables/useRelativeTime.ts` と、`formatRelativeTime` を呼ぶ5画面
- **影響しないもの**: ストロークの往復・MCP ツール・サーバー API。表示だけの問題である
- **副次的な効果**: dev のログが実用的な大きさに戻る（2.7MB → 警告が消えれば数十 KB 規模）
