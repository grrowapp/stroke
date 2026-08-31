# mcp/tools/strokes Specification

## Purpose
済んだストロークの記録（末尾が直前の回答）を取得するツール（`get-strokes`）の契約を定める。

## Requirements

### Requirement: ストローク記録を引数なしで取得する

ツールは引数を取らない SHALL。成功の結果は `status` とストローク記録の一覧（時系列順に並び、最後の要素が最新の記録）を持つ SHALL。失敗の結果は `status`（HTTP ステータスコード）・`errorCode`（status から導出する機械可読の失敗種別。404 は `session_not_found`）・`error`（endpoint が返したエラー本文）を持つ SHALL（`mcp/server` の形式）。

#### Scenario: 記録を読む

- **GIVEN** ストロークを重ねたセッションが存在する
- **WHEN** このツールを実行する
- **THEN** 結果に `status: 200` と記録の一覧が入り、一覧は時系列順で最後の要素が最新の記録である

#### Scenario: セッションが存在しない

- **GIVEN** 対象のセッションが削除されている
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 404`・`errorCode: session_not_found` と、endpoint が返したエラー本文（`error`）を持つ
