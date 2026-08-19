# refine-project-name-display

## Why

画面2のプロジェクト名欄には AI の提案がそのまま初期値として当たるため、既にあるプロジェクトと衝突した名前が候補のまま表示されうる（ストロークを重ねている間に同名のプロジェクトが作られる場合を含む）。また、承認の確認と承認後の表示に `/opt/projects/<name>` というパス——内部の配置の観念——がそのまま出ている。

## What Changes

- 画面2へ名前の候補を当てる際、既存のプロジェクトの名前を除いた（衝突しない）候補にする。突合は表示のたびに行い、途中で名前が取られていても衝突しない候補に変わる
- 承認の確認と承認後の表示からパスを外し、プロジェクト名だけで示す

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `proposal-review`: 「プロジェクト名を提案し、ユーザーが確定する」に候補の衝突除きを加える。「承認はプロジェクト生成の唯一の引き金」と「承認後は承認と差し戻しを提供しない」の表示からパスを外す

## Impact

- `server/utils/session-view.ts` — 候補を当てる際の既存プロジェクト名との突合
- `server/utils/conflict.ts` / `server/utils/project.ts` — 既存名の参照の流用
- `shared/types.ts` — `projectPath` を表示に使わない形への調整
- `app/pages/s/[sessionId]/proposal.vue` — 承認確認・承認後表示のパス除去
- 本 change は migrate-claude-p-to-api-endpoint と独立（候補の供給が `PROJECT_NAME:` 行でも endpoint でも成立する）
