# api/session/invoke-agent Specification

## Purpose
AI の起動を受け付ける endpoint（U13 `GET /api/sessions/:id/invoke-agent`）を規定する。起動の唯一の受け口として要求を受理し、実行の場所（cwd）はキックする側から引数で受け取る。api/invoke-agent を path 変更と cwd 引数化とともに引き継いだもの。

## Requirements

### Requirement: U13 GET /api/sessions/:id/invoke-agent — AI の起動を受け付ける

システムは `GET /api/sessions/:id/invoke-agent` を公開する SHALL。起動要求は **cwd（実行する場所）を引数で受け取る** SHALL。endpoint が cwd を自分で導出してはならない（MUST NOT）——キックする側（画面・巡回・承認処理）が、一覧の応答の path または生成先の path を渡す。

起動要求を受理したときは AI の呼び出しを開始し、応答の完了を待たずに受理を返して完結する SHALL。承認によって昇格した対象への起動要求も、この endpoint で受け付ける SHALL。

存在しない id への起動要求は受理しない SHALL。

#### Scenario: 起動を要求する

- **WHEN** 存在する対象の id と cwd を添えて `GET /api/sessions/:id/invoke-agent` が要求される
- **THEN** システムは AI の呼び出しを開始し、応答の完了を待たずに受理を返す。実行は渡された cwd で行われる

#### Scenario: 存在しない id で起動を要求する

- **WHEN** 存在しない id で起動が要求される
- **THEN** システムは起動せず、存在しないことを伝える

#### Scenario: 昇格したプロジェクトに起動を要求する

- **WHEN** 承認で昇格したプロジェクトの id と生成先の path を cwd として起動が要求される
- **THEN** システムは受理し、AI の呼び出しをその場所で開始する

### Requirement: 同一対象の多重起動を受け付けない

システムは、実行中の呼び出しを持つ対象への起動要求を受理しない SHALL。呼び出しが終わった後は、同じ対象に再び起動を要求できる。

#### Scenario: 実行中に起動を要求する

- **WHEN** 実行中の呼び出しを持つ対象に起動が要求される
- **THEN** システムは受理せず busy であることを伝え、AI は二重に起動されない

#### Scenario: 呼び出しが終わった後に再び起動を要求する

- **WHEN** 実行中だった呼び出しが終わった対象に、再び起動が要求される
- **THEN** システムは受理し、AI の呼び出しを開始する

### Requirement: 前提が欠けている間は起動を受け付けない

システムは、AI の起動に必要な前提（startup-readiness）が揃っていない対象への起動要求を受理しない SHALL。要求元には受理しなかったことと、欠けている前提の内容が返る。前提が満たされた後は、同じ対象に再び起動を要求できる。

#### Scenario: 前提が欠けた状態で起動を要求する

- **WHEN** AI の起動設定が成立しない状態で起動が要求される
- **THEN** システムは受理せず欠けている前提を伝え、AI は起動されない

#### Scenario: 前提が満たされた後に起動を要求する

- **WHEN** 欠けていた前提が満たされた後で、同じ対象に起動が要求される
- **THEN** システムは受理し、AI の呼び出しを開始する
