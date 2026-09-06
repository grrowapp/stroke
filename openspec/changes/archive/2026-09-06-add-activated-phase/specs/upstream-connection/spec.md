## Purpose

`upstream-connection` から Requirement「本家に書き込まない」を撤廃する（ユーザー判断 2026-09-06、design Open Questions）。この change は P1 `DELETE /api/projects/:projectId` の断り方を `.spec-workflow/` の有無から phase へ移し、作りきれなかった `approved` のプロジェクトを `.spec-workflow/` ごと消す形にした（`api/project/delete`）。これは同 Requirement の「各プロジェクトの `.spec-workflow/` に対して直接の削除を行ってはならない」と衝突する。例外を開けるのでも P1 を変えるのでもなく、規定そのものを外す。

## REMOVED Requirements

### Requirement: 本家に書き込まない

**Reason**: P1 が stroke-board 自身の昇格で作り、完成に至らなかったプロジェクトを `.spec-workflow/` ごと消すことと衝突する。`.spec-workflow/` だけを残す形は孤児ディレクトリを作り、走査でそれが完了したプロジェクトとして並ぶので、この change が潰した症状（成果物の無いプロジェクトが完成として扱われる）を別の形で戻す。本家の状態を変える操作を本家の API 経由で行う実装（承認・却下、文書の保存）はそのまま残るが、規定としては持たない。

**Migration**: 実装の変更は無い。`docs/` に同じ規定を写した節は無い（2026-09-06 に `grep` で確認）。

## MODIFIED Requirements

### Requirement: パスから本家の projectId を引き当てる

システムは、あるパスに対応する本家の `projectId` を、本家 `GET /api/projects/list` の応答だけを手掛かりに引き当てなければならない（SHALL）。本家の登録簿ファイル（`activeProjects.json`）を projectId の引き当てのために読んではならない（MUST NOT）——引き当ては MCP ツールの代行経路にあり、`mcp/server`「ハンドラは対応する endpoint へ要求を発行してその応答だけから結果を作る」に従う。

**禁じているのは引き当てのための読み取りだけである。** 登録簿の読み取りそのものは、アクティブ判定の用途で認められている（ADR-0006「アクティブ判定だけを `activeProjects.json` / 本家 API で重ねる」）。

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
