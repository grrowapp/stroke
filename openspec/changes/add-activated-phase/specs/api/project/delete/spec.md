## MODIFIED Requirements

### Requirement: 中身のある本物のプロジェクトは消さない

システムは、完成を記録したプロジェクト——phase が `activated` のもの——を消してはならない（MUST NOT）。それは steering が承認依頼を出し、レビューできる状態に達した実体であり、この口が扱う対象ではない。

この判定に `.spec-workflow/` の有無を使ってはならない（MUST NOT）。そのディレクトリは本家 MCP が接続した瞬間にでき、作りきれなかったプロジェクトも持っているためである。`.spec-workflow/` を持つことを理由に削除を断ると、失敗の決着で「破棄する」を選んだプロジェクトが消せず、一覧に居座る。

#### Scenario: 完成したプロジェクトを消そうとする

- **WHEN** phase が `activated` のプロジェクトの削除が要求される
- **THEN** システムは受理せず、何も消さない

#### Scenario: .spec-workflow/ を持つが作りきれなかったプロジェクトを消す

- **WHEN** phase が `approved` のまま生成が失敗し、`.spec-workflow/` はできているプロジェクトに削除が要求される
- **THEN** システムは受理し、そのディレクトリ配下は `.spec-workflow/` ごと残らず消える
