# document-structure-migration — Design

## Context

動機は proposal.md - Why を参照。ここでは書き方の判断だけを扱う。

- 対象3ファイルは「規範への対応（前半）＋ 統合前の棚卸しの記録（後半）」という2部構成を持つ（`file-components.md` / `file-composables.md`）。棚卸しの記録は歴史であり、消さずに注記で現状を示す方針が既にとられている
- 書き換えの中身はユーザーと合意済み。数値の修正は全て実ファイルで裏を取ってから書く
- 実装コードには触れない。実装のリファクタは既存5本の change（reorganize-components / flatten-composables / relocate-stroke-routes / fold-stroke-css / move-conventions-to-steering）と、新たに起こす change が担う

## Goals / Non-Goals

**Goals:**

- 3ファイルを実装の現状（実測値）と合意済みの方向に一致させる
- 削除済み・保留・未定の区別を文中で明示し、読み手が「決まったこと」と「検討中のこと」を取り違えないようにする
- 書き出し中に見つかったリファクタ要素を change として登録する（既存5本と重ならないものだけ）

**Non-Goals:**

- `useProposalReview` の分割案の確定（flatten-composables の design で決める）
- markdown 操作コンポーネントの詳細設計（名前の最終決定・props 設計は集約の change で行う）
- 色定数を CSS へ移す実装方式の確定（「検討」として方向のみ書く）
- 棚卸しの記録（統合前の歴史）の削除・書き直し

## Decisions

### 1. 棚卸しの記録は消さず、注記で現状を重ねる

削除済み `FollowupModal.vue` の3箇所（一覧表・ディレクトリ図・型依存表）は、記録を残したまま「削除済み」の注記を付ける。記録は統合前の実態の証拠であり、消すと「なぜ今の区分に至ったか」が追えなくなる。代替（記述ごと削除）は履歴の喪失なので退ける。

### 2. 数値の修正は実測値のみ

棚卸し章の数値は 2026-08-24 の実測に置き換える（実測結果は下記）。推定・概算は書かない。

- `useProposalReview.ts` — 412行、return は **39 プロパティ**（本文と局面7 / コメント1 / 表示4 / モーダル13 / 問い返し2 / 操作12）
- `useProjectApi.ts` — 192行、**11 export**（`saveTargetOf` を含む）
- `useSteeringDocuments.ts` — 50行
- `useAgentQuestion.ts` — 132行。棚卸しから漏れているため追加
- `useWaitingRetry` のポーリング先 — `/api/strokes/<id>`（`useWaitingRetry.ts:27` で実測）

### 3. 未定・検討・保留は、その語を明示して書く

- markdown 集約 — 方向（`MarkdownNodes.ts` → `DocumentView.vue` へマージして Vue コンポーネント化、`MarkdownComponent` または `MarkdownView` / `MarkdownEdit` の対へ集約、本家 spec-workflow-mcp の mdx（MDXEditorWrapper）と md4x の使い方を参考）は書くが、「詳細設計は未定」と明記
- 色定数 — 「色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ」へ書き換え、**（検討）** を付ける。旧記述「`shared/` へ追い出す」は方向が変わったので残さない
- `useProposalReview` の分割 — 分割案を固定せず「markdown コンポーネント集約の確定後、flatten-composables の design で決める」と保留を明記

### 4. 写像表は「移行前パス → 移行後パス」の対で書く

`file-composables.md` に移行後パスの写像表を追加する。対象はポータル側4本（`shared/useBoardSocket.ts` / `shared/useRelativeTime.ts` / `workspace/useProjectApi.ts` / `workspace/useSteeringDocuments.ts` → いずれも `composables/` 直下）。ストローク側6本は既に直下で移動なし、と明記する。あわせて「平置き後も明示 import を維持する（auto-import は使わない。`nuxt.config` の `autoImport: false` 前提）」を書く。

### 5. 新規 change は既存5本との重なりで選別する

書き出し中に見つかったリファクタ要素のうち、既存5本の範囲（components 再編 / composables 平置き / ルート移設 / CSS 畳み込み / 規約の steering 移動）に入るものは新 change にせず報告のみ。既知のバグ1件は範囲外なので change を起こす:

- `fix-agent-question-api-path` — `app/composables/useAgentQuestion.ts:58` が `/api/${id}` を基底にしており、実ルート `/api/strokes/[id]/answer` / `/api/strokes/[id]/invoke-agent` と食い違う。回答送信が 404 になる（実ファイルで確認済み）

各新規 change には README.md（1〜3行）を置く。`.openspec.yaml` への note 記載は行わない（permission）。

## Risks / Trade-offs

- [棚卸しに注記を重ねると、記録と現状の2層が読みにくくなる] → 注記は「（削除済み）」「※2026-08-24 実測」のような短い定型に絞り、本文の書き直しはしない
- [「検討」「未定」と書いた項目が、そのまま放置される] → structure-migration.md の課題表に行として載せ、実施 change（flatten-composables / 集約 change）への参照を残す
- [数値はまた陳腐化する] → 実測日を添えて書く。恒久的な同期は目指さない（棚卸しはスナップショットである、と文書自身が既に宣言している）

## Migration Plan

ドキュメント編集のみ。デプロイ・ロールバックは無い。編集順は依存が無いため任意だが、file-composables.md（量が最大）→ file-components.md → structure-migration.md の順で行う。

## Open Questions

- 色定数の CSS 化の実装方式（CSS カスタムプロパティ名、`HighlightColor` 型の扱い）— fold-stroke-css または flatten-composables の design で決めればよく、本 change の記述は「検討」の方向付けに留まる
