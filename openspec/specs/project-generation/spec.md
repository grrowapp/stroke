# project-generation Specification

## Purpose
承認された proposal を、後に spec-workflow がプロジェクトルートとして受け取れる場所へ落とす。作るのはトップのディレクトリと proposal だけで、その内部構造には踏み込まない。

## Requirements

### Requirement: 承認時にプロジェクトのトップディレクトリを作る

システムは承認時に `/opt/projects/<name>/` を作る SHALL。作るのはトップのディレクトリのみで、`.spec-workflow/` の内部構造は作らない。

#### Scenario: 承認によって生成する

- **WHEN** ユーザーが名前 `<name>` で承認する
- **THEN** `/opt/projects/<name>/` が作られる

#### Scenario: 内部構造には踏み込まない

- **WHEN** プロジェクトが作られた直後の中身を見る
- **THEN** `.spec-workflow/` 配下のファイルやディレクトリは1つも作られていない

### Requirement: 承認された proposal を配置する

システムは承認された proposal の全文を `/opt/projects/<name>/docs/proposal.md` に書き出す SHALL。

#### Scenario: 生成後の中身

- **WHEN** プロジェクトの生成が成功する
- **THEN** `/opt/projects/<name>/docs/proposal.md` に、画面2で承認された proposal と同じ内容が入っている

### Requirement: 生成の直前に既存名との衝突を確認する

システムは生成の直前に `/opt/projects/<name>` の存在を確認する SHALL。既に存在する場合は何も書き込まない。

#### Scenario: 承認の時点で同名が存在する

- **WHEN** 生成しようとした時点で `/opt/projects/<name>` が既に存在する
- **THEN** システムは何も書き込まず、衝突を伝え、phase を `proposed` のままにする

### Requirement: 生成に失敗したら承認を確定させない

ディレクトリ作成またはファイル書き込みに失敗した場合、システムは phase を `approved` にしない SHALL。

#### Scenario: 書き込みに失敗する

- **WHEN** `/opt/projects/` 配下への書き込みが失敗する
- **THEN** システムはエラーを表示し、phase を `proposed` のままにして、再度承認できる状態にする

### Requirement: セッションディレクトリは承認後も残す

システムは承認後にセッションディレクトリを削除しない SHALL。クリーニングは MVP の対象外とする。

#### Scenario: 承認の後

- **WHEN** プロジェクトの生成が成功する
- **THEN** そのセッションのディレクトリと中のファイルはそのまま残る
