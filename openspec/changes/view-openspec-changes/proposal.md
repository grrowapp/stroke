## Why

プロジェクトの開発は OpenSpec の change として進むが、その change（進行中・アーカイブ済みとも）を読む手段が CLI とファイルの直読みしかない。プロジェクトの下層画面から、そのプロジェクトの `openspec/changes/` を確認できるようにする。

**範囲の判断**: 見せる場所は「先にプロジェクト（下層）」とする。ポータル（上層）は横断の場であり、複数プロジェクトの change をどう束ねるかは別の検討が要るため、本 change には含めない。

## What Changes

- **ticket の置き場を新設する**: `openspec/tickets/<change-id>.md`。change に付随する自由記述のメモであり、change ディレクトリの中に memo ファイルを置く代わりにここへ置く。
- プロジェクトの下層に **changes 画面**を新設する。対象はそのプロジェクト配下の `openspec/`。
- 一覧の**主役は ticket** とする。一覧の起点は `openspec/tickets/` に並ぶ ticket で、ticket からその change のアーティファクト（proposal / specs / design / tasks など）へ辿って読める。
- 進行中の change と、`archive/` 配下のアーカイブ済み change の**両方**を辿れる。ticket が無い change の見せ方は specs で定める。
- **読むだけ**とする。change やアーティファクトの作成・編集・削除は置かない（下層の操作制限を広げない）。
- プロジェクトに `openspec/` が無い場合は、その旨を示す（空白や取得中のまま止まった画面にしない）。
- 対象はプロジェクト配下の実ファイルであり、本家（spec-workflow-mcp）のデータではない（ADR 0005 には当たらない）。

## Capabilities

### New Capabilities

- `openspec-changes`: プロジェクト配下の OpenSpec の閲覧。`openspec/tickets/<change-id>.md` を起点とした一覧、ticket から change のアーティファクトへの辿り、進行中とアーカイブの区分、ticket や `openspec/` が無い場合の振る舞いを定める。

### Modified Capabilities

- `project-workspace`: 下層の画面構成（仕様書 / ステアリング / タスク / 承認の4画面、それ以外を持たない）の要件に changes 画面を加える。閲覧のみのため、状態を変える操作の要件は変えない。

## Impact

- 画面: `app/pages/projects/[projectId]/` 配下に changes 画面、`app/layouts/workspace.vue` のナビゲーションに項目追加。
- サーバ: プロジェクト配下 `openspec/tickets/` と `openspec/changes/` の一覧・本文取得の API を `server/` に追加。
- 規約: `openspec/tickets/<change-id>.md` はこの change が新しく導入する置き場。`docs/agents/issue-tracker.md` への追記が要る（実装時に対応）。
- 現状 `/opt/projects/` 配下に `openspec/` を持つプロジェクトは無い（実測 2026-08-24）。「無い場合」の表示が最初の実態になる。
- ポータル（横断）側での確認は要検討のまま本 change の範囲外。やるなら別 change。
