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

完了を検知したら、**その実行で作業が行われたかを併せて確かめる** SHALL。行われていなければ `invocation` を `failed` に変える SHALL。プロセスが正常終了したことだけをもって `idle` にしてはならない（MUST NOT）——何もせずに終わった実行が `idle` で終わると、巡回は `failed` だけを拾うので誰も起こし直さず、その対象はそこで止まったまま残る。何をもって作業が行われたと見るかは、工程ごとに呼び出し側が渡す SHALL。起動処理がその判定を工程から導いてはならない（MUST NOT）——用途の違いは渡される値の違いだけで表す（「起動は1系統で、起動定義・定型・作業場所は呼び出し側が渡す」と同じ理由）。

その実行が**生成中のプロジェクト（phase が `approved`）の steering** であれば、システムは作業が行われたことを確かめた後、`invocation` を `idle` に変える前に完成の記録（`api/session/activate`）を試みなければならない（SHALL）。記録が受理されたときだけ `invocation` を `idle` に変える SHALL。記録が受理されなかったとき——局面が違う、記録先に届かない——は `invocation` を `failed` に変え、起こし直す対象として残す SHALL。ただし、断られた時点で既に完成が記録されている（この実行の起動後に別の書き手が記録した）対象は、受理されたものと同じに扱う SHALL——目的は果たされており、`failed` に倒すと完成済みの対象を起こし直し続ける。

**完成したかを決めるのはこの作業の判定である**（SHALL）。記録先（`api/session/activate`）は判定を持たないので、作業が行われていない実行で完成の記録を試みてはならない（MUST NOT）——何も出していない対象が完成として畳まれる。作業が行われていなければ `invocation` を `failed` に変え、完成の記録を試みない SHALL。

生成中でない対象の実行——ストローク、および完成済みプロジェクトの steering——では、作業が行われていれば `invocation` を `idle` に変える SHALL。完成の記録を試みてはならない（MUST NOT）。

#### Scenario: 作業が完了する

- **WHEN** ストロークの子プロセスが指示された作業を終える
- **THEN** invokeAi が output stream で完了を検知し、`invocation` を `idle` に変える

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

## REMOVED Requirements

### Requirement: 作業が行われたかの判定を工程ごとに持つ

**Reason**: この Requirement は `fix-steering-empty-completion`（2026-09-04 archive）が入れたもので、Scenario「生成中の steering では完成の記録が判定に代わる」を含む。その Scenario は、完成の記録（U15）が承認依頼の有無を判定していた当時の設計に立っている。2026-09-04 のユーザー判断で U15 から判定を外し（ADR-0014、design D3・D4）、生成中の steering でも提出の判定を先に問う形へ逆にしたため、この Scenario は成り立たない。MODIFIED は Scenario を落とせないので、Requirement を置き換える形で外し、同じ規定を下の ADDED に新しい名前で置き直す。

**Migration**: 実装の変更は無い（判定の順序は 14.2 で `ai.ts` に反映済み）。規定の本文と、生成中以外の Scenario 4本は下の ADDED にそのまま写してある。

## ADDED Requirements

### Requirement: 作業が行われたかの判定を工程ごとに持ち、完成の記録より先に問う

システムは、**どの工程の実行にも**「その実行で作業が行われたか」の判定を持たせる SHALL。判定を持たない工程を作ってはならない（MUST NOT）——判定が無い工程では、何もせずに終わった実行と成し遂げた実行が同じ `idle` になり、区別が付かなくなる。

工程ごとの判定は次のとおりとする SHALL。

- flontier 工程の実行は、その実行の間に提出（問い・proposal）が1つ以上**受理された**ことをもって、作業が行われたとする
- steering 工程の実行は、その実行の間に steering 文書の提出が1つ以上**受理された**ことをもって、作業が行われたとする

判定の材料は、**その実行の間に起きたことだけ**とする SHALL。前の実行で受理された提出を、後の実行が作業の証しにしてはならない（MUST NOT）。

受理されなかった提出（提出先が拒否した・提出先に届かなかった）を作業として数えてはならない（MUST NOT）——受理されていない提出は、何も残していないためである。

**この判定はどの局面でも先に問う** SHALL。生成中のプロジェクト（phase が `approved`）の steering でも同じで、**この判定が完成したかの判定そのものである**——完成の記録（`api/session/activate`）は判定を持たないため、作業が行われたかに答えるのはここだけになる。作業が行われていない実行で完成の記録を試みてはならない（MUST NOT）。

#### Scenario: steering の実行が1本も提出せずに終わる

- **GIVEN** 完成を記録済みのプロジェクトで steering の実行が起こし直されている
- **WHEN** その実行が steering 文書を1本も提出しないまま正常終了する
- **THEN** その `invocation` は `failed` になり、巡回に拾われて起こし直される

#### Scenario: steering の実行が文書を提出して終わる

- **GIVEN** 完成を記録済みのプロジェクトで steering の実行が起こし直されている
- **WHEN** その実行が steering 文書を提出して受理され、正常終了する
- **THEN** その `invocation` は `idle` になる

#### Scenario: 拒否された提出だけで終わった実行

- **GIVEN** 完成を記録済みのプロジェクトで steering の実行が起こし直されている
- **WHEN** その実行の提出がすべて提出先に拒否され、そのまま正常終了する
- **THEN** その `invocation` は `failed` になる

#### Scenario: 前の実行の提出を持ち越さない

- **GIVEN** 完成を記録済みのプロジェクトで、直前の実行が steering 文書を1本受理させ、その実行は `failed` で終わっている
- **WHEN** 起こし直された次の実行が、何も提出しないまま正常終了する
- **THEN** その実行の `invocation` は `failed` になる（直前の実行の提出は数えられない）

#### Scenario: 生成中の steering でも提出の判定を先に問う

- **GIVEN** 生成中のプロジェクト（phase が `approved`）で steering の実行が起きている
- **WHEN** その実行が steering 文書を1本も提出せずに正常終了する
- **THEN** その `invocation` は `failed` になる。完成の記録は試みられない

#### Scenario: 空振りが続けばユーザーへ引き渡される

- **GIVEN** steering の実行が何も提出しないまま終わることを繰り返している
- **WHEN** 起こし直した回数が上限に達する
- **THEN** `invocation` は `error` になり、システムは自動では何もせず、ユーザーの再実行か削除を待つ
