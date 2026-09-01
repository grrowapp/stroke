## ADDED Requirements

### Requirement: パスから本家の projectId を引き当てる

システムは、あるパスに対応する本家の `projectId` を、本家 `GET /api/projects/list` の応答だけを手掛かりに引き当てなければならない（SHALL）。本家の登録簿ファイル（`activeProjects.json`）を projectId の引き当てのために読んではならない（MUST NOT）——本家の状態を触るのは本家の API を通してのみ、という上の規定と、代行先の応答だけから結果を作るという `mcp/server` の規定に従う。

**本家は与えられたパスをそのまま登録するとは限らない。** 本家は登録の前にパスを自分の規則で解決し、解決後のパスを一覧に載せる。システムは、与えたパスと一覧の `projectPath` が文字列として一致することを前提にしてはならない（MUST NOT）。

引き当ては、一覧のエントリの `projectPath` が、与えたパスと**同じか、その祖先**であるときに成立しなければならない（SHALL）。比較の前に両側のパスを正規化し（`.` / `..` の畳み込みと末尾スラッシュの除去）、パスの構成要素の境界でのみ祖先とみなす SHALL——文字列の前方一致で判定してはならない（MUST NOT。`/opt/projects/example` は `/opt/projects/example-2` の祖先ではない）。祖先でも一致でもないエントリを引き当ててはならない（MUST NOT）。

候補が複数あるときは、`projectPath` が最も深いもの（パスの構成要素が最も多いもの）を1つ採る SHALL。深さが同じ候補が複数残る状態は本家の一覧に同じパスが二重に載っている場合だけで、そのときは従来どおり一覧の先頭側を採り、新しい失敗を作ってはならない（MUST NOT）。

システムは、本家がパスをどう解決するかの手続き（git のトップレベルを取るなど）を自分で再実行してはならない（MUST NOT）。再実行は本家の実装への依存を複製するだけで、本家の版が変われば同じ形で壊れる。

引き当てられなかったときは、その旨を失敗として返さなければならない（SHALL）。失敗の形と本文の要件は `mcp/server` にある。

#### Scenario: 与えたパスがそのまま登録されている

- **GIVEN** 本家の一覧に `projectPath` が `/opt/projects/example` のエントリがある
- **WHEN** `/opt/projects/example` に対応する `projectId` を引き当てる
- **THEN** そのエントリの `projectId` が返る

#### Scenario: 本家が解決した結果、登録されたパスが与えたパスの祖先になっている

- **GIVEN** 本家の一覧に `projectPath` が `/opt/projects` のエントリだけがある
- **WHEN** `/opt/projects/example` に対応する `projectId` を引き当てる
- **THEN** そのエントリの `projectId` が返る

#### Scenario: 祖先が複数あるときは深い方を採る

- **GIVEN** 本家の一覧に `projectPath` が `/opt/projects` のエントリと `/opt/projects/example` のエントリの両方がある
- **WHEN** `/opt/projects/example/sub` に対応する `projectId` を引き当てる
- **THEN** `/opt/projects/example` のエントリの `projectId` が返る

#### Scenario: 名前が前方一致するだけのエントリを引き当てない

- **GIVEN** 本家の一覧に `projectPath` が `/opt/projects/example` のエントリだけがある
- **WHEN** `/opt/projects/example-2` に対応する `projectId` を引き当てる
- **THEN** 引き当ては成立せず、失敗として返る

#### Scenario: 対応するエントリが1件も無い

- **GIVEN** 本家の一覧に、与えたパスと同じでも祖先でもないエントリしかない
- **WHEN** そのパスに対応する `projectId` を引き当てる
- **THEN** 引き当ては成立せず、失敗として返る。本家の登録簿ファイルは読まれない

## MODIFIED Requirements

### Requirement: 本家の状態を定期ポーリングで取りに行かない

システムは、本家の状態変化を WebSocket の受信を起点として扱わなければならない（SHALL）。本家 REST を定期的に呼んで変化を探ってはならない（MUST NOT）。本家 REST は、画面または MCP ツールからの要求を受けたときにのみ呼ぶ SHALL——要求を伴わない呼び出しを行ってはならない（MUST NOT）。

#### Scenario: 何も起きていない間

- **WHEN** 本家で承認依頼もタスクの変化も起きていない
- **THEN** stroke-board から本家への REST 呼び出しは発生しない
