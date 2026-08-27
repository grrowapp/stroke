# mcp/tools/steering Delta

## Purpose

steering 文書（product / tech / structure）を取得するツールの契約を定める。文書の有無はステータスとして結果に含まれる。

## ADDED Requirements

### Requirement: 文書名を引数に steering 文書を取得する

ツールの引数は文書名（product / tech / structure）とする SHALL。プロジェクトの特定は引数に含めない（サーバーが解決する）。結果は次のいずれか1つを返す SHALL。

- **文書の内容とステータス**: 文書が読める場合。文書の文章と、読めたことを示すステータスを持つ
- **ステータスのみ**: 文書が無い場合。文章は持たず、無いことを示すステータスを持つ
- **エラー**: ステータスとエラー内容
- **不達**: 取得先に到達できなかったこと

#### Scenario: product を読む

- **GIVEN** プロジェクトに product の steering 文書が存在する
- **WHEN** 文書名に product を指定してツールを実行する
- **THEN** product の文章とともに、読めたことがステータスで告知される

#### Scenario: tech を読む

- **GIVEN** プロジェクトに tech の steering 文書が存在する
- **WHEN** 文書名に tech を指定してツールを実行する
- **THEN** tech の文章とともに、読めたことがステータスで告知される

#### Scenario: structure を読む

- **GIVEN** プロジェクトに structure の steering 文書が存在する
- **WHEN** 文書名に structure を指定してツールを実行する
- **THEN** structure の文章とともに、読めたことがステータスで告知される

#### Scenario: 文書がまだ無い

- **GIVEN** プロジェクトに対象の steering 文書がまだ無い
- **WHEN** その文書名を指定してツールを実行する
- **THEN** 文章は返らず、無いことがステータスで告知される

#### Scenario: 不正な文書名

- **GIVEN** プロジェクトが存在する
- **WHEN** 規定外の文書名を指定して実行する
- **THEN** エラーが返り、ステータスとエラー内容を持つ

#### Scenario: 本家の dashboard が停止している

- **GIVEN** プロジェクトが存在し、本家の dashboard が停止している
- **WHEN** このツールを実行する
- **THEN** 不達が返る
