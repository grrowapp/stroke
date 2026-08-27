# mcp/tools/send-back Delta

## Purpose

差し戻し（ユーザーが proposal を承認せず修正を求めて返した指摘一式）を取得するツールの契約を定める。

## ADDED Requirements

### Requirement: 差し戻しを引数なしで取得する

ツールは引数を取らない SHALL。結果は次のいずれか1つを返す SHALL。

- **指摘一式**: 保存済みの差し戻しの指摘一式
- **エラー**: ステータスとエラー内容（差し戻しがまだ無い場合を含む。`api/stroke/send-back` の規定に従う）

#### Scenario: 指摘を読む

- **GIVEN** 対象のセッションで差し戻しが発生した
- **WHEN** このツールを実行する
- **THEN** 指摘一式が返る

#### Scenario: セッションが存在しない

- **GIVEN** 対象のセッションが存在しない
- **WHEN** このツールを実行する
- **THEN** エラーが返り、ステータスとエラー内容を持つ
