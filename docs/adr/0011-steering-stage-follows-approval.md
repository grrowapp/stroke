# ADR-0011: 承認の次の工程として steering 作成を自動で始める

- **状態**: archive（2026-08-29。全貌は [`docs/specs/plan/portal-stroke-exit.md`](../specs/plan/portal-stroke-exit.md) に確定。対応する節 — 自動開始の流れ:「承認ボタン → 一覧へ戻る」／ 起動の形と cwd:「起動は1系統」／ `--mcp-config` の与え方:「設定に足すもの」／ 完了判定とリトライ:「完了とリトライ」）
- **日付**: 2026-08-25

## 決定

承認で `/opt/projects/<name>/docs/proposal.md` を生成したら、そこで終わりにせず、
続けて **steering 作成の工程**を自動で開始する。ユーザーの操作は挟まない。

- ストロークのセッションとは**別の claude** を立ち上げる。起動時に `--mcp-config` で
  本家 spec-workflow の MCP を与え、生成されたプロジェクトを作業場所にして steering 文書を作らせる
- `.spec-workflow/` の内部構造は、この claude が呼ぶ**本家 MCP が作る**。
  stroke-board 自身は作らない（`project-generation` の線引きは維持）

## 背景

承認直後のプロジェクトは `.spec-workflow/` を持たないため、ポータルの一覧に現れない
（change `connect-portal-and-strokes` の「出口の断絶」）。一覧の走査条件をゆるめる・
生成側が内部構造を作る・セッションからの導線だけ残す、の3案を比較していたが、
どれも「表示」の手当てに留まる。断絶の本質は **proposal.md 生成で工程が途切れ、
誰も次へ進めないこと**にあり、次の工程そのものを設けるのがこの決定である。

## 根拠

- 内部構造を作るのは本家 MCP なので、「こちらは内部構造を作らない」
  （`project-generation` spec・`.scratch/stroke-board-frontier/decisions.md`）を覆さない
- `.spec-workflow/` が本家の手でできるため、一覧の走査条件（`project-directory`）を
  変えずにプロジェクトが自然に現れる。出口の断絶は副作用として解ける
- steering は承認を経る文書（[ADR-0007](./0007-approval-category-and-destination.md)）で、
  ポータルの承認待ち・通知の仕組みにそのまま乗る。「見に行かずに承認待ちを知る」という
  プロダクトの目的と工程が噛み合う
- 実行主体・入力・応答を分けてエージェント実行を汎用化する構想
  （`docs/specs/plan/next-agent-run.md`）と同じ方向。steering 作成は2つ目の実行種別になる

## 影響

- `connect-portal-and-strokes` の出口側はこの方向で設計する。比較していた3案はいずれも採らない。
  proposal の3案の記述は書き直しの対象になる
- claude の起動種別が増える（`--mcp-config` 付き。現状の起動定義に `--mcp-config` は無い）。
  `openspec/specs/ai-invocation` と `docs/specs/core/settings-reference.md` に影響し、
  設定の正の改定には change とユーザー承認が要る（ADR 0004）
- ~~未決（design で詰める）: 新工程の進捗・失敗をユーザーがどこで見るか、
  MCP config の中身と置き場、steering 作成の完了をどう判定するか~~
  → 設計資料 [`docs/specs/plan/portal-stroke-exit.md`](../specs/plan/portal-stroke-exit.md)
  （2026-08-25 spec-workflow 承認）で決着:
  - 進捗・失敗はユーザーに見せない。steering のフェーズはサーバーが責任を持つ
    （起動時にメモリへ session-id を running として登録、timeout で false、
    失敗分はサーバーの巡回が API で拾ってリトライ）
  - MCP config は設定に持たず、生成先パスから導出して JSON 文字列を組み立て
    `--mcp-config` 引数で渡す（config ファイルは作らない）
  - 完了は claude 自身が API 経由で行う**提出の告知**で判定する
    （告知を受けた API が session-id の登録を消す）
