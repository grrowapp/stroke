# api/session/ws Specification

## Purpose
画面への WS 配信の endpoint（W1・W2）を規定する。今の1問分と proposal を提出の受理・接続の瞬間に画面へ届けることを担い、配信はサーバから画面への一方向とする。

## Requirements

### Requirement: W1 /api/sessions/:id/ws/question — 今の1問分を配信する

システムは `/api/sessions/:id/ws/question` の WS 配信を公開する SHALL。問いの提出（A5）が受理された瞬間、および画面が接続した瞬間に、今の1問分を配信する SHALL。

配信はサーバから画面への一方向とし、画面からこの口へ何も送らせてはならない（MUST NOT）。

#### Scenario: 問いの受理で配信される

- **WHEN** 問いの提出が受理される
- **THEN** 接続中の画面へ今の1問分が配信される

#### Scenario: 接続の瞬間に配信される

- **WHEN** 画面が `/api/sessions/:id/ws/question` に接続する
- **THEN** その瞬間の今の1問分が配信される

#### Scenario: 画面から送信する

- **WHEN** 画面がこの口へ何かを送ろうとする
- **THEN** システムはそれを受け付けず、状態は何も変わらない

### Requirement: W2 /api/sessions/:id/ws/proposal — proposal と名前候補を配信する

システムは `/api/sessions/:id/ws/proposal` の WS 配信を公開する SHALL。proposal の提出（A7）が受理された瞬間、および画面が接続した瞬間に、proposal と名前候補を配信する SHALL。

配信はサーバから画面への一方向とし、画面からこの口へ何も送らせてはならない（MUST NOT）。

#### Scenario: proposal の受理で配信される

- **WHEN** proposal の提出が受理される
- **THEN** 接続中の画面へ proposal と名前候補が配信される

#### Scenario: 接続の瞬間に配信される

- **WHEN** 画面が `/api/sessions/:id/ws/proposal` に接続する
- **THEN** その瞬間の proposal と名前候補が配信される

#### Scenario: 画面から送信する

- **WHEN** 画面がこの口へ何かを送ろうとする
- **THEN** システムはそれを受け付けず、状態は何も変わらない
