# api/stroke/overview Specification

## Purpose
エージェントが概要を取得する endpoint を規定する。保存済みの概要をそのまま返すだけの読み口であり、状況による判定を含まない。path は従来どおり変えない。

## Requirements

### Requirement: A1 GET /api/strokes/:id/overview — 概要を返す

システムは `GET /api/strokes/:id/overview` を公開する SHALL。保存済みの概要を返すだけとし、状況による判定を行ってはならない（MUST NOT）。

存在しないセッション id への要求は受理せず、エラーを返す SHALL。

#### Scenario: 概要を取得する

- **WHEN** エージェントが存在するセッションの id で `GET /api/strokes/:id/overview` を要求する
- **THEN** 保存済みの概要が返る

#### Scenario: 存在しない id で取得する

- **WHEN** 存在しないセッション id で `GET /api/strokes/:id/overview` が要求される
- **THEN** システムは受理せず、エラーを返す

#### Scenario: 同じ概要をもう一度取得する

- **WHEN** エージェントが同じセッションの概要を続けて2回要求する
- **THEN** 2回とも同じ内容が返り、取得によって概要は変化しない
