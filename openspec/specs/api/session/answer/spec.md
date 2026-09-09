# api/session/answer Specification

## Purpose
問いへの回答を受理する endpoint（U7 `POST /api/sessions/:id/answer`）を規定する。回答の記録と状態の更新までを担い、AI の起動を含まない。api/answer を path 変更込みで引き継いだもの。

## Requirements

### Requirement: U7 POST /api/sessions/:id/answer — 回答を受理して記録する

システムは `POST /api/sessions/:id/answer` を公開する SHALL。回答——ユーザーが選んだ選択肢、または自由入力の本文——を受理したときは AI を起動せず、回答を履歴の記録に加えて完結する SHALL。

空の回答は受理してはならない（MUST NOT）。存在しないセッション id への回答は受理せず、何も記録しない。承認以降の局面（phase が `approved` または `activated`）にあるものへの回答は受理せず、何も記録しない。断る理由は「承認済みである」ことであり、問いの有無を理由にしてはならない（MUST NOT）。

#### Scenario: 選択肢で回答する

- **WHEN** 選択肢を1つ選んだ回答が `POST /api/sessions/:id/answer` に届く
- **THEN** どの選択肢を選んだかが記録され、受理が返る。AI の起動はこの endpoint では行われない

#### Scenario: 自由入力で回答する

- **WHEN** 自由入力の本文による回答が届く
- **THEN** その本文が回答として記録され、受理が返る

#### Scenario: 空の回答が届く

- **WHEN** 選択も本文も持たない回答が届く
- **THEN** システムは受理せず、回答が必要である旨を返す

#### Scenario: 存在しないセッション id で回答が届く

- **WHEN** 存在しないセッション id に対する回答が届く
- **THEN** システムは受理せず、存在しないことを伝え、何も記録しない

#### Scenario: 実行中のセッションに回答が届く

- **WHEN** 実行中の呼び出しを持つセッションに回答が届く
- **THEN** 回答は受理され記録される。AI の起動はこの endpoint では行われない

#### Scenario: 承認後のセッションに回答が届く

- **WHEN** phase が `approved` のセッションに回答が届く
- **THEN** システムは受理せず、承認済みであることを伝え、何も記録しない

#### Scenario: 完成したプロジェクトに回答が届く

- **WHEN** phase が `activated` のプロジェクトの id に回答が届く
- **THEN** システムは受理せず、承認済みであることを伝え、何も記録しない
