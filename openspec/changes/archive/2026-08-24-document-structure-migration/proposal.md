# document-structure-migration — Proposal

## Why

`docs/specs/` の構造移行まわり3ファイル（`core/file-components.md` / `core/file-composables.md` / `plan/structure-migration.md`）が実装の現状からずれている。棚卸しの数値（行数・プロパティ数・export 数）が古く、削除済みコンポーネント（`FollowupModal.vue`）がそのまま載り、`useAgentQuestion` が棚卸しから漏れている。また、ユーザーと合意済みの方向（markdown 操作コンポーネントへの集約、色定数の CSS への移動、移行後パスの写像、明示 import の維持、`useProposalReview` 分割の保留）が文書に反映されていない。移行実施の change（reorganize-components / flatten-composables ほか）が正しい前提で走れるよう、先に文書を実態と合意へ揃える。

## What Changes

- `docs/specs/core/file-components.md`
  - markdown 集約の方向を追記（`MarkdownNodes.ts` の `DocumentView.vue` へのマージと Vue コンポーネント化、markdown 操作コンポーネントへの集約。詳細設計は未定と明記）
  - 統合前の棚卸し記録にある削除済み `FollowupModal.vue` の記述3箇所へ削除済みである旨を明記（記録は消さない）
- `docs/specs/core/file-composables.md`
  - 移行後パスの写像表を追加（ポータル側4本の平置き先、ストローク側6本は移動なし）
  - 平置き後も明示 import を維持する（auto-import 不使用）ことを明記
  - `useProposalReview` の分割は flatten-composables の design へ保留と明記
  - 色定数の行を「色の実値は CSS へ移し、データは色名のみ持つ（検討）」へ書き換え
  - 棚卸し章の陳腐化を実測で修正（39 プロパティ、`saveTargetOf` 追加、`useAgentQuestion` の追加、行数、ポーリング先 `/api/strokes/<id>`）
- `docs/specs/plan/structure-migration.md`
  - 色定数の行を上記の方向へ書き換え
  - markdown 操作コンポーネントの集約を課題行として追加

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。ドキュメントのみの変更で、spec レベルの振る舞いは変わらない（`skip_specs: true` 相当。`.openspec.yaml` への記載は本 change の作業範囲外）。

## Impact

- 変更するのは `docs/specs/` の3ファイルのみ。アプリのコード（`app/` / `server/` / `shared/`）には触れない
- 既存の移行 change 5本（reorganize-components / flatten-composables / relocate-stroke-routes / fold-stroke-css / move-conventions-to-steering）の前提文書が正確になる
- 書き出し中に見つかったリファクタ要素は、既存5本と重ならないものだけ新 change として起こす（既知: `useAgentQuestion.ts:58` の API パス不一致バグ）
