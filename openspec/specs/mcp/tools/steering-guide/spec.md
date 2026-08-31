# mcp/tools/steering-guide Specification

## Purpose
steering 工程の進め方をエージェントへ渡すツール（`get-steering-guide`）の契約を定める。flontier 側の `mcp/tools/guide` と対になり、両工程で案内の届け方を揃える。

操作系のツール（`get-steering` / `submit-document`）は「何ができるか」しか伝えられない。3文書をどの順で作るか・既に在る文書をどう扱うか・どこで終わりとみなすかは、この手順を読まないと決まらない。

## Requirements

### Requirement: 工程の手順を引数なしで取得する

ツールは引数を取らない SHALL。成功の結果は `status` と `guide`（工程の手順の本文）を持つ SHALL。

手順の本文はプロジェクトの状態に依存しない SHALL。既に在る文書の中身や本数は `get-steering` が返すものであり、このツールは手順だけを返す。

#### Scenario: 手順を読む

- **GIVEN** エージェントが steering 工程で起動している
- **WHEN** このツールを実行する
- **THEN** 結果に `status: 200` と、工程の手順の本文（`guide`）が入っている

### Requirement: 手順は3文書の作り方と終わり方を含む

手順の本文は、次を含む SHALL。

- 対象が product / tech / structure の3文書であることと、作る順序
- 取得（`get-steering`）と提出（`submit-document` の steering 種別）の順序
- 文書がまだ無いとき（`exists: false`）の進め方
- 既に在る文書を上書きしてよいかの判断
- どこまで書けば1文書を終わりとみなすか

#### Scenario: 3文書を揃えるまで到達できる

- **GIVEN** エージェントが手順を読んでいる
- **WHEN** 文書を1つずつ作って提出する
- **THEN** エージェントは3文書が揃った時点で工程の終わりと判定できる

### Requirement: 最初に読ませる

ツールの説明（description）は、他のツールより先に呼ぶべきことを述べる SHALL。

#### Scenario: 起動直後に手順を読む

- **GIVEN** エージェントが steering 工程で起動した直後である
- **WHEN** エージェントがツールの一覧を見る
- **THEN** 説明から、まずこのツールを呼ぶべきだと判断できる
