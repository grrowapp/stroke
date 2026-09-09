## ADDED Requirements

### Requirement: パスから本家の projectId を引き当てる

システムは、あるパスに対応する本家の `projectId` を、本家 `GET /api/projects/list` の応答だけを手掛かりに引き当てなければならない（SHALL）。本家の登録簿ファイル（`activeProjects.json`）を projectId の引き当てのために読んではならない（MUST NOT）——引き当ては MCP ツールの代行経路にあり、`mcp/server`「ハンドラは対応する endpoint へ要求を発行してその応答だけから結果を作る」に従う。

**禁じているのは引き当てのための読み取りだけである。** 登録簿の読み取りそのものは、アクティブ判定の用途で認められている（ADR-0006「アクティブ判定だけを `activeProjects.json` / 本家 API で重ねる」）。上の「本家に書き込まない」は本家の状態を**変える**操作の規定であって、読み取りを禁じるものではない。

引き当ては、一覧のエントリの `projectPath` が、与えたパスと**一致する**ときにだけ成立しなければならない（SHALL）。比較の前に両側のパスを正規化する SHALL（`.` / `..` の畳み込みと末尾スラッシュの除去）。一致しないエントリを引き当ててはならない（MUST NOT）。

**本家は与えられたパスをそのまま登録するとは限らない。** 本家は登録の前にパスを自分の規則（`git rev-parse --show-toplevel`）で解決し、解決後のパスを一覧に載せる。解決でパスが変わると引き当ては外れるが、**その差をシステムが吸収して引き当ててはならない（MUST NOT）。** 差が出る場面では本家自身が複数のセッションを1つの `projectId` にまとめており、吸収して引き当てると別のセッションと共有の id を返して、steering 文書を取り違えて書くことになる。引き当てを外し、失敗として返すこと。

システムは、本家がパスをどう解決するかの手続き（git のトップレベルを取るなど）を自分で再実行してはならない（MUST NOT）。再実行は本家の実装への依存を複製するだけで、本家の版が変われば同じ形で壊れる。

引き当てられなかったときは、その旨を失敗として返さなければならない（SHALL）。失敗の形と本文の要件は `mcp/server` にある。

#### Scenario: 与えたパスがそのまま登録されている

- **GIVEN** 本家の一覧に `projectPath` が `/opt/projects/example` のエントリがある
- **WHEN** `/opt/projects/example` に対応する `projectId` を引き当てる
- **THEN** そのエントリの `projectId` が返る

#### Scenario: 書き方が違うだけのパスは引き当てる

- **GIVEN** 本家の一覧に `projectPath` が `/opt/projects/example/` のエントリがある
- **WHEN** `/opt/projects/foo/../example` に対応する `projectId` を引き当てる
- **THEN** 正規化した結果が一致するので、そのエントリの `projectId` が返る

#### Scenario: 一致するエントリが1件も無い

- **GIVEN** 本家の一覧に、与えたパスと一致するエントリが無い
- **WHEN** そのパスに対応する `projectId` を引き当てる
- **THEN** 引き当ては成立せず、失敗として返る。本家の登録簿ファイルは読まれない

## MODIFIED Requirements

### Requirement: 本家の状態を定期ポーリングで取りに行かない

システムは、本家の状態変化を WebSocket の受信を起点として扱わなければならない（SHALL）。本家 REST を定期的に呼んで変化を探ってはならない（MUST NOT）。本家 REST は、画面または MCP ツールからの要求を受けたときにのみ呼ぶ SHALL——要求を伴わない呼び出しを行ってはならない（MUST NOT）。

#### Scenario: 何も起きていない間

- **WHEN** 本家で承認依頼もタスクの変化も起きていない
- **THEN** stroke-board から本家への REST 呼び出しは発生しない
