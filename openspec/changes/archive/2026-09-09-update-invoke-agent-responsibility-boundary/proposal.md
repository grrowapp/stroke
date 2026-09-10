## Why

steering 工程の「作業が行われたか」（`didWork`）の材料を、MCP ツール `submit-document` が作っている。ツールは本家 PUT が 2xx を返した直後に起動 token をメモリの `Set` に記録し、invokeAi はプロセス終了後にその `Set` を読む（`server/utils/stroke/submission-signal.ts`）。これは2つの点で責務が潰れている。

1. **MCP ツールが、代行以外の固定の処理を受け持っている。** `submit-document` の責務は文書を代行先（本家）へ登録することだけである。invoke-agent の判定材料を残すのは invoke-agent の責務であり、ツールに置くとツールが工程の進行を知る側になる
2. **正が本家に在るのに、stroke-board が自分のキャッシュを読んでいる。** 「steering 文書が本家に在るか」は本家 REST に問い合わせれば分かる。中間の記録は、記録者・消す者・消し忘れの判定（`isConnectionActive`）を要る側に増やしただけである

あわせて、完成の条件が「steering 文書の提出が1本以上受理された」で止まっている。本家 spec-workflow の steering 文書は承認依頼（approval）を経て確定するものであり（ADR 0007）、承認依頼が1件も無いまま完了が決着する経路が `project/generation` に「別途定める」として残っている。ユーザー指示（2026-09-09）は、**claude に approval の提出を必須とし、その提出の確認をプロジェクト作成成功のトリガーとする**ことである。

MCP ツールの共通契約と invoke-agent の責務範囲を定めた docs が無く、invoke-agent の設計記述は `api/contract.md`・`api/sessions/invoke-agent.md`・`api/sessions/activate.md`・`architecture/session-workflow.md`・`plan/portal-stroke-exit.md` に散っている。境界を切り直すには、先に docs へ書き出す必要がある。

## What Changes

### docs（規範）

- **新設 `docs/specs/mcp/contract.md`** — MCP ツール共通の契約。MCP ツールは特定の工程の中でだけ存在する。**代行以外の固定の処理を受け持ってはならない**（invoke-agent の判定材料の記録、phase の遷移、実行の記録への関与を禁じる）。`submit-document` の責務は文書を代行先へ登録することのみ。claude プロセスの起動・終了・判定は invoke-agent の責務
- **新設 `docs/specs/architecture/invoke-agent.md`** — invoke-agent（U13 → `kick` → `buildRun` → `invokeAi`）の仕組みと責務範囲。起動の材料の組み立て・接続 token の発行と失効・生成の依頼・spawn・完了検知・作業の判定・完成の記録・実行の記録の書き込み。**接続 token の発行・登録・失効は常に invoke-agent が担う**
- **集約統合** — 上に挙げた5つの docs に散る invoke-agent の設計記述を `architecture/invoke-agent.md` へ移し、元の箇所は参照に置き換える
- `docs/specs/mcp/tools.md`・`docs/specs/core/settings-reference.md` — 契約への参照と、steering 工程の配線（下記）の更新

### 判定の切り直し（invoke-agent）

- steering の `didWork` を、**プロセス終了後に本家 REST へ問い合わせて判定する**形に変える。条件は「product / tech / structure の3本が本家に在り、かつその3本それぞれに承認依頼が提出されている」。判定は invoke-agent（`invoke.ts` が渡す関数）が持ち、U15 は判定を持たないまま（ADR 0014）
- `submit-document` から起動単位の記録（`recordLaunchSubmission`）を外す。`submission-signal.ts` の `launchSubmissions` と `connection-table.ts` の `isConnectionActive` は用途を失うので削除する
- 承認依頼の提出を steering 工程の claude に必須とする。`get-steering-guide` の手順に「1本提出して受理されたら、その文書の承認依頼を出す」を足す。工程の終わりは「3本の受理と3件の承認依頼」

### 承認依頼の手段（**BREAKING**: 規定の反転）

本家 REST に承認依頼を**作る** route は無い（2.2.5 実測。作成は本家 MCP の `approvals` ツール `action: request` だけ）。したがって steering 工程の起動定義に**本家 spec-workflow の MCP を配線し直し、許可するツールを `approvals` に限る**。

`project/generation`「承認の後の実行（steering）の起動に、本家 spec-workflow の MCP を配線してはならない」と `settings-reference`「第三者の MCP を配線しない」は**記述ごと撤廃する**（ユーザー決定 2026-09-09）。docs には配線している MCP の事実だけを書き、配線を禁じる規定は持たない。「AI のプロセスにプロジェクトを生成させてはならない」自体は保つ——禁止の動機だった「本家 MCP の起動時の自己登録が生成そのものだった」は、生成を P2 が AI の起動前に済ませる形になっており、登録済みパスへの自己登録は同じ `projectId` を返すだけで生成にならない。

### 範囲外

- flontier 工程の作業判定（A5・A7 の endpoint が数える `counts`）。endpoint 自身の受理の記録であり、MCP ツールが受け持つ固定の処理ではない。A7 のマーカーは初提出時だけ追記されるため、U3 の件数では出し直しを判定できない
- 起動時の書き上げ（`01.activate-approved.ts`）。導入をまたぐ一度きりの移行で、判定の材料を変えない
- `invocation` の4値と A8 の契約

## Capabilities

### New Capabilities

- `mcp/contract`: MCP ツール共通の契約。ツールは工程の中でだけ存在し、代行以外の固定の処理（invoke-agent の判定材料の記録・phase の遷移・実行の記録）を受け持たない。`submit-document` は登録の代行のみ

### Modified Capabilities

- `agent/invocation`: steering の作業判定を本家 REST への問い合わせ（3本の文書と3件の承認依頼）へ変える。接続 token の発行・登録・失効を invoke-agent の責務として明記する。承認の後の実行の起動定義に本家 MCP（`approvals` のみ）を含める——「本家 MCP を含めてはならない」の反転
- `mcp/tools/submit`: 「受理された steering の提出を、その起動の作業として記録する」の Requirement を REMOVED
- `mcp/tools/steering-guide`: 手順に承認依頼の提出と、終わりの条件（3本の受理と3件の承認依頼）を加える
- `server/session-management`: token の発行・失効は invoke-agent が担う（Purpose の記述を Requirement に格上げ）
- `upstream-connection`: 本家 REST を呼んでよい契機に「invoke-agent の完了時の確認」を加える（定期ポーリングの禁止は変えない）
- `project/generation`: 「本家 MCP を配線してはならない」を撤廃し、承認依頼のために本家 MCP を配線する事実を書く。「承認依頼が確実に在る状態で完成を記録する形は別途定める」を、この change の判定で埋める
- `api/session/activate`: 呼び手（invoke-agent）の条件の記述を新しい判定に合わせる

## Impact

- `server/utils/stroke/invoke.ts`・`ai.ts`・`submission-signal.ts`（`launchSubmissions` 削除）
- `server/mcp/tools/submit-document.ts`（記録の削除）・`get-steering-guide.ts`（手順）
- `server/utils/mcp/connection-table.ts`（`isConnectionActive` 削除）・`allowed-tools.ts`
- 本家 REST の利用: `GET /api/projects/:projectId/info`（既存。`steering.documents` の3本の真偽）・`GET /api/projects/:projectId/approvals`（既存。pending のみ返る）
- docs: 新設2件、参照の付け替え5件、`mcp/tools.md`・`settings-reference.md`
- テスト: `test/server/mcp/`・`test/server/utils/`・E2E の本家 stub
