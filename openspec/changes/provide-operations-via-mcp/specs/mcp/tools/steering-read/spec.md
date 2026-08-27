# mcp/tools/steering-read Delta

## Purpose

steering 文書（product / tech / structure）と文書状況の取得を一元化したツールの契約を定める。

## ADDED Requirements

### Requirement: 文書名を引数に steering 文書を取得する

ツールは文書名（product / tech / structure）を引数で受け取り、`GET /api/projects/:projectId/steering/:name` へ代行してその応答をそのまま返す SHALL。projectId はサーバーが解決し、引数に取らない。

#### Scenario: 文書を読む

- **WHEN** 文書名を指定してツールを実行する
- **THEN** その steering 文書の内容が endpoint の応答のまま返る

#### Scenario: 不正な文書名

- **WHEN** 規定外の文書名を指定して実行する
- **THEN** endpoint のエラーがそのまま返る

### Requirement: 文書状況を同じ口で得られる

ツールは文書状況（各 steering 文書の有無）を同じ口で返せる SHALL。文書状況は `GET /api/projects/:projectId/info` への代行から得る。

#### Scenario: 文書状況を確かめる

- **WHEN** 文書状況を要求してツールを実行する
- **THEN** steering 各文書の有無が endpoint の応答から読み取れる
