## MODIFIED Requirements

### Requirement: 実行の記録は invocation の4値で持つ

システムは実行の状態を、対象ごとの `invocation`——`running`（実行中）・`idle`（平常）・`failed`（失敗）・`error`（自動では回復しない終端）——として記録する SHALL。phase が `approved` の対象も `invocation` を持つ SHALL。

`invocation` の書き込みは `invocation` を操作する endpoint（`api/stroke/submission`、A8）を通してのみ行う SHALL。書き込めるのは invokeAi と、**起動時の後始末**の2つだけとする SHALL。後始末が書き手になるのは、前のプロセスが残した実行を畳むためであり、その実行の invokeAi はもう居ないからである。この2つ以外が書いてはならない（MUST NOT）。ファイルを直接読んで実行状態を判定してはならない（MUST NOT）——参照は API の応答から得る。

#### Scenario: 起動で running になる

- **WHEN** 起動の要求が受理され実行が始まる
- **THEN** invokeAi が `invocation` を `running` に変える

#### Scenario: 承認後の対象も記録を持つ

- **WHEN** 昇格したプロジェクトで実行が起こる
- **THEN** その `invocation` も同じ4値で記録される

#### Scenario: 起動時の後始末が記録を倒す

- **WHEN** 前のプロセスが残した `running` の実行を、起動時の後始末が畳む
- **THEN** その `invocation` の書き込みも `api/stroke/submission`（A8）を通って行われ、書き手はこの後始末に限られる

## ADDED Requirements

### Requirement: 起動時に、残っている前の実行を後始末してから倒す

サーバーは起動のたびに、`running` として残っている対象のそれぞれについて、**自分が起こした claude がまだ走っていないか**を調べる SHALL。調べた結果によって次のとおり扱う。

- 走っていた場合: まずその claude を終了させる SHALL。終了したことを確かめてから `invocation` を `failed` へ変える SHALL。
- 走っていなかった場合: そのまま `invocation` を `failed` へ変える SHALL。
- 走っているかを調べられなかった、または終了させられなかった場合: `failed` へ変えてはならない（MUST NOT）。`invocation` を `error` へ変え、ユーザーに引き渡す SHALL。自動で起こし直してはならない（MUST NOT）。
- 自分が起こしたと確かめられない実行の `invocation` は変えてはならない（MUST NOT）。

後始末が済むまで、その対象への起動を行ってはならない（MUST NOT）。起こし直しの巡回も、ユーザーの操作による起動も、後始末の後に行う。

終了させられた実行の会話は失われない SHALL——後で起こし直すときは、新しい会話を作り直さず、その会話の継続として再開する。

#### Scenario: 残っている実行を止めてから倒す

- **GIVEN** 実行の途中でサーバーが再起動し、前のプロセスが起こした claude がまだ走っている
- **WHEN** サーバーが起動して後始末が走る
- **THEN** その claude は終了しており、対象の `invocation` は `failed` になっている

#### Scenario: プロセスがもう残っていない

- **GIVEN** `running` のまま残っている対象があり、その対象の claude はもう走っていない
- **WHEN** サーバーが起動して後始末が走る
- **THEN** 対象の `invocation` は `failed` になり、巡回が起こし直せる状態になる

#### Scenario: 止められない

- **GIVEN** `running` のまま残っている対象があり、その claude を終了させられない（または走っているかを調べられない）
- **WHEN** サーバーが起動して後始末が走る
- **THEN** 対象の `invocation` は `error` になり、自動では起こし直されず、ユーザーの再実行または削除を待つ

#### Scenario: 自分のものと確かめられない実行には触らない

- **GIVEN** 同じ保存先を共有する別のインスタンスが起こした実行があり、その対象が `running` である
- **WHEN** サーバーが起動して後始末が走る
- **THEN** その claude は終了させられず、対象の `invocation` も書き換えられない

#### Scenario: 後始末より先に起こし直さない

- **GIVEN** 起動時の後始末の対象になる `running` の対象がある
- **WHEN** サーバーが起動する
- **THEN** その対象への起動は、後始末が済むまで行われない

### Requirement: ひとつの対象で同時に走る実行は1つだけ

システムは、ひとつの対象に対して2つ以上の claude を同時に走らせてはならない（MUST NOT）。**これはサーバーの再起動をまたいでも成り立つ** SHALL——再起動で実行中の記録が失われても、それを理由に2つ目を起こしてはならない（MUST NOT）。

#### Scenario: 再起動を挟んでも2つ目が立たない

- **GIVEN** 実行の途中でサーバーが再起動し、前のプロセスが起こした claude がまだ走っている
- **WHEN** その対象が起こし直される
- **THEN** 起こし直しの時点で前の claude は終了しており、同じ会話に対して走っている claude は常に1つだけである

#### Scenario: 前の実行を止められなければ起こさない

- **GIVEN** 前のプロセスが起こした claude を終了させられなかった対象がある
- **WHEN** 巡回が走る
- **THEN** その対象は起こし直されず、2つ目の claude は立たない
