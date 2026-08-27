# mcp/tools/steering Delta

## Purpose

steering 文書（product / tech / structure）を取得するツール（`get-steering`）の契約を定める。

## ADDED Requirements

### Requirement: 文書名を引数に steering 文書を取得する

ツールの引数は文書名（product / tech / structure）とする SHALL。プロジェクトの特定は引数に含めない（サーバーが解決する）。成功の結果は `status`・その文書の文章・文書の有無（`exists`）を持つ SHALL。`exists` の値は本家の文書状況（`GET /api/projects/:projectId/info` の応答）から取り、ツール側で判定し直さない（MUST NOT）。失敗の結果は `status`（HTTP ステータスコード）・`errorCode`（status から導出する機械可読の失敗種別。検証エラー（400）は `validation_error`、本家に到達できない場合は `unreachable`）・`error`（本家が返したエラー本文）を持つ SHALL（`mcp/server` の形式）。

本家の応答をツール側で変換してはならない（MUST NOT）——文書がまだ無い場合、本家は空の内容の 200 を返す（本家 2.2.7 のソースで確認済み）。本家 dashboard に到達できない場合は `status: 502` と `errorCode: unreachable` で返す SHALL。

#### Scenario: 文書を読む

- **GIVEN** 対象のプロジェクトに product の steering 文書が存在する
- **WHEN** 文書名に product を指定してこのツールを実行する
- **THEN** 結果に `status: 200`・`exists: true` と product の文章が入り、文章は本家 `GET /api/projects/:projectId/steering/product` の応答と一致する（検証側が突き合わせる）

#### Scenario: 文書がまだ無い

- **GIVEN** 対象のプロジェクトに tech の steering 文書がまだ無い
- **WHEN** 文書名に tech を指定してこのツールを実行する
- **THEN** 結果に `status: 200`・`exists: false` と空の文章が入り、無いことが告知される（有無は本家の文書状況から取る）

#### Scenario: 不正な文書名

- **GIVEN** 対象のプロジェクトが存在する
- **WHEN** 規定外の文書名（例: `design`）を指定してこのツールを実行する
- **THEN** 結果はエラーで、`status: 400`・`errorCode: validation_error` と、本家が返したエラー本文（`error`）を持つ

#### Scenario: 本家の dashboard が停止している

- **GIVEN** 対象のプロジェクトが存在し、本家の dashboard が停止している
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 502` と `errorCode: unreachable` を持つ
