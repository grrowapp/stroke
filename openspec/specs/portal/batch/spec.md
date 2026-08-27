# portal/batch Specification

## Purpose
サーバーの定期的な巡回を規定する。失敗した AI 実行を拾って起動し直すことだけを担い、判定は API の応答のみに拠る。

## Requirements

### Requirement: 巡回は failed だけを拾って起動し直す

システムは定期的な巡回を持ち、セッション一覧の API（U12）の応答の `invocation` が **`failed` のものだけ**を拾う SHALL。拾った各件について、応答に載る path を cwd に添えて、サーバー内から自身の AI 起動の API（U13）を HTTP で叩く SHALL。

巡回はそれ以外の条件判定を持ってはならない（MUST NOT）。何の作業をやり直すかも判定しない——実行の中身は会話の継続として再開される（`agent/invocation`）。ファイルを直接読んで判定してはならない（MUST NOT）。

#### Scenario: failed の実行を拾う

- **WHEN** 一覧の応答に `invocation` が `failed` の件がある状態で巡回が走る
- **THEN** その件の path を cwd に添えて U13 が叩かれ、実行が起動し直される

#### Scenario: failed が無いときの巡回

- **WHEN** `failed` の件が1つも無い状態で巡回が走る
- **THEN** 何も起動されない

#### Scenario: 取得だけでは状態が変わらない

- **WHEN** 巡回が一覧を取得する
- **THEN** 取得そのものによって `invocation` は変化しない

### Requirement: running・idle・error は拾わない

システムは巡回で `running`・`idle`・`error` の件を拾ってはならない（MUST NOT）。`running` の時間切れ判定は invokeAi の責務であり、`idle` にはやり直すものが無く、`error` はリトライ上限に達した終端でユーザーに引き渡す。

#### Scenario: running の件がある

- **WHEN** `invocation` が `running` の件がある状態で巡回が走る
- **THEN** その件は起動し直されない

#### Scenario: error の件がある

- **WHEN** `invocation` が `error` の件がある状態で巡回が走る
- **THEN** その件は起動し直されず、`error` のまま残る
