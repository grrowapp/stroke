# document-structure-migration — Tasks

## 1. 裏取り（実測）

- [x] 1.1 `app/composables/` の全ファイルの行数と置き場を実測する（`shared/` `workspace/` ＋直下）
- [x] 1.2 `useProposalReview.ts` の return のプロパティ数を数える（39 を確認）
- [x] 1.3 `useProjectApi.ts` の export 一覧を取る（`saveTargetOf` を含む 11 export を確認）
- [x] 1.4 `useWaitingRetry.ts` のポーリング先と `useAgentQuestion.ts:58` の API 基底パスを実ファイルで確認する
- [x] 1.5 `app/components/` の実在一覧で `FollowupModal.vue` の削除と `MarkdownNodes.ts` / `DocumentView.vue` の現状を確認する

## 2. docs/specs/core/file-composables.md

- [x] 2.1 移行後パスの写像表を追加する（ポータル側4本 → 直下、ストローク側6本は移動なし）
- [x] 2.2 平置き後も明示 import を維持する（auto-import 不使用、`autoImport: false` 前提）と明記する
- [x] 2.3 `useProposalReview` の分割を「markdown コンポーネント集約の確定後、flatten-composables の design で決める」と保留にする（分割案は固定しない）
- [x] 2.4 色定数の行を「色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ（検討）」へ書き換える
- [x] 2.5 棚卸し章の陳腐化を実測で直す（39 プロパティ / `saveTargetOf` 追加 / `useAgentQuestion` の追加 / 行数 192・50・412 / ポーリング先 `/api/strokes/<id>`）

## 3. docs/specs/core/file-components.md

- [x] 3.1 markdown 集約の方向を追記する（`MarkdownNodes.ts` → `DocumentView.vue` へマージして Vue コンポーネント化、`MarkdownComponent` または `MarkdownView` / `MarkdownEdit` の対へ集約、本家の mdx と md4x を参考。詳細設計は未定と明記）
- [x] 3.2 棚卸し記録の `FollowupModal.vue` 3箇所（一覧表・ディレクトリ図・型依存表）へ削除済みの注記を付ける（記録は消さない）

## 4. docs/specs/plan/structure-migration.md

- [x] 4.1 composables の行の色定数の記述を「色は CSS へ、データは色名のみ（検討）」へ書き換える
- [x] 4.2 「markdown 操作コンポーネントの集約（MarkdownNodes の component 化を含む）」を課題行として追加する

## 5. リファクタ要素の change 登録

- [x] 5.1 `openspec new change "fix-agent-question-api-path"` を起こし、README.md（1〜3行の要約）を書く（`.openspec.yaml` への note は書かない）
- [x] 5.2 書き出し中に見つかった他の要素を、既存5本（reorganize-components / flatten-composables / relocate-stroke-routes / fold-stroke-css / move-conventions-to-steering）との重なりで選別し、重ならないものだけ change ＋ README.md を起こす。重なるものは最終報告へ回す（新規は 5.1 の1本のみ。他は既存5本と重なるため報告のみ）

## 6. 仕上げ

- [x] 6.1 3ファイルの相互参照（`structure-migration.md` ↔ `file-components.md` / `file-composables.md`）が書き換え後も成立していることを確認する
- [ ] 6.2 成果物を git に commit する（本 change の全編集をまとめて1コミット）※本セッションは git 操作禁止のため未実施。ユーザーの実施待ち
