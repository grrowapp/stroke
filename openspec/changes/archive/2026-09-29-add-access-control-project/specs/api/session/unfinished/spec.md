## MODIFIED Requirements

### Requirement: 昇格前のセッションを一覧する

システムは、昇格前（`stroking` / `proposed`）のセッションを一覧して返す endpoint を持つ SHALL。各件は id・phase・時点情報・対象のディレクトリ・実行の記録とし、新しいものから並べる SHALL。返すのは、要求した利用者が見られるセッションだけとする SHALL（`access/permission`）。

昇格した対象（`approved` / `activated`）を返してはならない（MUST NOT）——あれはプロジェクトであり、プロジェクトの一覧が返す。

#### Scenario: 昇格前のセッションがある

- **WHEN** 保存先に `stroking` と `proposed` のセッションがある状態で一覧する
- **THEN** その2件が、phase と実行の記録つきで返る

#### Scenario: 昇格した対象は返らない

- **WHEN** 保存先に昇格したプロジェクト（`approved` / `activated`）だけがある状態で一覧する
- **THEN** 1件も返らない
