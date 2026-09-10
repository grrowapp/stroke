## MODIFIED Requirements

### Requirement: 本家の状態を定期ポーリングで取りに行かない

システムは、本家の状態変化を WebSocket の受信を起点として扱わなければならない（SHALL）。本家 REST を定期的に呼んで変化を探ってはならない（MUST NOT）。本家 REST は、次の3つの契機でのみ呼ぶ SHALL——要求を伴わない呼び出しを行ってはならない（MUST NOT）。

- 画面からの要求を受けたとき
- MCP ツールからの要求を受けたとき
- **起動処理（invoke-agent）が steering 工程の実行の終了を検知し、その実行の目的が果たされたかを確かめるとき**（`agent/invocation`「作業が行われたかの判定を工程ごとに持ち、完成の記録より先に問う」）。1回の実行の終了につき1度の確認であり、繰り返しの呼び出しではない

#### Scenario: 何も起きていない間

- **WHEN** 本家で承認依頼もタスクの変化も起きていない
- **THEN** stroke-board から本家への REST 呼び出しは発生しない

#### Scenario: steering の実行が終わる

- **WHEN** steering 工程の実行が終了する
- **THEN** 起動処理がその1度だけ本家 REST で文書と承認依頼を確かめ、以後は次の実行が終わるまで本家 REST を呼ばない
