# ADR-0002: 本家 spec-workflow-mcp の観測結果に依存する

- **状態**: 採用
- **日付**: 2026-08-20

## 決定

stroke-board は本家 spec-workflow-mcp の**公開 API だけでなく、実装を読んで観測した振る舞いにも依存する**。基準は **v2.2.5** とする。

以下は稼働中の v2.2.5 と、そのソースから確認した事実である。同じ調査を繰り返さないために残す。本家を更新するときは、まずここを検証すること。

## 観測した事実

### アクティブなプロジェクトの判定

- アクティブとは、registry entry の `instances` に**生きた PID がある**状態を指す。`isProcessAlive(pid)` が `process.kill(pid, 0)` で判定する（`src/core/project-registry.ts`）
- registry の実体は `SPEC_WORKFLOW_HOME` 配下の `activeProjects.json`（既定は `~/.spec-workflow-mcp`）

### 本家 API は未接続プロジェクトを返さない

- `cleanupStaleProjects()` は、生きた instance が無いプロジェクトを **registry ごと削除**する
- MCP サーバーは `stop()` で自分の instance を unregister し、`instances` が空になるとエントリ自体が消える（`src/server.ts` / `project-registry.ts`）
- したがって `GET /api/projects/list` からは、止まっているプロジェクトを知る手段が無い

**stroke-board への影響**: プロジェクト一覧の母集合を本家 API から作れない。設定した親パスを走査し、`.spec-workflow` を持つディレクトリをプロジェクトとして拾う。アクティブ判定だけを `activeProjects.json` / 本家 API で重ねる。

### 生存確認は起動時の1回だけ

- `cleanupStaleProjects()` の呼び出しは `ProjectManager.initialize()` の1か所のみ。定期実行は本家側で明示的に外されている（`project-manager.ts:42` とその下のコメント）
- MCP サーバーがクラッシュして `stop()` を通らなかった場合、死んだ PID を持つエントリが**次のダッシュボード起動まで「アクティブ」として残る**

**stroke-board への影響**: 選べるのに実際は繋がっていない行が出うる。本家の再起動でしか解消しない既知の限界として扱う。

### イベントはスナップショット型で「何が起きたか」を含まない

- 本家 WebSocket は `ws://<host>/ws?projectId=<id>`。接続直後に `projects-update` と `initial`（`{specs, approvals}`）が届く
- 本家サーバーは `tasks.md` を毎回パースして「今の `taskList`」を送るだけで、前回値を持たない。`src/core/task-parser.ts` が `- [ ]` / `- [-]` / `- [x]` / `- [~]` を pending / in-progress / completed / blocked に変換する
- 「何が起きたか」は受け取った側が前回値と比べて初めて分かる。本家フロントエンドも同じことをしている（`NotificationProvider.tsx` の `prevApprovalsRef` / `prevTaskDataRef`）

**stroke-board への影響**: 通知を出すには前回値との比較が要る。これは本家の踏襲であって独自の加工ではない（[ADR-0001](./0001-do-not-derive-from-upstream-data.md) に照らして確認済み）。

### 検出できないもの

- **ステアリング文書の更新**: `tech.md` を更新しても payload が一切変化せず、ディレクトリの `lastModified` すら同一だった
- **承認と却下の区別**: `approval-update` も `GET /api/projects/:projectId/approvals` も pending しか返さず、結果は「消滅」としてしか観測できない
- `spec-update` / `steering-update` は通知ではなく再描画用の同期信号。`.md` を保存するたびに発火する

**stroke-board への影響**: 通知にできるのは、本家 `NotificationProvider` が出している4種（タスク完了 / タスク着手 / 全件完了 / 承認依頼の発生）に限られる。取れないものを取れると見せない。

### プロジェクトの追加・削除 API

- `POST /api/projects/add`（body `{projectPath}`）と `DELETE /api/projects/:projectId` は実在する
- ただし中身は registry への登録・解除であり、**プロジェクトを新規に作る機能は本家に無い**

### 設定の置き場

- `SPEC_WORKFLOW_HOME`: グローバル状態の置き場（既定 `~/.spec-workflow-mcp`）。中身は `activeProjects.json` / `settings.json` などのファイルのみで、プロジェクトのディレクトリ一覧は入っていない
- `SPEC_WORKFLOW_SHARED_ROOT`: worktree 間で specs を共有する git root の上書き（`src/core/git-utils.ts`）。値は1プロジェクトのパス

## 影響

本家を更新するときは、上記のうち少なくとも次を再検証する。

1. WebSocket ペイロードの形（`initial` / `approval-update` / `task-status-update`）
2. registry のスキーマと `cleanupStaleProjects()` の呼び出し箇所
3. `NotificationProvider` が出す通知の種類

本家に触るコードは接点層に閉じてあるため、直す範囲はそこに限られる。
