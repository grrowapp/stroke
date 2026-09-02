# api/stroke/submission Specification

> **この capability の性格は未確定である（2026-09-02）。** ユーザーが承認したのは「`submission` で proposal も steering も提出する。`proposal`（A7）は無くなる」形であり、以下の「`invocation` を操作する」という規定はそれと食い違う。エージェントが archive 済みの design.md を承認の証拠として扱い、ユーザーの判断を捻じ曲げた結果である（`docs/adr/0019-approval-is-not-inferred-from-archive.md`）。**以下を正として扱わないこと。**

## Purpose
`invocation` を操作する endpoint（A8）を規定する。実行の記録の書き込みをこの1口に集め、起動・完了・失敗・終端のどの遷移も同じ形式で行わせる。

## Requirements

### Requirement: A8 POST /api/strokes/:id/submission — invocation を操作する

システムは `POST /api/strokes/:id/submission` を公開する SHALL。値（`running` / `idle` / `failed` / `error`）を指定して、その対象の `invocation` を指定された値に変える。どの値も同じ口・同じ形式で変える SHALL。

この口を叩くのは invokeAi だけとする SHALL。claude（エージェント）と画面に叩かせてはならない（MUST NOT）。

4値以外の値の指定は受理してはならない（MUST NOT）——エラーを返し、何も変えない。存在しない id への操作は受理してはならない（MUST NOT）——エラーを返し、何も変えない。

#### Scenario: 値を指定して変える

- **WHEN** invokeAi が存在する対象の id と `running` / `idle` / `failed` / `error` のいずれかを指定して `POST /api/strokes/:id/submission` を叩く
- **THEN** その対象の `invocation` が指定された値に変わる

#### Scenario: 規定に無い値を指定する

- **WHEN** 4値以外の値が指定される
- **THEN** システムは受理せず、エラーを返し、`invocation` は変わらない

#### Scenario: 存在しない id で操作する

- **WHEN** 存在しない id で `POST /api/strokes/:id/submission` が叩かれる
- **THEN** システムは受理せず、エラーを返し、何も変えない
