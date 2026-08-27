## Purpose

feature（実装のタスクに繋がる文書の組）の工程の全体像を定める。個々の工程の成果物の詳細（schema の中身・template）は定めず、実装時の設計に委ねる。

## ADDED Requirements

### Requirement: feature の工程は外部定義される

feature の工程は openspec のローカル schema による外部定義で決まる SHALL。工程の定義の変更は、アプリのコード変更・再ビルドなしに反映される SHALL。

#### Scenario: 工程の定義変更がコード変更なしで反映される

- **WHEN** 運用者が feature 用 schema の定義を変更し、その後に新しい feature の工程が始まる
- **THEN** 変更後の定義で工程が進み、アプリのコード変更・再ビルドは行われていない

### Requirement: 工程は tasks の完了の後、締めで終わる

feature の工程の定義において、tasks の全完了の後に締め（`feature/workflow/sync`）が位置づけられる SHALL。締めより後に工程は無い SHALL。

#### Scenario: 工程の並び

- **WHEN** feature の工程の定義を参照する
- **THEN** tasks の全完了の後に締めがあり、それが最後である
