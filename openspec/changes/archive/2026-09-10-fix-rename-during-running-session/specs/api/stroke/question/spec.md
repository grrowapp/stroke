## MODIFIED Requirements

### Requirement: A5 POST /api/strokes/:id/question — 問いの提出を受ける

システムは `POST /api/strokes/:id/question` を公開する SHALL。ストロークの問いも差し戻しへの問い返しも同じ口で受け、エージェントに区別を求めない。提出される問いは次の構造に従う。

- `header`（12字以内）— 話題タグ
- `detail`（300字以内）— 問いに関する詳細な説明
- `question`（20字以内）— 問い本文
- `options`（1件以上5件以内）— 選択肢。各要素は `label`（見出し、1〜5語）と `description`（50字以内。それを選ぶと何がどうなるかの説明）を持つ
- `recommended` — 推奨の印。`true` の選択肢は多くとも1つ

**この endpoint の責務は提出を記録することだけである。** 画面へ配信してはならない（MUST NOT）。配信は、この提出を行った実行の決着として invokeAi が行う（`agent/invocation`「完了は output stream で検知して idle に変える」）。endpoint が配信すると、claude の実行がまだ終わっていないのに回答できる状態が立つ。

スキーマを満たさない提出は受理してはならない（MUST NOT）。`label` の「1〜5語」は形式の規定として文言で伝えるものとし、語数による機械的な検証は行わない。存在しないセッション id への提出は受理しない SHALL。

#### Scenario: 問いを提出する

- **WHEN** エージェントが構造を満たす問いを `POST /api/strokes/:id/question` へ提出する
- **THEN** システムはそれを今の1問として記録し、受理を返す。画面への配信はこの時点では起こらない

#### Scenario: 実行の決着で画面に届く

- **WHEN** 問いを提出した実行が完了し、invokeAi が決着する
- **THEN** 記録された今の1問が画面へ届く

#### Scenario: スキーマを満たさない問いを提出する

- **WHEN** 提出が構造を満たさない（規定の長さ・件数の超過を含む）
- **THEN** システムは提出を受理せず、スキーマを満たさないことをエージェントへ返す

#### Scenario: 存在しないセッション id で提出する

- **WHEN** 存在しないセッション id に問いが提出される
- **THEN** システムは受理せず、エラーを返す
