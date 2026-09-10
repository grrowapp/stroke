## MODIFIED Requirements

### Requirement: 完了は output stream で検知して idle に変える

システムは実行の完了を、invokeAi が子プロセスの output stream を見て検知する SHALL。AI 自身に完了を告知させてはならない（MUST NOT）。

完了を検知したら、**その実行で作業が行われたかを併せて確かめる** SHALL。行われていなければ `invocation` を `failed` に変える SHALL。プロセスが正常終了したことだけをもって `idle` にしてはならない（MUST NOT）——何もせずに終わった実行が `idle` で終わると、巡回は `failed` だけを拾うので誰も起こし直さず、その対象はそこで止まったまま残る。何をもって作業が行われたと見るかは、工程ごとに呼び出し側が渡す SHALL。起動処理がその判定を工程から導いてはならない（MUST NOT）——用途の違いは渡される値の違いだけで表す（「起動は1系統で、起動定義・定型・作業場所は呼び出し側が渡す」と同じ理由）。

**実行の決着は invokeAi が行う SHALL。** 決着とは、その実行で提出されたものに応じて局面を切り替え、画面へ届けることである。ストロークの実行では、作業が行われたことを確かめた後、`invocation` を `idle` に変える前に次を行う SHALL。

- その実行で**問い**が提出されていれば、今の1問として画面へ配信する（`api/session/ws` W1）。phase は変えない
- その実行で **proposal** が提出されていれば、phase を `proposed` に切り替え、proposal と名前候補を画面へ配信する（`api/session/ws` W2）

**提出を受ける endpoint（問い・proposal）が phase を切り替えたり、画面へ配信したりしてはならない（MUST NOT）。** endpoint の責務は提出を記録することだけである。局面が変わってよいのは実行が終わった時点だけであり、それを知るのは子プロセスを制御する invokeAi だけである。endpoint が切り替えると、実行がまだ終わっていないのに次の操作（承認）ができる局面が立つ。

決着の前に実行が失敗した（タイムアウト・異常終了）ときは、決着を行わない SHALL。提出されたものは記録として残るが、phase は変わらず配信もされない。起こし直された実行が完了したときに、その実行の提出として改めて決着する。

その実行が**生成中のプロジェクト（phase が `approved`）の steering** であれば、システムは作業が行われたことを確かめた後、`invocation` を `idle` に変える前に完成の記録（`api/session/activate`）を試みなければならない（SHALL）。記録が受理されたときだけ `invocation` を `idle` に変える SHALL。記録が受理されなかったとき——局面が違う、記録先に届かない——は `invocation` を `failed` に変え、起こし直す対象として残す SHALL。ただし、断られた時点で既に完成が記録されている（この実行の起動後に別の書き手が記録した）対象は、受理されたものと同じに扱う SHALL——目的は果たされており、`failed` に倒すと完成済みの対象を起こし直し続ける。

**完成したかを決めるのはこの作業の判定である**（SHALL）。記録先（`api/session/activate`）は判定を持たないので、作業が行われていない実行で完成の記録を試みてはならない（MUST NOT）——何も出していない対象が完成として畳まれる。作業が行われていなければ `invocation` を `failed` に変え、完成の記録を試みない SHALL。

完成済みプロジェクトの steering では、作業が行われていれば `invocation` を `idle` に変える SHALL。完成の記録を試みてはならない（MUST NOT）。

#### Scenario: 作業が完了する

- **WHEN** ストロークの子プロセスが指示された作業を終える
- **THEN** invokeAi が output stream で完了を検知し、その実行の提出に応じて決着してから `invocation` を `idle` に変える

#### Scenario: 問いを提出して完了する

- **WHEN** ストロークの実行が問いを提出して終える
- **THEN** invokeAi は完了を検知した後、今の1問を画面へ配信し、`invocation` を `idle` に変える。phase は変わらない

#### Scenario: proposal を提出して完了する

- **WHEN** ストロークの実行が proposal を提出して終える
- **THEN** invokeAi は完了を検知した後、phase を `proposed` に切り替えて proposal を画面へ配信し、`invocation` を `idle` に変える。画面2 に承認の操作が現れる時点で、その実行は終わっている

#### Scenario: 提出の受理では局面が変わらない

- **WHEN** 実行中の claude が proposal を提出し、endpoint がそれを受理する
- **THEN** proposal は記録されるが、phase は `proposed` にならず、画面へも配信されない。実行が終わるまで承認の操作は現れない

#### Scenario: 提出した後に失敗する

- **WHEN** 実行が proposal を提出した後、完了を検知する前にタイムアウトする
- **THEN** invokeAi は決着を行わず `invocation` を `failed` に変える。proposal は記録として残るが phase は変わらない。起こし直された実行の完了時に改めて決着する

#### Scenario: 何もせずに終わった実行は idle にならない

- **WHEN** 子プロセスが正常終了したが、その実行では作業が1つも行われていない
- **THEN** 局面によらず `invocation` は `idle` にならず `failed` に変わり、巡回の対象になる

#### Scenario: steering が文書を出して完了する

- **WHEN** 生成中のプロジェクトの steering が、その起動で steering 文書の提出を受理されて終える
- **THEN** invokeAi は完成を記録し、それが受理されてから `invocation` を `idle` に変える。プロジェクトは完了として一覧に出る

#### Scenario: steering が文書を出さずに完了する

- **WHEN** 生成中のプロジェクトの steering が、その起動で文書を1本も提出せずに終える
- **THEN** invokeAi は完成の記録を試みず、`invocation` を `failed` に変える。巡回が起こし直す

#### Scenario: 完成の記録に届かない

- **WHEN** 生成中のプロジェクトの steering が文書を出して終えたが、完成の記録に届かない
- **THEN** invokeAi は `invocation` を `failed` に変える。巡回が起こし直し、続きの実行が完了したときにもう一度記録を試みる

#### Scenario: 実行中に別の書き手が完成を記録していた

- **WHEN** 生成中として起こした steering の実行中に、起動時の書き上げが同じ対象の完成を記録し、実行の完了時に完成の記録が「既に完成している」と断られる
- **THEN** invokeAi は受理と同じに扱い、`invocation` を `idle` に変える

#### Scenario: 完成済みプロジェクトの steering が完了する

- **WHEN** 完成を記録済みのプロジェクトで起こし直した steering が終える
- **THEN** invokeAi は完成の記録を試みず、`invocation` を `idle` に変える
