## REMOVED Requirements

### Requirement: W1 /api/sessions/:id/ws/question — 今の1問分を配信する

**Reason**: 配信の時点を「問いの提出（A5）の受理」から「その提出を行った実行の決着」へ移す。受理の時点では claude の実行が終わっておらず、回答できる状態がその前に立ってしまう（`agent/invocation`「完了は output stream で検知して idle に変える」）。

**Migration**: endpoint・メッセージの形・接続時配信は変わらない。変わるのは提出時配信の時点だけで、下の ADDED による。

### Requirement: W2 /api/sessions/:id/ws/proposal — proposal と名前候補を配信する

**Reason**: 配信の時点を「proposal の提出（A7）の受理」から「その提出を行った実行の決着」へ移す。受理の時点では claude の実行が終わっておらず、承認できる局面がその前に立ってしまう。

**Migration**: endpoint・メッセージの形・接続時配信は変わらない。変わるのは提出時配信の時点だけで、下の ADDED による。

## ADDED Requirements

### Requirement: W1 /api/sessions/:id/ws/question — 今の1問分を実行の決着で配信する

システムは `/api/sessions/:id/ws/question` の WS 配信を公開する SHALL。**問いを提出した実行が決着した瞬間**（`agent/invocation`「完了は output stream で検知して idle に変える」）、および画面が接続した瞬間に、今の1問分を配信する SHALL。提出の受理（A5）の時点で配信してはならない（MUST NOT）——その時点では実行がまだ終わっていない。

配信はサーバから画面への一方向とし、画面からこの口へ何も送らせてはならない（MUST NOT）。

#### Scenario: 実行の決着で配信される

- **WHEN** 問いを提出した実行が完了し、invokeAi が決着する
- **THEN** 接続中の画面へ今の1問分が配信される

#### Scenario: 提出の受理では配信されない

- **WHEN** 実行中の claude が問いを提出し、受理される
- **THEN** その時点では配信されない。実行が決着したときに配信される

#### Scenario: 接続の瞬間に配信される

- **WHEN** 画面が `/api/sessions/:id/ws/question` に接続する
- **THEN** その瞬間の今の1問分が配信される

#### Scenario: 画面から送信する

- **WHEN** 画面がこの口へ何かを送ろうとする
- **THEN** システムはそれを受け付けず、状態は何も変わらない

### Requirement: W2 /api/sessions/:id/ws/proposal — proposal と名前候補を実行の決着で配信する

システムは `/api/sessions/:id/ws/proposal` の WS 配信を公開する SHALL。**proposal を提出した実行が決着した瞬間**（`agent/invocation`「完了は output stream で検知して idle に変える」。phase が `proposed` に切り替わるのと同時）、および画面が接続した瞬間に、proposal と名前候補を配信する SHALL。提出の受理（A7）の時点で配信してはならない（MUST NOT）——その時点では実行がまだ終わっておらず、承認できる局面ではない。

配信はサーバから画面への一方向とし、画面からこの口へ何も送らせてはならない（MUST NOT）。

#### Scenario: 実行の決着で配信される

- **WHEN** proposal を提出した実行が完了し、invokeAi が決着する
- **THEN** phase が `proposed` になり、接続中の画面へ proposal と名前候補が配信される

#### Scenario: 提出の受理では配信されない

- **WHEN** 実行中の claude が proposal を提出し、受理される
- **THEN** その時点では配信されず、phase も変わらない。実行が決着したときに配信される

#### Scenario: 接続の瞬間に配信される

- **WHEN** 画面が `/api/sessions/:id/ws/proposal` に接続する
- **THEN** その瞬間の proposal と名前候補が配信される

#### Scenario: 画面から送信する

- **WHEN** 画面がこの口へ何かを送ろうとする
- **THEN** システムはそれを受け付けず、状態は何も変わらない
