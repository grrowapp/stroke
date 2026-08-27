# mcp/tools/overview Delta

## Purpose

セッションの概要（ユーザーが最初に投げた、作りたいシステムの説明）を取得するツール（`get-overview`）の契約を定める。

## ADDED Requirements

### Requirement: 概要を引数なしで取得する

ツールは引数を取らない SHALL。成功の結果は `status` と `overview`（そのセッションの概要の本文）を持つ SHALL。失敗の結果は `status`（HTTP ステータスコード）・`errorCode`（status から導出する機械可読の失敗種別。404 は `not_found`）・`error`（endpoint が返したエラー本文）を持つ SHALL（`mcp/server` の形式）。

#### Scenario: 概要を読む

- **GIVEN** 概要を受理したセッションが存在する
- **WHEN** このツールを実行する
- **THEN** 結果に `status: 200` と、そのセッションの概要の本文（`overview`）が入っている

#### Scenario: セッションが存在しない

- **GIVEN** 対象のセッションが削除されている
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 404`・`errorCode: not_found` と、endpoint が返したエラー本文（`error`）を持つ
