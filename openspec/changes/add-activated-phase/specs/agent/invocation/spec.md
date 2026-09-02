## MODIFIED Requirements

### Requirement: 実行の記録は invocation の4値で持つ

システムは実行の状態を、対象ごとの `invocation`——`running`（実行中）・`idle`（平常）・`failed`（失敗）・`error`（リトライ上限到達の終端）——として記録する SHALL。承認以降の局面（phase が `approved` または `activated`）の対象も `invocation` を持つ SHALL。

`invocation` の書き込みは `invocation` を操作する endpoint（`api/stroke/submission`、A8）を通してのみ行い、書き込むのは invokeAi だけとする SHALL。ファイルを直接読んで実行状態を判定してはならない（MUST NOT）——参照は API の応答から得る。

#### Scenario: 起動で running になる

- **WHEN** 起動の要求が受理され実行が始まる
- **THEN** invokeAi が `invocation` を `running` に変える

#### Scenario: 承認後の対象も記録を持つ

- **WHEN** 昇格したプロジェクトで実行が起こる
- **THEN** その `invocation` も同じ4値で記録される

#### Scenario: 完成した対象も記録を持つ

- **WHEN** 完成を記録したプロジェクトで steering の実行が起こし直される
- **THEN** その `invocation` も同じ4値で記録され、会話は前の続きから始まる

### Requirement: 完了は output stream で検知して idle に変える

システムは実行の完了を、invokeAi が子プロセスの output stream を見て検知する SHALL。AI 自身に完了を告知させてはならない（MUST NOT）。

完了を検知したとき、その実行が**生成中のプロジェクト（phase が `approved`）の steering** であれば、システムは `invocation` を `idle` に変える前に完成の記録（`api/session/activate`）を試みなければならない（SHALL）。記録が受理されたときだけ `invocation` を `idle` に変える SHALL。記録が受理されなかったとき——承認依頼が無い、記録先に届かない——は `invocation` を `failed` に変え、起こし直す対象として残す SHALL。

生成中でない対象の実行——ストローク、および完成済みプロジェクトの steering——では、完了を検知したら `invocation` を `idle` に変える SHALL。完成の記録を試みてはならない（MUST NOT）。

#### Scenario: 作業が完了する

- **WHEN** ストロークの子プロセスが指示された作業を終える
- **THEN** invokeAi が output stream で完了を検知し、`invocation` を `idle` に変える

#### Scenario: steering が承認依頼を出して完了する

- **WHEN** 生成中のプロジェクトの steering が承認依頼を出して終える
- **THEN** invokeAi は完成を記録し、それが受理されてから `invocation` を `idle` に変える。プロジェクトは完了として一覧に出る

#### Scenario: steering が承認依頼を出さずに完了する

- **WHEN** 生成中のプロジェクトの steering が承認依頼を1件も出さずに終える
- **THEN** 完成の記録は受理されず、invokeAi は `invocation` を `failed` に変える。巡回が起こし直す

#### Scenario: 完成済みプロジェクトの steering が完了する

- **WHEN** 完成を記録済みのプロジェクトで起こし直した steering が終える
- **THEN** invokeAi は完成の記録を試みず、`invocation` を `idle` に変える
