## Why

仕様書管理（change `spec-document-management`）はプロジェクト配下 `docs/` の**既存**文書の一覧・閲覧・編集・削除を扱う。新しい文書を起こす口はそこに含めていない。文書を増やせなければドキュメントとしての仕様書は育たないので、作成の口を用意する。

**前提**: 本 change は `spec-document-management`（capability `spec-documents` の新設）の完了を前提とする。あわせて `define-feature-workflow`（feature / 仕様書の2レーンを定める仕様定義）の確定も前提とし、specs / design の作成は確定した仕様定義への**完全準拠**で進める。

## What Changes

- 仕様書管理画面から、プロジェクト配下 `docs/` に**新しい仕様書文書を作成**できるようにする。
- 作成はサーバ API 経由で行う。画面が直接ファイルを書くのではなく、API が `docs/` 配下にファイルを作る。
- 作成対象はプロジェクト配下の実ファイルであり、本家（spec-workflow-mcp）のデータには触れない（ADR 0005 には当たらない）。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `spec-documents`: 文書の**作成**の要件を加える（`spec-document-management` が新設する capability への追加。名前の付け方・既存名との衝突の扱いを含む）。
- `project-workspace`: 下層で状態を変えられる操作に、`docs/` 配下の文書の作成を加える。

## Impact

- **change 間の依存**: `spec-document-management` の完了が先。仕様書管理画面と `docs/` の API がそこで生まれる。
- 画面: 仕様書管理画面に作成の UI を追加。
- サーバ: `docs/` 配下への作成 API を `server/` に追加。
- **`define-feature-workflow` の確定による影響**（2026-08-27 承認。正は `docs/feature/overview.md`）: feature レーンの定義が確定し、準拠の参照先が定まった。ticket（`openspec/tickets/<change名>.md`。起票時に作られ、概要のみ・以後追記しない）等の確定は feature レーン側の定義であり、仕様書レーンは仮決めのまま。本 change の範囲・内容への変更はない。
