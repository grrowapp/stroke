# agent/invocation Delta

## ADDED Requirements

### Requirement: 呼び出しは操作系の MCP サーバーを提供する

システムは、セッション工程・steering 工程の AI の呼び出しで、操作系 MCP サーバーの起動定義を MCP 設定（`--mcp-config`）に足して claude を起動する SHALL。サーバーが接続先とセッション id を解決できるよう、これらの値は MCP 設定の env で渡す SHALL。接続先やセッション id を prompt に載せてはならない（MUST NOT）。

#### Scenario: セッション工程で提供される

- **GIVEN** 対象のセッションが存在する
- **WHEN** システムがストロークの往復のために claude を起動する
- **THEN** 起動の MCP 設定に操作系 MCP サーバーが含まれ、そのセッションの接続情報が env に入っていることが確認できる

#### Scenario: steering 工程で提供される

- **GIVEN** 対象のプロジェクトが存在する
- **WHEN** システムが承認の後の文書作成のために claude を起動する
- **THEN** 起動の MCP 設定に、本家の MCP サーバーと並んで操作系 MCP サーバーが含まれていることが確認できる

#### Scenario: 接続情報は prompt に現れない

- **GIVEN** 対象のセッションまたはプロジェクトが存在する
- **WHEN** システムが claude を起動する
- **THEN** 渡された prompt に接続先・セッション id が含まれていないことが確認できる
