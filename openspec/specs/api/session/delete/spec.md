# api/session/delete Specification

## Purpose
セッションの削除を受理する endpoint（U11 `DELETE /api/sessions/:id`）を規定する。セッションに属するものを残さず消すことと、実行中の削除を受けないことを担う。api/session の削除の要件をメソッドと path の変更込みで引き継いだもの。

## Requirements

### Requirement: U11 DELETE /api/sessions/:id — セッションを消す

システムは `DELETE /api/sessions/:id` でセッションの削除を受け付ける SHALL。削除が成立したとき、そのセッションに属するもの——セッションディレクトリ配下の状態・生成物・openspec の change——は残らない SHALL。片方だけ消えて片方が残る状態を作ってはならない（MUST NOT）。

存在しないセッション id への削除は受理せず、何も消さない SHALL。

#### Scenario: 消す

- **WHEN** 実行中の呼び出しを持たないセッションに `DELETE /api/sessions/:id` が要求される
- **THEN** そのセッションに属するものは残らず消え、以後そのセッションは存在しないものとして扱われる

#### Scenario: 存在しないセッションを消そうとする

- **WHEN** 存在しないセッション id の削除が要求される
- **THEN** システムは存在しないことを伝え、何も消さない

### Requirement: 実行中の呼び出しを持つセッションの削除は受理しない

システムは、実行中の呼び出しを持つセッションへの `DELETE /api/sessions/:id` を受理しない SHALL。既存の busy と同じ扱いとし、呼び出しが終わってから消せる。

#### Scenario: 実行中に消そうとする

- **WHEN** 実行中の呼び出しを持つセッションの削除が要求される
- **THEN** システムは受理せず busy であることを伝え、セッションに属するものは何も消えない

#### Scenario: 呼び出しが終わった後に消す

- **WHEN** 実行中だった呼び出しが終わったセッションに、再び削除が要求される
- **THEN** システムは受理し、セッションに属するものは残らず消える
