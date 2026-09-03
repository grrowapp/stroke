# bootstrap/system/cleanup-agent-process Specification

## Purpose
サーバーの起動ごとに、前のプロセスが残した実行を後始末する。走っている claude を終了させてから記録を畳むことで、起こし直したときに同じ会話へ2本目の claude が並ぶことを防ぐ。

## Requirements

### Requirement: 起動のたびに残った実行を後始末する

システムはサーバーの起動ごとに1回、`invocation` が `running` のまま残っている対象を後始末する SHALL。後始末は巡回とは別の処理とし、巡回に兼ねさせてはならない（MUST NOT）。

対象が1件も無いときは何もしない SHALL。

#### Scenario: 残った実行がある状態で起動する

- **WHEN** サーバーが起動し、`invocation` が `running` の対象が残っている
- **THEN** システムはその対象すべてを後始末の判定にかける

#### Scenario: 残った実行が無い状態で起動する

- **WHEN** サーバーが起動し、`invocation` が `running` の対象が1件も無い
- **THEN** システムは何もせず、記録を変えない

### Requirement: 走っている claude を終了させてから記録を畳む

システムは、対象の実行に対応する claude が走っているとき、それを終了させる SHALL。**終了したことを確かめてから** `invocation` を `failed` に変える SHALL。終了を確かめる前に `failed` に変えてはならない（MUST NOT）。

終了処理の途中の claude は、まだ記録を書き換えうる。確かめずに `failed` を書くと、その後の書き換えで記録が食い違う。

#### Scenario: 対応する claude が走っている

- **WHEN** 対象の実行に対応する claude が走っている
- **THEN** システムはそれを終了させ、終了したことを確かめたうえで `invocation` を `failed` に変える

#### Scenario: 対応する claude がどこにも走っていない

- **WHEN** 対象の実行に対応する claude が1つも走っていない
- **THEN** システムは `invocation` を `failed` に変える

### Requirement: 終わらせられなかった実行は error にする

システムは、claude を終了させられなかったとき、または終了したことを確かめられなかったとき、`invocation` を `error` に変える SHALL。走っているものを調べられないときも `error` に変える SHALL。

`error` にした対象を自動で起こし直してはならない（MUST NOT）。終了を確かめられていない以上、起こし直せば2本目が並びうる。回復はユーザーの操作に委ねる。

#### Scenario: 終了させられない

- **WHEN** 対応する claude を終了させられない、または終了したことを確かめられない
- **THEN** システムは `invocation` を `error` に変え、その対象を自動で起こし直さない

#### Scenario: 走っているものを調べられない

- **WHEN** 走っているプロセスを調べられない環境である
- **THEN** システムは判定を諦め、対象の `invocation` を `error` に変える。例外で起動を止めてはならない

### Requirement: 起こしたインスタンスを判定条件にしない

システムは、その実行をどのサーバーインスタンスが起こしたかを、後始末の判定条件にしてはならない（MUST NOT）。対象の実行を指していると判定できた claude は、このアプリが起こしたものとして扱う SHALL。

同じ保存先を複数のサーバーインスタンスで共有する前提を置かない。その前提は単一インスタンスで動かす通常の運用には不要である。

#### Scenario: 対象を指している claude が走っている

- **WHEN** 対象の実行を指していると判定できる claude が走っている
- **THEN** システムはそれを終了の対象とする。どのインスタンスが起こしたかは問わない
