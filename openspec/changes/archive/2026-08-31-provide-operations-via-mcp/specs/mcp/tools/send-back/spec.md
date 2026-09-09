# mcp/tools/send-back Delta

## Purpose

差し戻し（ユーザーが proposal を承認せず修正を求めて返した指摘一式）を取得するツール（`get-send-back`）の契約を定める。

## ADDED Requirements

### Requirement: 差し戻しを引数なしで取得する

ツールは引数を取らない SHALL。成功の結果は `status` と保存済みの差し戻しの指摘一式を持つ SHALL。失敗の結果は `status`（HTTP ステータスコード）・`errorCode`（失敗の種別を表す機械可読コード。同じ status でも種別を区別する——差し戻しがまだ無い場合は `no_send_back`、セッションが無い場合は `session_not_found`）・`error`（endpoint が返したエラー本文）を持つ SHALL（`mcp/server` の形式）。

#### Scenario: 指摘を読む

- **GIVEN** 対象のセッションで差し戻しが発生した
- **WHEN** このツールを実行する
- **THEN** 結果に `status: 200` と指摘一式が入っている

#### Scenario: 差し戻しがまだ無い

- **GIVEN** 対象のセッションに差し戻しが無い
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 404`・`errorCode: no_send_back` と、endpoint のエラー本文「差し戻しはまだ無い。」（`error`）を持つ

#### Scenario: セッションが存在しない

- **GIVEN** 対象のセッションが削除されている
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 404`・`errorCode: session_not_found` と、endpoint のエラー本文「そのセッションは無い。」（`error`）を持つ
