## MODIFIED Requirements

### Requirement: 実行の記録は invocation の4値で持つ

システムは実行の状態を、対象ごとの `invocation`——`running`（実行中）・`idle`（平常）・`failed`（失敗）・`error`（自動では回復しない終端）——として記録する SHALL。承認以降の局面（phase が `approved` または `activated`）の対象も `invocation` を持つ SHALL。

`invocation` の書き込みは `invocation` を操作する endpoint（`api/stroke/submission`、A8）を通してのみ行う SHALL。claude（エージェント）と画面から書いてはならない（MUST NOT）。ファイルを直接読んで実行状態を判定してはならない（MUST NOT）——参照は API の応答から得る。

`invocation` は実行の記録であり、プロジェクトの完成の記録ではない。`invocation` の書き込みを、生成が成功で決着したことの合図にしてはならない（MUST NOT）——成功の決着は完成の記録（`api/session/activate`）だけが出す。

#### Scenario: 起動で running になる

- **WHEN** 起動の要求が受理され実行が始まる
- **THEN** invokeAi が `invocation` を `running` に変える

#### Scenario: 承認後の対象も記録を持つ

- **WHEN** 昇格したプロジェクトで実行が起こる
- **THEN** その `invocation` も同じ4値で記録される

#### Scenario: 完成した対象も記録を持つ

- **WHEN** 完成を記録したプロジェクトで steering の実行が起こし直される
- **THEN** その `invocation` も同じ4値で記録され、会話は前の続きから始まる

#### Scenario: idle への書き込みは成功の決着にならない

- **WHEN** 生成中のプロジェクトの `invocation` が `idle` に書かれる
- **THEN** それだけでは成功の決着は上層へ届かない。届くのは完成が記録されたときである

### Requirement: 完了は output stream で検知して idle に変える

システムは実行の完了を、invokeAi が子プロセスの output stream を見て検知する SHALL。AI 自身に完了を告知させてはならない（MUST NOT）。

完了を検知したら、**その実行で作業が行われたかを併せて確かめる** SHALL。行われていなければ `invocation` を `failed` に変える SHALL。プロセスが正常終了したことだけをもって `idle` にしてはならない（MUST NOT）——何もせずに終わった実行が `idle` で終わると、巡回は `failed` だけを拾うので誰も起こし直さず、その対象はそこで止まったまま残る。何をもって作業が行われたと見るかは、工程ごとに呼び出し側が渡す SHALL。起動処理がその判定を工程から導いてはならない（MUST NOT）——用途の違いは渡される値の違いだけで表す。

その実行が**生成中のプロジェクト（phase が `approved`）の steering** であれば、システムは `invocation` を `idle` に変える前に完成の記録（`api/session/activate`）を試みなければならない（SHALL）。記録が受理されたときだけ `invocation` を `idle` に変える SHALL。記録が受理されなかったとき——承認依頼が無い、記録先に届かない——は `invocation` を `failed` に変え、起こし直す対象として残す SHALL。ただし、断られた時点で既に完成が記録されている（この実行の起動後に別の書き手が記録した）対象は、受理されたものと同じに扱う SHALL——目的は果たされており、`failed` に倒すと完成済みの対象を起こし直し続ける。**この実行では完成の記録の受理が作業の判定に代わる**（SHALL）。承認依頼が在れば作業は済んでおり、その実行が文書を提出したかどうかを別に問うてはならない（MUST NOT）——起こし直しの実行は前の実行で文書を出し終えていることがあり、文書の提出を先に問うと、承認依頼が在るのに誰も完成を記録できないまま上限まで落ちる。

生成中でない対象の実行——ストローク、および完成済みプロジェクトの steering——では、作業が行われていれば `invocation` を `idle` に変える SHALL。完成の記録を試みてはならない（MUST NOT）。

#### Scenario: 作業が完了する

- **WHEN** ストロークの子プロセスが指示された作業を終える
- **THEN** invokeAi が output stream で完了を検知し、`invocation` を `idle` に変える

#### Scenario: 何もせずに終わった実行は idle にならない

- **WHEN** 生成中でない対象の子プロセスが正常終了したが、その実行では作業が1つも行われていない
- **THEN** `invocation` は `idle` にならず `failed` に変わり、巡回の対象になる

#### Scenario: steering が承認依頼を出して完了する

- **WHEN** 生成中のプロジェクトの steering が承認依頼を出して終える
- **THEN** invokeAi は完成を記録し、それが受理されてから `invocation` を `idle` に変える。プロジェクトは完了として一覧に出る

#### Scenario: steering が承認依頼を出さずに完了する

- **WHEN** 生成中のプロジェクトの steering が文書を提出したが、承認依頼を1件も出さずに終える
- **THEN** 完成の記録は受理されず、invokeAi は `invocation` を `failed` に変える。巡回が起こし直す

#### Scenario: 起こし直しが承認依頼だけを出して完了する

- **WHEN** 前の実行で文書を出し終えた生成中のプロジェクトの steering が起こし直され、文書を提出せず承認依頼だけを出して終える
- **THEN** 完成の記録が受理され、invokeAi は `invocation` を `idle` に変える。文書の提出が無いことを理由に `failed` にはしない

#### Scenario: 実行中に別の書き手が完成を記録していた

- **WHEN** 生成中として起こした steering の実行中に、起動時の書き上げが同じ対象の完成を記録し、実行の完了時に完成の記録が「既に完成している」と断られる
- **THEN** invokeAi は受理と同じに扱い、`invocation` を `idle` に変える

#### Scenario: 完成済みプロジェクトの steering が完了する

- **WHEN** 完成を記録済みのプロジェクトで起こし直した steering が終える
- **THEN** invokeAi は完成の記録を試みず、`invocation` を `idle` に変える
