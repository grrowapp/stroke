# api/contract Delta

## MODIFIED Requirements

### Requirement: 受理で完結する操作は本文を持たない応答を返す

システムは、受理と記録で完結する操作が成立したとき、要求した相手へ本文を持たない応答を返す SHALL。応答のステータスは 204 とする。

204 は「操作を受理し、返す本文が無い」ことを表す。

対象は次の操作である。回答（U7）・差し戻し（U9）・承認（U10）・問い（A5）・proposal（A7）・実行の記録（A8）・生成（P2）。

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

#### Scenario: サーバーが生成を送る

- **GIVEN** 昇格したプロジェクトが `projectShareRoot` の直下に在り、本家 dashboard が動いている
- **WHEN** 承認の後の実行の準備が `POST /api/projects` へ `{ projectPath: '<そのディレクトリ>' }` を送る
- **THEN** ステータス 204 が返り、応答に本文は無い
