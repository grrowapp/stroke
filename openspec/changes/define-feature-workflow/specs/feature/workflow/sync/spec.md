## Purpose

feature の工程の締めの定義。feature 固有の sync 工程は定義せず、本家の archive を起点に openspec 標準のライフサイクル（sync → archive）へ接合する。実行の担い手は実装時の設計で決める。

## ADDED Requirements

### Requirement: 締めは本家の archive を起点とする

feature の締めは本家の archive（spec-workflow が元々持つ機能）を起点とする SHALL。このとき requirements.md は対応する change（`openspec/changes/<change-id>/`）へ移される SHALL（戻す接合）。

#### Scenario: 戻す接合

- **WHEN** tasks が全完了した feature `api__session` が本家で archive される
- **THEN** その requirements.md は対応する change へ移されている

### Requirement: 以降は openspec 標準の sync → archive を使う

戻す接合の後は openspec 標準の sync → archive をそのまま使う SHALL。sync は change 内の delta（`specs/<階層パス>/`）を同じパスの `openspec/specs/` へ反映する。spec 名から配置先を計算してはならない MUST NOT（openspec 側は常に階層パスが正である）。

#### Scenario: 確定した仕様の置き場

- **WHEN** feature `api__session` の締めが完了している
- **THEN** 確定した仕様は `openspec/specs/api/session/spec.md` にあり、change は archive されている

### Requirement: openspec の specs に入る spec は機能的 spec の形式に適合する

`openspec/specs/` に入る spec.md は openspec の機能的 spec の形式（Requirement + Scenario）に適合する SHALL。

#### Scenario: 配置された spec の形式

- **WHEN** 締めを経て `openspec/specs/` 配下に置かれた spec.md を参照する
- **THEN** Requirement と Scenario で構成された機能的 spec である
