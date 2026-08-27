## MODIFIED Requirements

### Requirement: proposal はセッションの時点から docs 配下にある

proposal はセッションの時点から、セッションディレクトリの `docs/proposal.md` に在る SHALL。昇格はこのファイルを動かさないため、昇格後は `<name>/docs/proposal.md` としてそのまま読める。

誰がそこへ置くかは、外から観測できないためここでは規定しない。置かれることと、置かれた後に動かされないことだけを規定する。

昇格（承認の処理）は proposal のファイルを書き出さず、既にあるものに触れない SHALL。

#### Scenario: セッション中の proposal の在り処

- **WHEN** proposal が起こされた後にセッションディレクトリを見る
- **THEN** `docs/proposal.md` に proposal の全文が入っている

#### Scenario: 昇格後の proposal の在り処

- **WHEN** 昇格が成功した後にプロジェクトの中身を見る
- **THEN** `<name>/docs/proposal.md` に、承認された proposal と同じ内容が入っている

#### Scenario: システムは proposal を書かない

- **WHEN** 承認の処理が走る
- **THEN** システムは proposal のファイルを新たに書き出さず、既にある `docs/proposal.md` に触れない
