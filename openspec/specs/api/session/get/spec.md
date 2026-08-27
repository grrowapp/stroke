# api/session/get Specification

## Purpose
セッションの状態を返す endpoint（U2）を規定する。画面が phase に応じた表示と実行状態の把握に使う読み取り専用の口であり、状態の変更を含まない。

## Requirements

### Requirement: U2 GET /api/sessions/:id — セッションの状態を返す

システムは `GET /api/sessions/:id` を公開する SHALL。そのセッションの phase（`stroking` / `proposed` / `approved`）と `invocation`（`running` / `idle` / `failed` / `error`）を返す SHALL。

取得は保存済みの状態を返すだけとし、取得によって状態を変えてはならない（MUST NOT）。存在しないセッション id への要求は受理しない SHALL。

#### Scenario: 状態を取得する

- **WHEN** 存在するセッションの id で `GET /api/sessions/:id` が要求される
- **THEN** そのセッションの phase と `invocation` が返る

#### Scenario: 存在しない id で取得する

- **WHEN** 存在しないセッション id で `GET /api/sessions/:id` が要求される
- **THEN** システムは受理せず、存在しないことを伝える

#### Scenario: 取得しても状態は変わらない

- **WHEN** 同じセッションの状態が続けて2回要求される
- **THEN** 間に他の操作が無ければ2回とも同じ内容が返り、取得によって phase も `invocation` も変化しない
