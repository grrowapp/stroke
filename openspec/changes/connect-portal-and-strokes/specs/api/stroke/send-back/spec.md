## Purpose

エージェントが差し戻しの指摘一式を取得する endpoint を規定する。保存済みの内容を返すだけの読み口であり、指摘の記録と整えは `api/session/send-back` が担う。

## ADDED Requirements

### Requirement: A4 GET /api/strokes/:id/send-back — 差し戻しの指摘一式を返す

システムは `GET /api/strokes/:id/send-back` を公開する SHALL。保存済みの差し戻しの指摘一式——U9 `POST /api/sessions/:id/send-back` の受理時に整えられたもの——を返すだけとし、状況による判定を行ってはならない（MUST NOT）。

差し戻しがまだ保存されていないセッションへの要求にはエラーを返す SHALL。存在しないセッション id への要求は受理せず、エラーを返す SHALL。

#### Scenario: 指摘一式を取得する

- **WHEN** 差し戻しが保存済みのセッションの id で `GET /api/strokes/:id/send-back` が要求される
- **THEN** U9 の受理時に整えられた指摘一式が返る

#### Scenario: まだ差し戻しが無い

- **WHEN** 差し戻しがまだ保存されていないセッションの id で要求される
- **THEN** システムはエラーを返す

#### Scenario: 存在しない id で取得する

- **WHEN** 存在しないセッション id で要求される
- **THEN** システムは受理せず、エラーを返す

#### Scenario: 同じ内容をもう一度取得する

- **WHEN** 同じセッションの指摘一式が続けて2回要求される
- **THEN** 2回とも同じ内容が返り、取得によって保存済みの内容は変化しない
