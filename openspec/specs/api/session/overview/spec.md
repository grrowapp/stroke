# api/session/overview Specification

## Purpose
概要の投稿を受理してセッションを作る endpoint（U1）を規定する。セッションの作成と状態の初期化までを担い、AI の起動を含まない。api/overview を path 変更とともに引き継いだもの。

## Requirements

### Requirement: U1 POST /api/sessions — 概要の投稿を受理してセッションを作る

システムは `POST /api/sessions` を公開する SHALL。概要の投稿を受理したときは AI を起動せず、セッションを1つ作成して phase を `stroking` とし、セッション id を返して完結する SHALL。

空の概要は受理してはならない（MUST NOT）。受理しなかったときはセッションを作らない。

#### Scenario: 概要を投稿する

- **WHEN** 概要の投稿が `POST /api/sessions` に届く
- **THEN** セッションが1つ作成され、phase は `stroking` となり、セッション id が返る。AI の起動はこの endpoint では行われない

#### Scenario: 空の概要が届く

- **WHEN** 概要が空の投稿が届く
- **THEN** システムはセッションを作成せず、入力が必要である旨を返す
