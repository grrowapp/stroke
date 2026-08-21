# api/overview Delta

## Purpose

概要の投稿を受理する endpoint を規定する。セッションの作成と状態の初期化までを担い、AI の起動を含まない。

## ADDED Requirements

### Requirement: 概要の投稿を受理してセッションを作る

システムは概要の投稿を受け付ける endpoint を1つ公開し、投稿を受理したときは AI を起動せず、セッションを1つ作成して phase を `stroking` とし、セッション id を返して完結する SHALL。

#### Scenario: 概要を投稿する

- **WHEN** 概要の投稿が届く
- **THEN** セッションが1つ作成され、phase は `stroking` となり、セッション id が返る。AI の起動はこの endpoint では行われない

#### Scenario: 空の概要が届く

- **WHEN** 概要が空の投稿が届く
- **THEN** システムはセッションを作成せず、入力が必要である旨を返す
