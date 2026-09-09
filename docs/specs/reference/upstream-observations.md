# 本家 spec-workflow-mcp の観測記録

本家のソースを読んで確認した事実の記録。**同じ調査を繰り返さないために残す。**

## この資料の扱い

**ここに書くのは観測した事実だけ。** 本家がどう作られているか、何を配信するか、どういう制約が
あるかに限る。

**決定は書かない。** 本家に依存するという方針の本体は [ADR-0006](../../adr/0006-upstream-observed-behaviour.md)、
基準バージョンは [ADR-0008](../../adr/0008-baseline-is-2-2-7.md) にある。食い違ったときは ADR が勝つ。

**出典と時点**: 調査は 2026-08-16 に `/home/vagrant/work/repo/spec-workflow-mcp` の v2.2.7 実装に対して
行った。**本文中の行番号はその時点のもの**なので、本家を更新したら位置は当てにせずシンボルで探すこと。

本家のドキュメント（`docs/technical-documentation/dashboard.md`）にもイベント型の記載があるが、
**実装と一致しない**（`specs-updated` / `approval-updated` / `task-updated` と書かれているが、
いずれも実在しない）。以下はすべてソースから確認した内容である。

---

## WS メッセージは 9 種類

| # | type | 発火起点 | ペイロード | フロントの購読者 |
|---|---|---|---|---|
| 1 | `initial` | WS 接続時（`multi-server.ts:200, 248`） | `{specs, approvals}` | `WebSocketProvider` 内部 |
| 2 | `projects-update` | 接続時（215）+ レジストリ同期（311 ← `project-manager.ts:131`） | プロジェクト一覧 | `WebSocketProvider` → 購読者へ配信 |
| 3 | `spec-update` | `spec-change`（335） | `{specs, archivedSpecs}` | `api.tsx` |
| 4 | `task-status-update` | `task-update`（353）/ タスク状態 API（1104） | `{specName, taskList, summary, inProgress}` | `TasksPage`, `NotificationProvider` |
| 5 | `steering-update` | `steering-change`（360） | `steeringStatus` | `api.tsx` |
| 6 | `approval-update` | `approval-change`（378） | pending 承認の全件配列 | `api.tsx` |
| 7 | `implementation-log-update` | ログ POST API（1136） | `{specName, entries}` | `LogsPage` |
| 8 | `batch-approval-undo` | batch undo API（764） | `{ids, count}` | **なし** |
| 9 | `batch-approval-update` | batch action API（848） | `{action, ids, count}` | **なし** |

## 発火起点は 3 系統

### A. ファイル変更由来（chokidar watcher が 2 つある）

| watcher | 監視対象 | デバウンス | emit |
|---|---|---|---|
| `SpecWatcher`（`watcher.ts:34`） | `specs/**/*.md`, `steering/*.md` | 500ms + ファイル安定待ち最大 2 秒 | `change` / `task-update` / `steering-change` |
| `ApprovalStorage`（`approval-storage.ts:150`） | `approvals/**/*.json` | 500ms | `approval-change` |

承認の監視は `SpecWatcher` とは**別系統の独立した watcher**。

`spec-change` はさらに multi-server 側で 300ms デバウンスされる（`SPEC_BROADCAST_DEBOUNCE_MS`）。

### B. API 操作由来（REST ハンドラから直接 broadcast）

| API | 行 | type |
|---|---|---|
| `PUT /specs/:name/tasks/:taskId/status` | 1104 | `task-status-update` |
| `POST /specs/:name/implementation-log` | 1136 | `implementation-log-update` |
| `POST /approvals/batch/:action` | 848 | `batch-approval-update` |
| `POST /approvals/batch/undo` | 764 | `batch-approval-undo` |

`task-status-update` は **A と B の両方から発火する**（ファイル変更経由と API 操作経由の 2 経路）。

### C. 接続・レジストリ由来

WS 接続時に `initial` と `projects-update` が送られる。`initial` は specs と approvals の**実データ**を
含むため、初期ロードの一部を担っている。

## 購読者のいないイベントが 2 種類ある

`batch-approval-undo`（764）と `batch-approval-update`（848）は、フロント側に購読者が存在しない。

バッチ操作の結果は HTTP レスポンスで返り、かつ `approvals/**/*.json` が書き換わることで
`approval-change` watcher が発火し `approval-update` が別途飛ぶ。二重になるため使われていないと見られる。

また `project-manager.ts` は `project-added`（193 行）と `project-removed`（219 行）を emit するが、
**multi-server は購読していない**。プロジェクトの増減は `projects-update` で伝わっている。

## ペイロードは全件スナップショット

差分は一切送られない。本家フロントの受信側の扱いは 3 パターン。

```
全件置換 + 差分比較（再レンダ抑制のみ）    spec-update / approval-update / steering-update
楽観更新とマージ + 差分比較               task-status-update
無条件で全置換                            implementation-log-update
```

`TasksPage` のみ `pendingStatusUpdatesRef` に楽観更新中のタスク ID を保持し、サーバーから届いた値より
ローカル値を優先する（自分でステータスを変えた直後に、反映前のサーバー値で上書きされるのを防ぐため）。

差分比較はいずれも再レンダ抑制が目的で、データの整合には使っていない。

## メッセージの構造が統一されていない

7 種は `{type, projectId, data}` 形式だが、`batch-approval-undo` と `batch-approval-update` は
`data` フィールドを持たず `ids` / `count` / `action` が直置きされている。

`WebSocketProvider.tsx:107` は購読者へ `msg.data` を渡す実装のため、仮に batch 系を購読しても
`undefined` が届く。

---

## 接続の制約

### CORS（`src/core/security-utils.ts:33-44, 297-321`）

```
allowedOrigins = [http://localhost:{port}, http://127.0.0.1:{port}]   // 既定 port=5000
  + NODE_ENV !== 'production' なら http://localhost:5173, http://127.0.0.1:5173
```

- origin ヘッダが無いリクエストは無条件許可（305 行）。**サーバー間プロキシは通る**
- リストに無い origin は `Error('Not allowed by CORS')`（314 行）
- **stroke-board のオリジンは許可リストに含まれない**

### レート制限（`src/core/security-utils.ts:17-18, 127-145`）

- `rateLimitPerMinute: 120`、既定で有効
- キーは `request.ip`。超過で 429 + `Retry-After`
- プロキシ経由の場合、全クライアントが同一 IP のバケットを共有する

### CSP / セキュリティヘッダ（`src/core/security-utils.ts:266-292`）

- `connect-src 'self' ws://localhost:{port} ws://127.0.0.1:{port}`（+ 非 production なら 5173）
- `X-Frame-Options: DENY` — iframe 埋め込み不可
- ただしこのヘッダは本家が返すレスポンスに付くものであり、stroke-board が配信する HTML には
  stroke-board 自身の CSP が適用される

### WebSocket（`src/dashboard/multi-server.ts:176`）

- `/ws` に origin チェックは**無い**
- `projectId` クエリでプロジェクトスコープを決める
- `{type:'subscribe', projectId}` を受け付ける処理がある（`multi-server.ts:234-264`）が、これは
  projectId の切り替えと `initial` の再送のみで、**データ書き込みには使えない**。本家フロントも
  これを使っていない（projectId 変更時は接続を張り直す）

**書き込み操作**（承認・却下、文書保存、タスク状態変更、アーカイブ）は本家では**すべて REST**。
WS 経由の書き込み手段は存在しない。

## 接続管理の実装（`multi-server.ts:176-266, 1365-1418`）

```
clients: Set<WebSocketConnection>    // { socket, projectId?, isAlive? }

接続時   GET /ws?projectId=xxx → clients に add → initial + projects-update を送信
配信時   Set を全走査し readyState===OPEN かつ projectId 一致にのみ送信
切断時   close / error / disconnect / end の4イベントで cleanup
送信失敗 scheduleConnectionCleanup（setImmediate で Set 変更を遅延）
```

ルームやチャネルの概念は無く、毎回 Set を全走査して `projectId` で絞っている。

### ハートビート

```
HEARTBEAT_INTERVAL_MS = 30000    30秒ごとに isAlive=false にしてから ping()
HEARTBEAT_TIMEOUT_MS  = 10000    10秒後に isAlive===false なら切断
```

pong はブラウザが WebSocket プロトコルとして自動で返すため、アプリ側の実装は不要。

### 本家フロントの再接続（`WebSocketProvider.tsx:65-82`）

```
1000ms から ×1.5、最大30000ms の指数バックオフ
code 1000 / 1001 では再接続しない
projectId が変わったら接続を張り直す
```

### 複数タブ

各タブが独立した接続を持つ。同一 projectId なら全タブに同じメッセージが届く。接続数の制限は無い。

## 更新が画面に反映されるまでの経路

```
AI が requirements.md を書く
  ↓
本家 SpecWatcher (chokidar: specs/**/*.md)
  ↓ 500ms デバウンス
  ↓ ファイル安定待ち（100ms×3回一致 / 最大2秒）
  ↓ parser.getSpec()
ProjectManager が 'spec-change' emit
  ↓ 300ms デバウンス
  ↓ getAllSpecs() + getAllArchivedSpecs()
broadcastToProject(projectId, {type:'spec-update', data:{specs, archivedSpecs}})
  ↓ WS（projectId 一致クライアントのみ）
ブラウザが受信 → state 更新 → 画面再描画
```

最大遅延 = 500ms + 2000ms + 300ms ≒ **2.8 秒**。これは本家も同じ。

---

## 登録されるパスは git のトップレベルへ解決される

本家は登録の前に、渡されたパスを自分の規則で解決する。**渡したパスがそのまま登録されるとは限らない。**

- `dist/index.js` — `resolveGitWorkspaceRoot(expandedPath)` を通してから登録へ渡す
- `dist/core/git-utils.js` — `execSync('git rev-parse --show-toplevel', { cwd })` で解決する。失敗したら渡されたパスへ落とす。環境変数 `SPEC_WORKFLOW_SHARED_ROOT` があればそれを最優先で返す
- `dist/core/project-registry.js` — 解決後の値を `projectPath` として登録し、`projectId` もその値から作る

`GET /api/projects/list` が返す `projectPath` はこの解決後の値である。**`workflowRootPath` は返らない。**

登録簿には実際に食い違う例がある（`/opt/projects/.spec-workflow-mcp/activeProjects.json`、実測 2026-09-01）。

| projectId | projectPath | workflowRootPath |
|---|---|---|
| `EsR5M2woKQ9OUss8` | `/opt/projects/stroke-board` | `/opt/projects/stroke-board` |
| `tLh761zAISCC1-qU` | `/home/vagrant/work/stroke-board/agent-messanger` | `/opt/projects/agent-messanger` |

後者は git ではなく、同ディレクトリの `.mcp.json` が `SPEC_WORKFLOW_SHARED_ROOT` を渡していることによる。

**効いてくるのは共有ルートが git 管理下へ入ったときである。** いま `projectShareRoot` は `/opt/projects` で git リポジトリではないため解決しても値が変わらないが、git の内側へ動かすと本家の `projectPath` はトップレベルへ化け、パスの完全一致では引き当てられなくなる。

> **読んだ実体は 2.2.5、読んだ日は 2026-09-01**（`npx -y @pimzino/spec-workflow-mcp@latest` の解決先と `node_modules` の両方。`core/git-utils.js` はバイト一致）。基準は 2.2.7（[ADR-0008](../../adr/0008-baseline-is-2-2-7.md)、2026-08-21 に決定）だが、**実行時に走るのは `@latest` が解決した版**なので基準とは一致しない。基準は「何を読んで設計したか」を指す。

## 参照

- `src/core/security-utils.ts` — CORS / レート制限 / CSP
- `src/dashboard/multi-server.ts` — broadcast 全箇所（311, 335, 353, 360, 378, 764, 848, 1104, 1136, 1436, 1460）、WebSocket ルートと接続管理（176-266, 1365-1418）
- `src/dashboard/watcher.ts:178, 182, 205` — SpecWatcher の emit
- `src/dashboard/approval-storage.ts:150, 177` — 承認専用 watcher
- `src/dashboard/project-manager.ts:131, 160-172, 193, 219` — イベント中継
- `src/dashboard_frontend/src/modules/ws/WebSocketProvider.tsx:93-109` — 受信振り分け
- `src/dashboard_frontend/src/modules/api/api.tsx:192-265` — state 更新ハンドラ
- `src/dashboard_frontend/src/modules/pages/TasksPage.tsx:560-620` — 楽観更新マージ
