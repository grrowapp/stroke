# workflow-definition Delta

## ADDED Requirements

### Requirement: instruction が名指す操作は実在する入口である

ワークフロー定義の instruction は、操作を**実在する MCP ツールの名前**で指す SHALL。実体の無いスラッシュコマンド（`/get-overview` `/question` `/proposal` `/get-send-back` `/get-strokes` `/guidance` `/domain-modeling`）で指してはならない（MUST NOT）。

これらは指す先を持たない。エージェントが動いていたのは、**名前が MCP ツールと偶然一致していたから**である（`/get-overview` と `get-overview`）。一致しない `/question`・`/proposal`・`/guidance`・`/domain-modeling` は、読まれても何も起こらない。

手順そのものは instruction に書かず、案内のツール（`get-guide`）を指す SHALL。同じ手順が instruction とツールの2箇所にあると、片方だけが古くなる。

#### Scenario: 操作を名前で指す

- **WHEN** instruction が概要の取得を指示する
- **THEN** 指している名前は起動時に公開される MCP ツールの一覧に在る

#### Scenario: 手順の在りかを1つにする

- **WHEN** エージェントが工程の進め方を知ろうとする
- **THEN** instruction は案内のツールを指しており、手順の本文そのものは instruction に書かれていない
