# specs/api/session/approve — delta

## Purpose

承認を受理する endpoint（U10）を規定する。確定された名前の受け取りから、昇格の実行、次の実行の起こしまでを担い、応答は次の実行の完了を待たない。

## ADDED Requirements

### Requirement: U10 POST /api/sessions/:id/approve — 承認を受理して昇格を実行する

システムは `POST /api/sessions/:id/approve` を公開する SHALL。確定された名前を受け取り、昇格（`project/generation` が規定する rename）を実行する。

昇格が成功したら次の実行を起こし、その完了を待たずに受理を返す SHALL。昇格が失敗したときは失敗を返し、次の実行を起こしてはならない（MUST NOT）。

昇格が失敗したとき、phase は `proposed` のままとし、同じセッションでユーザーが再度承認できる状態を保つ SHALL。**phase が `approved` なのに昇格していない**宙吊りの状態を作ってはならない（MUST NOT）。

存在しないセッション id への承認は受理しない SHALL。

#### Scenario: 承認が成功する

- **WHEN** 確定された名前を伴う承認が `POST /api/sessions/:id/approve` に届き、昇格が成功する
- **THEN** 受理が返る。応答は次の実行の完了を待たない

#### Scenario: 昇格が失敗する

- **WHEN** 承認が届いたが昇格が失敗する
- **THEN** 失敗が返り、次の実行は起こされない。phase は `proposed` のまま、セッションは元の名前で残り、ユーザーは再度承認できる

#### Scenario: 存在しない id で承認が届く

- **WHEN** 存在しないセッション id に承認が届く
- **THEN** システムは受理せず、存在しないことを伝え、何も変えない
