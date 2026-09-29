# api/session/list Specification

## Purpose
残っているセッションの一覧を返す endpoint を規定する。初回か継続かの符合判定と、巡回のリトライ対象の判定は、どちらもこの一覧の応答だけを根拠にする。

## Requirements

### Requirement: U12 GET /api/sessions — 残っているセッションを一覧する

システムは `GET /api/sessions` を公開する SHALL。一覧には実体の揃ったセッション——ディレクトリがあり、openspec ルートがあり、ワークフロースキーマが設定済みのもの——だけが載る SHALL。

一覧の各件には、セッション id・phase・いつのものかが分かる時点情報に加え、**そのディレクトリの path と `invocation`** を載せる SHALL。載せるのは、要求した利用者が見られるセッションとプロジェクトだけとする SHALL（`access/permission`）。`agent/invocation` はこの一覧との符合で初回か継続かを判定し、巡回（`portal/batch`）は各件の `invocation` と path をリトライに使う。

承認で昇格したプロジェクトも、実体（ディレクトリ・openspec ルート・ワークフロースキーマ）が揃っている限り一覧に載る SHALL。昇格後の実行（steering）の `invocation` が `failed` になったとき、巡回が拾えるのはこの一覧に載っているからである。

#### Scenario: 一覧する

- **WHEN** `GET /api/sessions` が要求される
- **THEN** 実体の揃った全セッションについて、id・phase・時点情報・path・`invocation` が返る

#### Scenario: 作成直後のセッションは載らない

- **WHEN** 概要の受理直後で、まだ初回の起動が行われていないセッションがある状態で一覧が要求される
- **THEN** そのセッションは一覧に載らない

#### Scenario: 昇格したプロジェクトが載る

- **WHEN** 承認で昇格したプロジェクトがある状態で一覧が要求される
- **THEN** その件も id（プロジェクト名）・phase・時点情報・path・`invocation` 付きで一覧に載る

#### Scenario: 何も残っていない

- **WHEN** セッションが1件も残っていない状態で一覧が要求される
- **THEN** 空の一覧が返る
