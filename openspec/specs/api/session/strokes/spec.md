# api/session/strokes Specification

## Purpose
済んだストロークの記録を返す endpoint（U3）を規定する。画面が往復の履歴を描くための読み取り専用の口であり、保存済みの記録をそのまま返す。状況による判定や加工をここに持ち込まないことを境界として定める。

## Requirements

### Requirement: U3 GET /api/sessions/:id/strokes — 済んだストロークの記録を返す

システムは `GET /api/sessions/:id/strokes` を公開する SHALL。済んだストロークの全件を、概要からの順に末尾が直前の回答となる形で返す SHALL。取得は保存済みの記録を返すだけとし、状況による判定を行ってはならない（MUST NOT）。

存在しないセッション id への要求は受理しない SHALL。

#### Scenario: 記録を取得する

- **WHEN** 存在するセッションの id で `GET /api/sessions/:id/strokes` が要求される
- **THEN** 概要からの済んだストロークの全件が順に返り、末尾は直前の回答である

#### Scenario: 存在しない id で取得する

- **WHEN** 存在しないセッション id で `GET /api/sessions/:id/strokes` が要求される
- **THEN** システムは受理せず、存在しないことを伝える

#### Scenario: 同じ記録をもう一度取得する

- **WHEN** 同じセッションの記録が続けて2回要求される
- **THEN** 2回とも同じ内容が返り、取得によって記録は変化しない
