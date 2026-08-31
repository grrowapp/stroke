# adr0016-sub-document-mcp-operations Design

## Context

- MCP サーバー・操作ツール6本・案内ツール2本・工程ごとの公開の絞り・接続表 token は、`provide-operations-via-mcp` と案内の2 change で実装済み
- `docs/specs/` は**定義としての specs** の置き場で、`core`（構造・入れ物・設定）/ `api`（契約）/ `architecture`（流れ）/ `reference`（調べた事実）/ `plan`（未確定）に区分する（CLAUDE.md）
- `docs/specs/core/settings-reference.md` はストローク側設定の**正**である（ADR-0004）
- `docs/adr/0016-delegate-provide-operations-via-mcp.md` が本系統の決めを持っている
- 動機と範囲は proposal.md を参照。本 change はコードを触らない

## Goals / Non-Goals

**Goals:**

- MCP 操作系の契約を `docs/specs/api/` に定義として置く
- `settings-reference.md` を実装へ揃える。**いちばん急ぐのはここ**——正の資料が、削除済みの `/write-steering-v2` を現行仕様として載せている
- ADR-0016 の内容が docs へ確定した分を、ADR の状態行に反映する（CLAUDE.md「更新対応」）

**Non-Goals:**

- コード・`openspec/specs/` の変更（挙動は変えない）
- 未実装のもの（`adr0016-sub-implement-mcp-operations` の結論）の記述

## Decisions

### Decision: 契約は `docs/specs/api/mcp-tools.md` 1本にまとめる

ツールごとにファイルを割らず、1本に表でまとめる。8本のツールは**結果の形が共通**（`status` / `errorCode` / `error` ＋ 結果スキーマの項目）で、違うのは代行先と `errorCode` の並びだけである。ファイルを割ると共通部分が8回繰り返され、直すときに取りこぼす。

`docs/specs/api/contract.md`（サーバ API の契約）へ足し込む案も不採用——あちらは画面・エージェントと**サーバの境界**を書くもので、MCP は claude とサーバの境界である。読み手が違う。

### Decision: `settings-reference.md` は差分を当てるのではなく、実装から読み直して書き直す

`claude` の設定は本系統で7項目が変わった（`args` / `firstPrompt` / `continuePrompt` / `steeringPrompt` / `debugLogDir` の扱い / `apiBaseUrl` のポート / 「呼び出しごとに決まる」の列挙）。1項目ずつ当てると、当て漏れが**正の資料の中に**残る。

`nuxt.config.ts` の `runtimeConfig` を上から読み直し、資料の側を作り直す。資料が正であるという建て付けは変えない——「実装から書き直す」のは**この1回の同期**であって、以後は資料が先である。

### Decision: ポートは「worktree ごとにずらす」と書き、値を1つに固定しない

資料は `http://127.0.0.1:3399` を挙げているが、**3399 を使っている worktree が1つも無い**（実測: pre5 は 3599、develop は 3100）。1つの値を書くと、どの worktree でも間違いになる。

「値は `nuxt.config.ts` の `devServer.port` と `claude.apiBaseUrl` の2箇所にあり、worktree ごとにずらす。両方を揃えて変える」と規約として書く。既定値の例示は残すが、**実測の値としては書かない**。

### Decision: ADR-0016 は archive にしない

CLAUDE.md は「ADR の内容が docs に確定したら状態行を `archive` に書き換える」と定めるが、**取りこぼす規約が残るなら archive にしない**とも定めている。

ADR-0016 は本系統10 change の親で、`adr0016-sub-implement-mcp-operations` の結論（代行のままか実処理化か）がまだ docs に落ちていない。状態行には「どの節が docs のどこへ確定したか」を相対リンクで足すに留め、archive への書き換えは全 change の決着後とする。

## Risks / Trade-offs

- [資料を書き直す間に実装が動く] → 本系統の change はすべて同じ流れの中にあり、docs の更新は最後に置いてある。書き直しの直前に `nuxt.config.ts` を読み直して差分を確かめる
- [`docs/specs/api/mcp-tools.md` が `openspec/specs/mcp/**` と二重になる] → 役割が違う。`openspec/specs` は Requirement + Scenario の**検証できる形**、`docs/specs/api` は**引くための定義**（一覧・表）である。二重に見えたら docs が勝つ（CLAUDE.md の序列）
- [ADR を archive にしないと、次の担当者が ADR を盲信する] → 状態行に「確定済みの節」と「未確定の節」を書き分ける

## Migration Plan

1. `nuxt.config.ts` の `runtimeConfig` を読み直し、`docs/specs/core/settings-reference.md` の `claude` 節を実装へ揃える
2. 同資料の「セッション API スキルがこの名前で接続先を読む」を直す（読み手はもう居ない。`STROKE_BASEURL` は渡っているが読む者が無い）
3. `docs/specs/architecture/session-workflow.md` の、操作系スキルがロードされる前提の記述を直す
4. `docs/specs/api/mcp-tools.md` を新規に書く（ツール一覧・結果の形・`errorCode` の一覧・工程ごとの公開・接続 token）
5. `docs/adr/0016-delegate-provide-operations-via-mcp.md` の状態行に、確定先の節への相対リンクを足す
6. `docs/` の目録（CLAUDE.md の「Docs」節）に新規資料の行を足す

戻す必要は無い。挙動を変えない。
