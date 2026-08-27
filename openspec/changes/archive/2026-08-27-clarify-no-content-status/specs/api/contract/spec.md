## Purpose

正常に成立した要求へ返す応答コードの規約を定める。受理で完結する操作が 204 を返すこと、読み取りが 204 を返さないことを規定し、個別 endpoint の spec が自分の入出力だけを持てるようにする。

## ADDED Requirements

### Requirement: 受理で完結する操作は本文を持たない応答を返す

システムは、受理と記録で完結する操作が成立したとき、要求した相手へ本文を持たない応答を返す SHALL。応答のステータスは 204 とする。

204 は「操作を受理し、返す本文が無い」ことを表す。

対象は次の操作である。回答（U7）・差し戻し（U9）・承認（U10）・問い（A5）・proposal（A7）・実行の記録（A8）。

受理が成立した応答に本文を載せてはならない（MUST NOT）。

#### Scenario: 画面が回答を送る

- **GIVEN** phase が `stroking` のセッションが在り、答えるべき問いが 1 件出ている
- **WHEN** 画面が `POST /api/sessions/:id/answer` へ `Answer`（`{ kind: 'free', value: '<回答の本文>' }`）を送る
- **THEN** 画面へステータス 204 が返り、応答に本文は無い

#### Scenario: 画面が差し戻しを送る

- **GIVEN** phase が `proposed` のセッションが在る
- **WHEN** 画面が `POST /api/sessions/:id/send-back` へ 1 件以上の指摘を持つ `SendBackPayload` を送る
- **THEN** 画面へステータス 204 が返り、応答に本文は無い

#### Scenario: 画面が承認を送る

- **GIVEN** phase が `proposed` のセッションが在り、`docs/proposal.md` が在り、昇格先の名前が使える
- **WHEN** 画面が `POST /api/sessions/:id/approve` へ `{ projectName: '<名前>' }` を送る
- **THEN** 画面へステータス 204 が返り、応答に本文は無い

#### Scenario: エージェントが問いを送る

- **GIVEN** phase が `stroking` のセッションが在る
- **WHEN** エージェントが `POST /api/strokes/:id/question` へ `Question`（`header` / `detail` / `question` / `options[]`）を送る
- **THEN** エージェントへステータス 204 が返り、応答に本文は無い

#### Scenario: エージェントが proposal を送る

- **GIVEN** phase が `stroking` のセッションが在り、`docs/proposal.md` へ書き込める
- **WHEN** エージェントが `POST /api/strokes/:id/proposal` へ `{ proposal: '<本文>' }` を送る
- **THEN** エージェントへステータス 204 が返り、応答に本文は無い

#### Scenario: invokeAi が実行の記録を送る

- **GIVEN** 対象の id を持つセッションが保存されている
- **WHEN** invokeAi が `POST /api/strokes/:id/submission` へ `{ invocation: 'running' }` を送る
- **THEN** invokeAi へステータス 204 が返り、応答に本文は無い

### Requirement: 読み取りの応答に 204 を使わない

システムは、GET に対する応答に 204 を使ってはならない（MUST NOT）。成立した GET は要求した相手へ 200 を返す SHALL。

これは副作用を持つ GET——AI の起動（U13）——にも当てはまる。起動要求を受理したときは 200 を返す SHALL。

#### Scenario: 画面が AI の起動を要求する

- **GIVEN** 対象の id を持つセッションが保存され、`invocation` が `running` でない
- **WHEN** 画面が `GET /api/sessions/:id/invoke-agent` を cwd 付きで読む
- **THEN** 画面へステータス 200 が返る。204 は返らない

#### Scenario: 画面がセッションの状態を読む

- **GIVEN** 対象の id を持つセッションが保存されている
- **WHEN** 画面が `GET /api/sessions/:id` を読む
- **THEN** 画面へステータス 200 が返り、phase と `invocation` が本文で返る
