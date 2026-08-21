# project-generation Delta

## MODIFIED Requirements

### Requirement: 生成に失敗したら承認を確定させない

ディレクトリ作成またはファイル書き込みに失敗した場合、システムは phase を `approved` にしない SHALL。確定された名前を実行環境がディレクトリ名として受け付けない場合も、この生成の失敗として扱う SHALL。失敗は、それが起きた場所のエラーとして伝える。

#### Scenario: 書き込みに失敗する

- **WHEN** `/opt/projects/` 配下への書き込みが失敗する
- **THEN** システムはエラーを表示し、phase を `proposed` のままにして、再度承認できる状態にする

#### Scenario: 環境が名前を受け付けない

- **WHEN** 確定された名前を実行環境がディレクトリ名として受け付けず、ディレクトリ作成が失敗する
- **THEN** システムはその失敗をエラーとして表示し、phase を `proposed` のままにして、別の名前で再度承認できる状態にする
