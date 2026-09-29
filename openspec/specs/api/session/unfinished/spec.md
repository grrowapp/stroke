# api/session/unfinished Specification

## Purpose
中断したストローク——昇格前（`stroking` / `proposed`）のセッション——を一覧して返す。完全な失敗に達した対象へ、離れた先から戻る道を上層に持たせるための口である。

## Requirements

### Requirement: 昇格前のセッションを一覧する

システムは、昇格前（`stroking` / `proposed`）のセッションを一覧して返す endpoint を持つ SHALL。各件は id・phase・時点情報・対象のディレクトリ・実行の記録とし、新しいものから並べる SHALL。返すのは、要求した利用者が見られるセッションだけとする SHALL（`access/permission`）。

昇格した対象（`approved` / `activated`）を返してはならない（MUST NOT）——あれはプロジェクトであり、プロジェクトの一覧が返す。

#### Scenario: 昇格前のセッションがある

- **WHEN** 保存先に `stroking` と `proposed` のセッションがある状態で一覧する
- **THEN** その2件が、phase と実行の記録つきで返る

#### Scenario: 昇格した対象は返らない

- **WHEN** 保存先に昇格したプロジェクト（`approved` / `activated`）だけがある状態で一覧する
- **THEN** 1件も返らない

### Requirement: 母集合は state.json だけで決める

この endpoint の母集合は、**`state.json` を持つディレクトリ**とする SHALL。実行環境（openspec ルートとスキーマ設定）が揃っているかを検査してはならない（MUST NOT）。

理由は、実行環境が初回の起動で整えられることにある。その起動が失敗し続けたセッションは実行環境を持たないが、自動では動かない対象であり（`portal/batch` の巡回は一覧に載らないものを拾えない）、**戻り道がいちばん要る**。検査を持ち込むと、いちばん拾いたいものが落ちる。

読めないディレクトリと `state.json` を持たないディレクトリは、返す一覧から黙って落とす SHALL——保存先には無関係なディレクトリも並びうる。

#### Scenario: 初回の起動に失敗したセッション

- **GIVEN** 概要の投稿の後、初回の起動が実行環境を整えられずに失敗し、openspec ルートを持たないセッションがある
- **WHEN** 中断したストロークを一覧する
- **THEN** そのセッションは一覧に載る

#### Scenario: 無関係なディレクトリ

- **WHEN** 保存先に `state.json` を持たないディレクトリがある状態で一覧する
- **THEN** そのディレクトリは一覧に載らない
