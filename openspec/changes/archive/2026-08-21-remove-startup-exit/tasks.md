## 1. 前提の判定を1つの口にまとめる

- [x] 1.1 `server/utils/readiness.ts` を作り、前提の充足を判定する関数を置く。判定対象は現状と同じ（`SESSIONS_ROOT` / `PROJECTS_ROOT` への書き込み、`runtimeConfig.claude` の形）。欠けているものを個別に列挙して返し、全て揃っていれば空を返す
- [x] 1.2 `describeClaudeConfigError()` の呼び出しを 1.1 の中へ移す。`claude-config.ts` 自体は変更しない（`readClaudeConfig()` は各呼び出しから引き続き使う）
- [x] 1.3 判定に状態を持たせないことを確認する（呼ばれるたびに実際の書き込み可否と設定を見る。design.md 決定2）

## 2. 起動時にプロセスを落とすのをやめる

- [x] 2.1 `server/plugins/00.startup-checks.ts` から `process.exit(1)` を外す。判定は 1.1 の口を呼ぶ形にし、欠けているものがあればログに出して終わる
- [x] 2.2 ログの文面は現状の内容（欠けている前提の個別列挙＋配置作業と `runtimeConfig.claude` を確かめる旨）を維持する。「起動できない」という表現は実態に合わなくなるため見直す
- [x] 2.3 プロセスを落とす根拠を説明していたコメント（33-34 行）を、落とさない設計の説明に差し替える。`nitropack` の plugin 実行の実態は design.md - Context に記録済みなので、コメントでは繰り返さず参照に留める
- [x] 2.4 同ファイルのコメントが `00.writable.ts` を指している参照ズレを直す。`server/utils/paths.ts:6` にも同じズレがある。直したら `docs/known-issues.md` の該当項目を消す

## 3. 起動要求を断れるようにする

- [x] 3.1 `server/api/[id]/invoke-agent.get.ts` に前提の判定を足す。位置はセッション存在確認（`requireSessionId`）の後、`readState` の前。前提が欠けていれば 503 を投げ、欠けている前提の内容を本文に載せる
- [x] 3.2 既存の受理しない条件（承認後の 409 / 多重起動の busy）と混ざらないことを確認する。403・409 とは別のステータスで返る（design.md 決定3）
- [x] 3.3 `beginRun()` に入る前に断ることを確認する。前提が欠けている要求で `invocation: 'running'` を書かない

## 4. 確認

- [x] 4.1 `yarn check`（typecheck + `openspec validate --all`）が通る
- [x] 4.2 前提を欠いた状態で `yarn dev` を起動し、サーバが起動すること・ログに欠けている前提が出ることを確かめる（`runtimeConfig.claude` を `NUXT_CLAUDE_TIMEOUT_MS` などで壊すのが手軽）
- [x] 4.3 同じ状態で既存セッションの画面が開けること、`GET /api/<id>/invoke-agent` が 503 と理由を返すことを確かめる
- [x] 4.4 前提を戻し、**サーバを再起動せずに** `invoke-agent` が通ることを確かめる（design.md 決定2 の要点）
- [x] 4.5 全ての前提が揃った状態で起動し、前提についてのログが出ないことを確かめる
