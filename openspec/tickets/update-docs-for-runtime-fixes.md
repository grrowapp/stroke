---
status: Planning
change: update-docs-for-runtime-fixes
tags:
  - proposal
triage:
  - document
---

# update-docs-for-runtime-fixes

7本の change（実行まわりの欠陥修正）が実装で確定させた事実を、上位資料へ反映する。
各 change の design が「整合反映（提案）」として書き、ADR-0004 の手続き上ユーザー承認の
ゲートで止まっていたものを、この change 1本に集約した。

提案元: `fix-rename-during-running-session` / `fix-orphan-run-on-restart` /
`fix-steering-empty-completion` / `fix-idle-stuck-on-run-build-failure` /
`adr0016-sub-fix-upstream-mcp-allowance` / `adr0016-sub-fix-direct-write-allowance` /
`adr0016-sub-fix-project-id-lookup`

## 反映一覧（6ファイル・16件）

各行の `status` は次の4つ。**行ごとに承認して、行ごとに進める。**

| status | 意味 |
| --- | --- |
| `未承認` | ユーザーへ提示していない、または可否が出ていない |
| `承認済` | 直してよいと決まった。まだ `docs/` を書き換えていない |
| `反映済` | `docs/` を書き換えた |
| `見送り` | 直さないと決まった。食い違いが残ることを承知の上 |

### docs/specs/api/contract.md（5件）

| # | status | どこ | 現在 → 提案 | 提案元 |
|---|---|---|---|---|
| C1 | 未承認 | U10 のエラー列（162-176行） | 409 busy が無い → **409 busy（対象が実行中）を追加**し、「確認から改名完了まで新規起動を受け付けない」を1行足す | fix-rename-during-running-session |
| C2 | 未承認 | 「## 約束」の 409 の行（278-279行） | 「409(busy): 起動(U13)と削除(U11)」 → **承認(U10) を含める** | fix-rename-during-running-session |
| C3 | 未承認 | U13（205-221行） | 「同一対象」の単位が未定義 → **単位は id ではなく作業場所ディレクトリの実体（`dev`/`ino`）**であることを1行足す | fix-rename-during-running-session |
| C4 | 未承認 | U13 のエラー行（221行） | 「503 前提が欠けている」 → 「503 前提が欠けている、**または起動の材料を組み立てられない**」 | fix-idle-stuck-on-run-build-failure |
| C5 | 未承認 | U13 の「受理で即完結する」（210-212行） | **「組み立てに失敗したときは受理せず 503 を返す。受理したときの応答が即完結する性質は変わらない」を1文足す** | fix-idle-stuck-on-run-build-failure |

### docs/specs/architecture/session-workflow.md（4件）

| # | status | どこ | 現在 → 提案 | 提案元 |
|---|---|---|---|---|
| S1 | 未承認 | 「実行の記録（`invocation`）」の箇条書き | 「再起動で宙に浮いた `running` は起動時に `failed` へ倒す」 → **「まず終了させてから `failed` へ倒す。終了させられない／自分が起こしたものか判定できないものは `error` へ倒してユーザーに引き渡す」** | fix-orphan-run-on-restart |
| S2 | 未承認 | 状態遷移図 | **`running --> error: 起動時に後始末できない` を追加** | fix-orphan-run-on-restart |
| S3 | 未承認 | 状態遷移図 | `running --> failed: タイムアウト・起動失敗` のみ → **`running --> idle: 完了を検知（作業あり）` と `running --> failed: タイムアウト・起動失敗・作業なしの完了` に分ける** | fix-steering-empty-completion |
| S4 | 未承認 | 同節の箇条書き | **「正常終了しても、その起動で提出が1つも受理されていなければ `failed` に倒す（flontier は問い・proposal、steering は steering 文書）」を1行足す** | fix-steering-empty-completion |

### docs/specs/core/settings-reference.md（3件）

| # | status | どこ | 現在 → 提案 | 提案元 |
|---|---|---|---|---|
| R1 | 未承認 | `claude.args` の `--allowedTools` の説明 | 「steering 工程では `mcp__specworkflow` も」 → **「両工程とも `mcp__stroke-board` だけ。steering に並ぶ本家 MCP のツールは載せない」**とし `mcp-tools.md` へリンク | adr0016-sub-fix-upstream-mcp-allowance |
| R2 | 未承認 | `claude.args` の JSON 値（145行） | `"Skill Bash(openspec *) Read Edit Write"` → **`"Skill Bash(openspec *) Read"`**（実測 2026-09-01 で `Write`/`Edit` は4実行とも0回。外した構成で1周通ることを確認済み） | adr0016-sub-fix-direct-write-allowance |
| R3 | 未承認 | `--allowedTools` の根拠段落 | **段落そのものが無い**（`--add-dir` / `--strict-mcp-config` / `--setting-sources` には在る）→ 「許可するのは実測で要ると確かめた道具だけ」「取得・提出は MCP ツールが唯一の入口で、直接書ける道具は許可しない」を新設 | adr0016-sub-fix-direct-write-allowance |

### docs/specs/api/mcp-tools.md（2件）

| # | status | どこ | 現在 → 提案 | 提案元 |
|---|---|---|---|---|
| M1 | 未承認 | 冒頭「操作の入口はこれだけである」 | **段落追加**: steering に配線される本家 MCP は入口ではない。配線の目的は起動時の自己登録だけで、ツール呼び出しは要らない。`--allowedTools` に載せないので呼んでも通らない。ただし可視性は決まらないので一覧には残る | adr0016-sub-fix-upstream-mcp-allowance |
| M2 | 未承認 | `errorCode` 表の `project_not_registered` の意味列 | 「本家の一覧に対象のプロジェクトが無い」 → **「一覧が空の場合と、候補はあるが対応しない場合の両方を含む。どちらかは `error` 本文で分かる」** | adr0016-sub-fix-project-id-lookup |

### docs/specs/reference/upstream-observations.md（1件）

| # | status | どこ | 提案 | 提案元 |
|---|---|---|---|---|
| U1 | 未承認 | 新規節 | **「登録されるパスは git のトップレベルへ解決される」** — 本家の `resolveGitWorkspaceRoot` → `git rev-parse --show-toplevel`、`projectId` の導出規則、`projectPath` と `workflowRootPath` が食い違いうること（実測例 `agent-messanger`） | adr0016-sub-fix-project-id-lookup |

### docs/adr/0016-delegate-provide-operations-via-mcp.md（1件）

| # | status | どこ | 提案 | 提案元 |
|---|---|---|---|---|
| A1 | 未承認 | 状態行「確定していないもの」 | 各 sub が docs へ落ちるたびに該当項目を外す。4本すべてが落ちたら ADR を `archive` にする | adr0016-sub-fix-upstream-mcp-allowance |

## 同時に見つかった既存の誤り（4件・この change の範囲外）

**この change 群が作った差分ではない。** もとから資料と実装がずれている。直すかどうかは別に判断する。

| # | status | ファイル | 内容 |
|---|---|---|---|
| D1 | 判断待ち | `contract.md`「## 約束」 | 409 の一覧から **P1（プロジェクト削除）が漏れている**。実装は既に断っている（`server/api/projects/[projectId]/index.delete.ts`） |
| D2 | 判断待ち | `session-workflow.md` | 巡回プラグインを `01.reap-running.ts` と書いている（実体は `01.retry-failed.ts`）。2本の change が独立に発見 |
| D3 | 判断待ち | `schema.md` | `state.json` の表に `retries` / `runId` が無く、`invocation` の値に `error` が無い |
| D4 | 判断待ち | `upstream-observations.md` / ADR-0008 | 基準を **2.2.7** としているが、実際に入っているのは **2.2.5**（`npx @latest` の解決先と `node_modules` の両方を読んで確認） |

対応する change: `update-docs-for-runtime-fixes`
