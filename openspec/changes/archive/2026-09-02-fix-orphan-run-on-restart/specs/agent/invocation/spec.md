## MODIFIED Requirements

### Requirement: 実行の記録は invocation の4値で持つ

システムは実行の状態を、対象ごとの `invocation`——`running`（実行中）・`idle`（平常）・`failed`（失敗）・`error`（自動では回復しない終端）——として記録する SHALL。phase が `approved` の対象も `invocation` を持つ SHALL。

`invocation` の書き込みは `invocation` を操作する endpoint（`api/stroke/submission`、A8）を通してのみ行う SHALL。claude（エージェント）と画面から書いてはならない（MUST NOT）。ファイルを直接読んで実行状態を判定してはならない（MUST NOT）——参照は API の応答から得る。

#### Scenario: 起動で running になる

- **WHEN** 起動の要求が受理され実行が始まる
- **THEN** invokeAi が `invocation` を `running` に変える

#### Scenario: 承認後の対象も記録を持つ

- **WHEN** 昇格したプロジェクトで実行が起こる
- **THEN** その `invocation` も同じ4値で記録される
