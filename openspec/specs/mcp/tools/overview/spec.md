# mcp/tools/overview Specification

## Purpose
セッションの概要（ユーザーが最初に投げた、作りたいシステムの説明）を取得するツール（`get-overview`）の契約を定める。

## Requirements

### Requirement: 概要を引数なしで取得する

ツールは引数を取らない SHALL。成功の結果は `status` と `overview`（そのセッションの概要の本文）を持つ SHALL。失敗の結果は `status`（HTTP ステータスコード）・`errorCode`（失敗の種別を表す機械可読コード。同じ status でも種別を区別する——セッションが無い場合は `session_not_found`、セッションはあるが概要がまだ無い場合は `no_overview`）・`error`（endpoint が返したエラー本文）を持つ SHALL（`mcp/server` の形式）。

代行先は同じ 404 を2つの意味で返す。区別せずに1つの `errorCode` へ寄せてはならない（MUST NOT）——受け手の次の手が違う。

#### Scenario: 概要を読む

- **GIVEN** 概要を受理したセッションが存在する
- **WHEN** このツールを実行する
- **THEN** 結果に `status: 200` と、そのセッションの概要の本文（`overview`）が入っている

#### Scenario: セッションが存在しない

- **GIVEN** 対象のセッションが削除されている
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 404`・`errorCode: session_not_found` と、endpoint が返したエラー本文（`error`）を持つ

#### Scenario: 概要がまだ無い

- **GIVEN** 対象のセッションは存在するが、概要がまだ書かれていない
- **WHEN** このツールを実行する
- **THEN** 結果はエラーで、`status: 404`・`errorCode: no_overview` と、endpoint が返したエラー本文（`error`）を持つ
