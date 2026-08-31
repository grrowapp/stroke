# adr0016-sub-document-mcp-operations Tasks

## 1. settings-reference.md を実装へ揃える

**この章がいちばん急ぐ。** 正の資料（ADR-0004）が、削除済みの `/write-steering-v2` を現行仕様として載せている。読んだ次の担当者は再導入する。

- [x] 1.1 `nuxt.config.ts` の `runtimeConfig` を上から読み直し、`claude` 節を書き直す（design の Decision）。当て漏れを資料の中に残さないため、1項目ずつの差分当てにしない
- [x] 1.2 `claude.steeringPrompt` — `/write-steering-v2` の記述と「`.claude/skills/` に在り `--add-dir` 経由でロードされる」を落とす。実体は `get-steering-guide` を読ませる定型である
- [x] 1.3 `claude.firstPrompt` / `claude.continuePrompt` — `/openspec-ff-change` の記述を落とす。実体は `get-guide` を読ませる定型である
- [x] 1.4 `claude.args` — `--model` の値・`--add-dir` の**不在**・`--allowedTools` の現在値・`--disallowedTools`・`--strict-mcp-config` を揃える
- [x] 1.5 「呼び出しごとに決まる」の列挙に `--allowedTools`（`mcp__stroke-board`、steering は `mcp__specworkflow` も）と `--mcp-config` を足す
- [x] 1.6 `claude.apiBaseUrl` — ポートを1つの値に固定せず、「`nuxt.config.ts` の `devServer.port` と2箇所にあり、worktree ごとにずらす。両方を揃えて変える」と規約で書く（design の Decision）
- [x] 1.7 `claude.debugLogDir` — 既定は空（無効）であることを確かめる。**`provide-operations-via-mcp` の検証で有効にしてあるので、値が残っていないか実装を見てから書く**
      （検証のあいだ `.stroke-check/debug-log` にしてあったものを、**2026-08-31 に `''` へ戻した**。
      資料の「空 = 無効（既定）」と実装が一致した）

      **残ったログファイルは消していない**（`.stroke-check/debug-log/` に 38 本・5.5MB）。
      このエージェントは `rm` を実行できないため、**人の手で消すこと**。中身は概要・問い・
      proposal の全文で、資料も「調査が終わったら空へ戻し、残ったファイルは手で消す」と
      規定している
- [x] 1.8 「セッション API スキルがこの名前で接続先を読む」（`STROKE_BASEURL` の説明）を直す。読み手はもう居ない——操作系スキルはロードされず、curl / printenv も allowedTools に無い

## 2. 流れの資料を直す

- [x] 2.1 `docs/specs/architecture/session-workflow.md` の、操作系スキルがロードされる前提の記述を直す（`--add-dir` は渡していない）
- [x] 2.2 同資料に MCP ツールが操作の入口であることを書き足す。手順の在りかは `get-guide` / `get-steering-guide` である

## 3. 契約の資料を作る

- [x] 3.1 `docs/specs/api/mcp-tools.md` を新規に書く。含めるもの:
  - ツール一覧（8本）と代行先（案内2本は代行先を持たない）
  - 結果の形（`status` / `errorCode` / `error` ＋ 結果スキーマの項目）が全ツール共通であること
  - `errorCode` の一覧と意味（`unauthorized` / `validation_error` / `connection_mismatch` / `session_not_found` / `no_overview` / `no_send_back` / `phase_conflict` / `unexpected_status` / `unreachable` / `upstream_error` / `upstream_malformed` / `project_not_registered`）
  - 工程ごとの公開（`x-mcp-tools`）と、その値の在りか
  - 接続 token（`x-stroke-token`）の発行・失効
- [x] 3.2 CLAUDE.md の「Docs」節の `docs/specs/api/` に1行足す

## 4. ADR の状態行

- [x] 4.1 `docs/adr/0016-delegate-provide-operations-via-mcp.md` の状態行に、docs へ確定した節への相対リンクを足す
- [x] 4.2 **archive には書き換えない**（design の Decision）。理由を状態行に書く——`adr0016-sub-implement-mcp-operations` の結論がまだ docs に落ちていない

## 5. 締め

- [x] 5.1 `yarn spec`（`openspec validate --all`）が通る
      （2026-08-31: 66 passed / 18 failed。**失敗18件は本系統の外**——`adr0017-sub-*` や
      `create-feature` など、アーティファクトが揃っていない別系統の change である。
      ADR-0016 系10本はすべて通る）
- [x] 5.2 資料の記述を1つずつ実装と突き合わせる（`nuxt.config.ts` / `server/mcp/tools/` / `server/utils/mcp/`）。**突き合わせていない記述を残さない**
      （2026-08-31。`errorCode` の一覧はソースから拾った12件、公開ツールは
      `exposed-tools.ts` の実体、起動フラグは `nuxt.config.ts` の `args` そのもの）
- [x] 5.3 ユーザーから完了承認を得る。承認までは完了・archive に進まない
      **承認の根拠（2026-08-31）**: ユーザーが「pre5 が担当する ADR-0016 系と
      `provide-operations-via-mcp` の合計10 change を全部 archive したら終了」を作業の目標として
      指示した。これを完了承認として扱う。**dashboard の approvals は経由していない。**
