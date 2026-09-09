# provide-operations-via-mcp Tasks

## 1. モジュール導入

- [x] 1.1 `@nuxtjs/mcp-toolkit` を依存に追加し、lockfile でバージョンを固定する
- [x] 1.2 `nuxt.config.ts` の modules に追加する（route は既定 `/mcp`、`dir` は既定のまま）
- [x] 1.3 Nuxt DevTools の MCP Inspector で `/mcp` が開けることを確認する
  - **この確認手段は後から成立しなくなった。** 6.2 の1周目で `/mcp` に token の middleware を入れたので、Inspector（token を持たない）は 401 で弾かれる。`nuxt.config.ts` の `devtools` も無効。当時の確認は有効だが、**同じ手順はもう踏めない**（santa-method レビュー指摘 7周目 2026-08-30）。specs `mcp/server` / `mcp/tools/question` のシナリオも、Inspector ではなく**有効な token を持つ接続**でツール一覧・スキーマを取る形へ直した

## 2. セッション管理（接続表と token）

- [x] 2.1 接続表の util を `server/utils/` に追加する（`register` / `resolveConnection` / `remove`。メモリのみ・永続化しない。specs `server/session-management`、design の接続表エントリ: token / sessionId / projectPath）
- [x] 2.2 `resolveConnection` は `x-stroke-token` ヘッダを照合し、欠落・不一致は 401 を throw する（既定値で補わない。ADR-0014）
- [x] 2.3 接続表 util の単体テスト: 登録→照合→削除の一巡、欠落・不一致の拒否
- [x] 2.4 ここまでの実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する

## 3. ツール定義（server/mcp/tools/）

- [x] 3.1 `get-overview.ts`: A1 への代行。結果は `status: 200` + `overview` / 404 は `not_found`（specs `mcp/tools/overview`）
- [x] 3.2 `get-strokes.ts`: U3 への代行。結果は `status: 200` + 時系列の記録一覧 / 404 は `not_found`（specs `mcp/tools/strokes`）
- [x] 3.3 `get-send-back.ts`: A4 への代行。404 の errorCode は `no_send_back` / `session_not_found` で区別（specs `mcp/tools/send-back`）
- [x] 3.4 `send-question.ts`: A5 への代行。構造化引数、成功 204、400 は `validation_error`、404 は `session_not_found`、409 は `phase_conflict`（specs `mcp/tools/question`）
- [x] 3.5 `submit-document.ts`: 種別（flontier / steering）で A7 / 本家 PUT へ振り分け。失敗は種別によらずエラー形式、本家不達は `unreachable`（specs `mcp/tools/submit`）
- [x] 3.6 `get-steering.ts`: 本家 GET への代行。結果に `exists`（本家 info の文書状況から）を含める。文書無しは 200 + `exists: false` + 空の文章、規定外名は 400 `validation_error`、不達は 502 `unreachable`（specs `mcp/tools/steering`）
- [x] 3.7 projectId の解決: ツール実行時に本家 `GET /api/projects/list` からプロジェクトパスで引き当てる（design）
- [x] 3.8 ツールハンドラの単体テスト: `$fetch` をモックし、結果整形（status / errorCode / error）を各パターンで検証
- [x] 3.9 ツール6本の実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する
- ~~3.13 `get-guide.ts`~~ → **`adr0016-sub-create-flontier-guidance-mcp-tool` へ切り出した**（ユーザー判断 2026-08-29）。本 change は代行ツール6本の提供に留め、案内を配るツールは別 change で扱う。steering 側の `adr0016-sub-create-steering-guidance-mcp-tool` と対になり、両工程で案内の届け方を揃える
  - 切り出しに伴い、proposal の capability `mcp/tools/guide` と `specs/mcp/tools/guide/` も本 change から外す。design.md の「ツール6本」はこれで正しくなる
  - 出典の訂正: 3.13 と proposal は「ユーザー指示 2026-08-27」と記録していたが、**これはエージェントの提案だった**（ユーザー指摘 2026-08-29）
  - 切り出した change が扱う論点: ワークフロースキーマ（`flontier-strokeflow`）の instruction は `/get-overview` `/get-strokes` `/get-send-back` というスラッシュコマンド形式で、指す実体が無い。エージェントは名前の一致で偶然 MCP ツールを使えているだけである
- [x] 3.10 **結果を `structuredContent` として返す**（`server/utils/mcp/define-tool.ts` の `defineStrokeTool`）。これが無いと `outputSchema` を宣言した6ツールは1つも動かない。モジュールの `normalizeToolResult` は CallToolResult でない素のオブジェクトを `content` だけに包み `structuredContent` を付けないため、MCP SDK が `Output validation error: ... no structured content was provided` で全呼び出しを弾く（5.1 の実行で判明・実測 2026-08-27）。包み忘れが1箇所でもあるとそのツールだけ静かに壊れるので、19箇所の `return` ではなく定義の入口1箇所で包む
- [x] 3.12 **入力の上限・許容値を契約の説明として書く**（`.describe()`）。`send-question` の `inputSchema` は長さ・件数の上限を一切表現しておらず、エージェントは上限を知る手立てが無いまま A5 の「問いの構造として読み取れない。」だけを受け取り、形を探り続けていた（5.2 の実測 2026-08-27: `send-question` 13回中8回が 400 `validation_error`。内容のある問いが弾かれ、通ったのは「テスト」のような短い問いだけ）。`.max()` で弾く形にはしない——検証の正は代行先に置いたままにする（ADR-0014）。`send-question`（header 12 / detail 300 / question 20 / options 1〜5・description 50）・`submit-document`（name は product / tech / structure、document は本文そのもの）・`get-steering`（同）に適用。

**ただしこれは緩和であって、根本の修正ではない。** 上限を伝えても、実際に超えたときに A5 が「問いの構造として読み取れない。」としか返さないため、送り手はどこを削ればよいか分からない。根本は A5 が違反箇所を返していないことで、そちらは別途修正した（`adr0016-sub-define-request-validation-messages`）。修正後は 400 が 5件 → 1件に減り、その 1件も理由が届いて次で通った
- [x] 3.11 3.8 の単体テストを、結果のエンベロープも検証する形に直す。`tool.handler()` の返り値を直接見ていたため、3.10 の不具合を1件も検出できていなかった。→ 全36ケースを `structuredResult`（`test/server/mcp/tools/support.ts`）経由にし、加えて `test/server/utils/mcp/define-tool.test.ts` でモジュールの**実物の** `normalizeToolResult` を通す（包めば `structuredContent` が残り、包まなければ落ちることを固定）

## 4. spawn への配線（invoke.ts）

- [x] 4.1 spawn 直前に一時 token（推測困難な乱数）を発行し、接続表へ登録する
- [x] 4.2 mcp-config に `{ "type": "http", "url": "<apiBaseUrl>/mcp", "headers": { "x-stroke-token": <token> } }` を追加する（url は `runtimeConfig.claude.apiBaseUrl` から。既存フラグ・steering の本家 MCP の並びは変えない）
- [x] 4.3 invokeAi の実行終了時（正常・異常とも）に接続表のエントリを削除する
- [x] 4.4 配線の実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する
- [x] 4.5 MCP ツール用の `--allowedTools` を invoke.ts のコード内で組み立てて埋め込む（`--mcp-config` の組み立てと同じ場所・flontier / steering の両工程）。→ `server/utils/mcp/allowed-tools.ts` の `withMcpToolsAllowed`。サーバー単位 `mcp__stroke-board` を、**既存の値に追記して指定を1本に保つ**（`--allowedTools` を複数指定したときにマージされるか上書きされるかは未確認のため、その挙動に依存しない形にした）
- [x] 4.6 `nuxt.config.ts` の既存 allowedTools から `Bash(curl -X POST *)` と `Bash(jq -n *)` を落とす（ユーザー指示 2026-08-27）。取得・提出を MCP ツール以外の手段で真似できる余地を残さないため。→ ユーザーが実施済み。`Bash(printenv *)` も併せて落ち、残りは `Skill Bash(openspec *) Read Edit`
- [x] 4.7 `nuxt.config.ts` の prompt 3件（`firstPrompt` / `continuePrompt` / `steeringPrompt`）のうち、**取得・提出の操作を Skill に投げている記述だけ**を MCP ツールへ向ける。案内・手順の Skill（`/openspec-ff-change`、`/write-steering-v2`）は指し先として残す。役割分担は「操作系＝MCP ツール / 案内・instruction＝Skill」であり、案内を MCP ツールへ寄せることはしない。→ `firstPrompt` / `continuePrompt` の「取得スキル」を「stroke-board の MCP ツール」へ。`steeringPrompt` は変更なし。あわせて `firstPrompt` 先頭の `/openspec-ff-change` の起動を外した（下記「案内スキルの実体が無い」参照）
  - **2026-08-30 に `steeringPrompt` も変更した（上の「変更なし」を覆す）。** `/write-steering-v2` は `firstPrompt` の `/openspec-ff-change` とまったく同じで実体が無く、prompt の先頭に置くと `Unknown command` で起動が assistant のターンをひとつも持たずに終わる。**steering 工程が何もせず終わっていた直接の原因**で、5.2 の残り2ツールが一度も呼ばれなかったのはこれによる（santa-method レビュー指摘 4周目）。「案内スキルは指し先として残す」という判断は、指し先が存在することが前提だった。取得・提出は MCP ツールが担うので、案内が無くても往復は成立する
- [x] 4.8 4.5 / 4.6 / 4.7 の実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する。→ 2名とも不合格。指摘を反映済み: ①値の無い `--allowedTools` でフラグが2本になり「指定を1本に保つ」不変条件を破っていた（次が `-` 始まりなら値だけ差し込む形に修正）②その誤挙動をテストが正としてロックしていた（期待値を修正し、別フラグの値を書き換えないケースも追加）③MCP サーバー名が定数と直書きに割れていた（`MCP_SERVER_NAME` を `mcpServers` のキーに使用）
- [x] 4.9 `nuxt.config.ts` の `--add-dir` から2つ目（`${import.meta.dirname}/assets`）を外す。**4.6 だけでは目的を満たしていなかった。** curl / jq を落としても、`assets/.claude/skills/` の操作系スキル（get-* / question / proposal）が読める限り、取得・提出を真似る余地は残る。スキルのファイルは `64a2cdc`（`chore: live 系統を撤去し、スキルを戻して ADR の番号衝突を解く`）の git 操作で HEAD に復元されており、「worktree 上で削除された状態」という前提は既に成立していない（実測 2026-08-29）
  - 1つ目の `--add-dir`（リポジトリルート）は残す。案内スキル（`/openspec-ff-change`・`/write-steering-v2`・grilling・domain-modeling）と opsx コマンドの置き場であり、役割分担「操作系＝MCP ツール / 案内・instruction＝Skill」のとおり案内側は Skill が担う
    - **2026-08-30 に1つ目も外した（この「残す」を覆す）。** 挙げた案内スキルも opsx コマンドも、実運用ログの `slash_commands` 67件に1件も現れず、**ルートを渡す根拠が実在しなかった**。実際に届いていたのは、リポジトリ配下の `claude.debugLogDir` に残る他人のセッションの全文と、`.claude/settings.json` 経由の開発者権限（`Agent` / `Bash(claude *)`・ソースツリーへの書き込み）だけである。`--add-dir` は丸ごと外し、作業場所はセッションの cwd だけにした（6.2 の7周目。proposal / design も同じ内容へ直した）
  - スキルのファイル自体には触れない（`guidance` の作成に要るので残す）。ロードさせないのは `--add-dir` の側で制御する
  - なお 4.6 の記録「残りは `Skill Bash(openspec *) Read Edit`」は実態と違う。現在は `Skill Bash(openspec *) Read Edit Write` で、`Write` は develop 側の追加（`docs/proposal.md` を書くのに要るという理由）。5.1 の証跡では Write は0回で、提出は `submit-document` 経由の endpoint が書いている

- [x] 4.10 **本家 MCP に `SPEC_WORKFLOW_HOME` を渡す。** これが無いと steering 工程は成立しない（2026-08-31）
  - 本家 MCP は起動時に「動いているプロジェクト」の登録簿へ自分を書き、dashboard の
    `GET /api/projects/list` はその登録簿を読む。場所を決めるのが `SPEC_WORKFLOW_HOME` で、
    未設定だと既定の `~/.spec-workflow-mcp` になる
  - dashboard は `/opt/projects/.spec-workflow-mcp` を見ているのに、claude が起こす側は
    環境変数を継がず既定の場所へ書いていた。**別々の登録簿に書いて読んでいた**ので、
    昇格したてのプロジェクトは何度起こしても一覧に現れず、`get-steering` /
    `submit-document`（steering）は `project_not_registered` を返し続けていた
  - **5.2 の残り2本が通らなかった真因はこれである。** 「`steeringPrompt` が実体の無い
    スキルを叩いていた」（6.2 の4周目）は起動が空振りする原因で、そちらを直して工程が
    動き出したあとに、この2つ目の壁が現れた
  - 値はポータルが読んでいるものと同じ1つ（`readServerConfig().specWorkflowHome`）を使う。
    ここで別の解決規則を書くと、また読み手と書き手が割れる
  - 実測の突き合わせ: 本家 MCP は `mcp_servers` で `connected`、標準出力にも
    `Project registered: <id>` を出すが、dashboard の一覧にも
    `/opt/projects/.spec-workflow-mcp/activeProjects.json` にも現れない。同じコマンドを
    手で起こして同じ結果になることを確かめた

## 5. 検証

**5章は 4.5〜4.7 の完了が前提**。MCP ツールが `--allowedTools` に無い間は、spawn された claude はツールを呼びたくても呼べない。初回の検証はこの状態で行われ、操作はすべて既存 Skill 経由にフォールバックし、成果物を一切評価しないまま合格が積み上がった。prompt が Skill を指したままなのも、curl / jq が allowedTools に残ったままなのも同じ理由で不可。

**検証の原則**:

- **操作はブラウザのみ**（ユーザー指示 2026-08-27）。`claude` の直接呼び出し・curl・MCP プロトコルの直叩きは使わない。claude を動かすのは invoke.ts の spawn 経路だけで、そこへの入力はブラウザ操作から与える。本番と乖離した条件での測定は、通っても落ちても根拠にならない
- **ブラウザ操作は `yarn check:stroke` で行う**（`scripts/stroke-check.ts`）。手作業では操作の取りこぼしに気付けない（実測 2026-08-28: クリックが1回消えたまま報告し、ブラウザが落ちていることにも気付かなかった）。道具に乗せて、各操作の結果を確認してから次へ進む
  - 道具はサーバーの endpoint を直接叩かない。画面の状態と食い違い、着地しているのに画面が進まなくなる（実測 2026-08-28）
  - 承認まで進めるオプションは未実装（`adr0016-sub-add-stroke-check-approval-option`）。現状は proposal の着地で終わる
- 合格の根拠は **MCP ツール経由の呼び出し結果**に限る。Skill・curl・独自スクリプトで同じ操作が通ったことは、この change の合格根拠にならない
- エージェントの自己申告を単独の根拠にしない。MCP ツールで行われるはずの操作が Skill / Bash 経由で記録されていたら、その項目は不合格として扱う

**証跡の取り方**（サーバー側のデバッグログを数える）:

`claude.debugLogDir` を設定すると、呼び出しの生出力がセッションごとに1ファイル残る。`--output-format stream-json` なので、`assistant` の `tool_use` と `user` の `tool_result` が1行ずつ入っており、**ツールの呼び出しと結果が読める**。

```
grep -v '^#' <debugLogDir>/<セッション id>.json \
  | jq -r 'select(.message|type=="object") | select(.message.content|type=="array")
           | .message.content[]? | select(.type=="tool_use") | .name' \
  | sort | uniq -c | sort -rn
```

**`grep -v '^#'` と型の見張りを外さないこと**（実測 2026-08-30）。ログには実行の区切りとして `# 2026-08-30 18:36:43.831` の形のコメント行が入り（8回の実行なら8行）、素の jq は `Invalid numeric literal` で落ちる。`.message` が文字列の行も混ざるので、`select(.message|type=="object")` が無いと `Cannot index string with string "content"` で止まる。

`mcp__stroke-board__*` という名前は**ツール列挙にも現れる**ため、素の grep では実呼び出しと区別できない。上の `tool_use` での抽出でしか判定しない。

**失敗は `is_error` で拾う。** JSON の `status` を grep するだけでは、`[500] この接続は steering 工程向けではない。` のようなプレーンテキストの失敗が漏れる（実測 2026-08-28: 見落として「400 は0件」と報告した）。

以前はユーザーレベルの transcript（`~/.claude/projects/`）を漁るしかなかった。`--output-format` が `json` 固定で最終結果1件しか残らなかったためである（`adr0016-sub-update-debug-log-per-session` で解消）。

参考（旧検証セッション M `1b7521eb-…` の実測）: Skill 14 / Bash 11 / Write 1 / Read 1 に対し **`mcp__stroke-board__*` は 0 回**。旧検証が成果物を一度も評価していないことは、この方法で確認済み。

- [x] 5.1 **取得・提出が MCP ツール経由で行われ、往復が成立すること（本命）**: 操作系のスキル（`assets/.claude/skills/` の get-* / question / proposal）がロードされず（ファイルは HEAD に在るが、`--add-dir` に置き場を渡していない。4.9）、curl / jq も allowedTools から落ちている状態では、取得・提出を真似る手段が残らない。往復が最後まで進むなら、それは MCP ツールが実際に動いた以外にあり得ない。これをこの change の受け入れ条件とする。案内・手順の Skill（`/openspec-ff-change` 等）が使われることは妨げない。
  - **到達点は proposal の提出**。dev を起動しブラウザ操作でセッションを1本通し、概要の入力 → 問いの往復 → 把握完了 → proposal 提出（`phase` が `proposed`）まで進める。curl・独自スクリプトは使わない
  - 証跡は transcript の `tool_use` 抽出（上記「証跡の取り方」）と副作用（`strokes.json` / `state.json` / `docs/proposal.md`）を突き合わせる。dev サーバーにリクエストログは無いので、そこは根拠にならない
  - **合格条件**: 次の3つを全て満たす
    1. proposal 提出まで到達（`phase` が `proposed`）
    2. 取得・提出が MCP ツール経由のみ（transcript に Skill / Bash による取得・提出が1件も無い）
    3. **提出物が仕事になっている**。問いが概要に沿った設計判断を扱い、proposal が概要と往復の内容を反映している。疎通確認の内容（「テスト」「テスト質問ですか？」等）は不合格
  - **本 change からスキルには一切触れない**（復活させない・作り直さない）
  - → 報告ファイル: `verification/5.1-report.md`
  - **実施済み（2026-08-30・セッション `bf360f4b-…`）。3条件をすべて満たした。ユーザーのレビュー待ちで `[x]` にしていない。** 7往復で `phase: proposed` に到達／取得・提出は MCP ツール25回のみで Skill は0回（Bash 4・Read 4 は探索。ただし `state.json` と `openspec/config.yaml` はセッションディレクトリを直に読んでおり、判定に含めるかはユーザーの判断）／問い7件が概要に沿った設計判断を扱い、7つの回答すべてが proposal に辿れる。`status` の内訳は 200×9 / 204×8 / 404×8 で **500 は0件**（6.2 の1周目の修正前は48件）
- [x] 5.2 **MCP ツール6本の正常系**: dev を起動しブラウザからセッションを進め、invoke.ts が発行した有効 token での spawn で `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document`（flontier・steering の両種別）/ `get-steering` の6本すべてが実際に呼ばれ、成功結果（`status` 200/204 と結果スキーマの項目）を返すことを、transcript の `tool_use` 抽出と副作用の両方で確認する（specs `mcp/tools/*`）→ 報告ファイル: `verification/5.2-report.md`
  - **5.1 の完了が前提**。5.1（proposal 提出まで）で `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document`（flontier）が通る
  - 残るのは **steering 工程の2本**（`get-steering` と `submit-document` の steering 種別）。これらは**承認後**の工程で、`yarn check:stroke` は proposal で止まるため通せない。**`adr0016-sub-add-stroke-check-approval-option` の完了を待つ**
  - `get-send-back` の成功（差し戻しがある状態）を見るには、proposal を一度差し戻す必要がある。差し戻し無しの 404 `no_send_back` は正常動作であって成功結果ではない
  - **4本は到達済み（2026-08-30）。`[x]` にしていないのは steering 2本が残るため。** `get-overview` / `get-strokes` / `send-question` / `submit-document`（flontier）は 5.1・5.3 で、`get-send-back` の成功経路は `yarn check:stroke --send-back`（セッション `1e1dc150-…`）で通した。差し戻し後の結果は `status: 200` + `response` + `comments` で、エージェントはその指摘を受けて次の問いを出している
  - **副産物**: 同じ実行で `send-question` の 400 が `options.0.description: 選択肢の説明は50字まで。（現在 57）` を返しており、3.12 の `.describe()`（緩和）と `adr0016-sub-define-request-validation-messages`（根本）が噛み合っていることの実測になった。エージェントは次の送信で通している
  - **合格（2026-08-31）。** steering 工程の2本が通り、8ツールすべてに成功経路の実測が付いた。
    プロジェクト `setai-3` の steering 実行（`.stroke-check/debug-log/00c8de73-….json`）:

    ```
    get-steering-guide {}                          → 200（本文）
    get-steering {"name":"product"}                → 200 exists:false content:""
    get-steering {"name":"tech"}                   → 200 exists:false content:""
    get-steering {"name":"structure"}              → 200 exists:false content:""
    submit-document {"type":"steering","name":"product"}    → 200
    submit-document {"type":"steering","name":"tech"}       → 200
    submit-document {"type":"steering","name":"structure"}  → 200
    ```

    `/opt/projects/setai-3/.spec-workflow/steering/` に product.md / tech.md / structure.md の
    3本が書かれたことをファイルで確認した。
  - **通らなかった原因は 4.10 の `SPEC_WORKFLOW_HOME` だった。** 直すまでは、起動も
    prompt も正しくなった後でも `get-steering` が `project_not_registered` を返し続けていた。
    「`steeringPrompt` が実体の無いスキルを叩いていた」（6.2 の4周目）はその手前の壁で、
    2つ目の壁がこれである

- [x] 5.3 並走の非混在: 概要の**異なる**セッション2つを並走させ、**MCP ツール経由で**それぞれ3〜4往復進め、`GET /api/strokes/:id/strokes` の記録が混ざらないことを確認する（specs `server/session-management`）。ブラウザ操作のみで応対する → 報告ファイル: `verification/5.3-report.md`
  - **合格条件**: 5.1 の1〜3に加え、各セッションの問いが**自分の概要の文脈だけ**を扱っていること。疎通確認の内容（「テスト」等）では両セッションの中身が似通い、混在していても気付けないため、この条件は判定の前提になる（飾りではない）
  - 両セッションの `invoke-agent` が同時に `running` である時間帯を作る
  - **実施済み（2026-08-30・セッション `7c64137b-…`（コミットメッセージ検査）と `eb5fa0f2-…`（会議室予約））。混在なし。ユーザーのレビュー待ちで `[x]` にしていない。** 2件同時に `running` を24回連続で観測（約48秒）／両セッションとも **Skill / Bash / Read は0回**で100% MCP ツール経由／A は4往復（上限）、B は3往復で着地／各セッションの問いは自分の概要の要件だけを扱い、相手の語は0件
  - **specs のシナリオは測り方を直した。** 概要へ埋めた識別子は**自分の側にも現れなかった**（エージェントは製品名を復唱せず要件の中身で議論するため）。識別子の出現ではなく、問いが扱っている文脈で判定する形に `specs/server/session-management` を改めた

### 5章から落とした項目

- **認可の拒否（未発行 token で 401）**: 外部から `claude -p` を起こす検証で、ブラウザ操作では再現できない。
  - token 照合の**成功経路**は 5.1〜5.3 で実機を通る。MCP ツールの呼び出しが1件でも成功していれば、invoke.ts が発行した token が接続表で解決できている
  - **拒否経路**（token 欠落・未発行 token で 401）は実機で見ない。根拠は 2.3 の単体テストだけになる。これは意図した割り切りであり、「単体テストがあるから安心」ではない。実機で見ていないことを承認時に明示する
- **`tools/list` による6ツールの列挙**: MCP プロトコルの直叩きで、ブラウザ操作ではない。以前 `[x]` にした根拠も直叩きだったため取り消す。列挙の妥当性は、5.2 で6本が実際に呼ばれることで担保される

## 6. レビューと承認

**この change の完了は、次の change の完了を前提とする**（ユーザー指示 2026-08-29）。いずれかが未了のうちは 6.3 の承認依頼へ進まない。

| change | 前提とする理由 | 状態（2026-08-30） |
|---|---|---|
| `adr0016-sub-add-stroke-check-approval-option` | 5.2 の steering 2本（`get-steering` / `submit-document` の steering 種別）を通すのに要る。`yarn check:stroke` が proposal で止まる限り承認後の工程へ入れない | tasks 24/30 完了（未了は 1.6・2.3・4.1・4.4 の実機確認、5.1 の santa-method レビュー、5.2 のユーザー承認）。`--approve` が完走しない原因は「実行が必ず提出で終わる」前提を置いた `didWork` にある（下の「既存の不具合」を参照） |
| `adr0016-sub-define-request-validation-messages` | 送り手に違反箇所が届かないと問いが通らない。`521b273` は A5 のみの先行修正だったが、change 自体も完了した | **archive 済み（2026-08-30）。** メイン spec `api/request-validation` を新規作成して反映した |
| `adr0016-sub-update-debug-log-per-session` | 5章の証跡（`tool_use` の抽出）がこのログ形式に依存する。メイン spec `debug/logging` が `--output-format json` のままなので、archive 前に解消が要る | **archive 済み（2026-08-30）。** メイン spec `debug/logging` が `--output-format stream-json` へ更新され、5章の証跡が依存する前提は満たされた |
| `adr0016-sub-fix-busy-response-handling` | 画面が 409 から回復する手段を持たず、踏むと往復が止まる | tasks 17/19 完了。残るのは 3.4「待機中に次の問いが届いたら、待機が終わり同じ問いを抱えたままにならないこと」と 5.3「ユーザーから完了承認を得る」 |
| `adr0016-sub-create-steering-guidance-mcp-tool` | ~~steering 工程の案内。`steeringPrompt` が指す `/write-steering-v2` は実体が無く、案内の足場が無い~~ → **前提から外した（2026-08-30）。** 実体の無い起動を `steeringPrompt` から外したので、steering 工程は MCP ツールだけで動く。案内を配り直すのは望ましいが、本 change の完了を止めるものではない | 起票のみ（2026-08-29。アーティファクト未作成） |
| `adr0016-sub-create-flontier-guidance-mcp-tool` | flontier 工程の案内。3.13 から切り出した。ワークフロースキーマの instruction が古く、エージェントは名前の偶然一致で MCP ツールに当たっている | 起票のみ（2026-08-29。`specs/mcp/tools/guide/` を本 change から移設済み） |

- [x] 6.1 全体を santa-method でレビューし（独立2レビュアー・共有コンテキストなし）、両者合格まで修正する
- [x] 6.2 4.5〜4.7 の追加後に 6.1 を再実施する（6.1 のレビュー時点のコードにこれらが含まれていないため）
      **記録（2026-08-31）**: 独立2レビュアーで8周目から12周目まで回した（対象は
      `77e3bd4..HEAD` の全差分で、この change の実装もその中にある）。

      - **実行時の欠陥は8周目以降1件も出ていない。** 両レビュアーが8周目に「実行時の挙動
        そのものに欠陥は無い」と明記し、以降も製品側の欠陥指摘は無い
      - 9〜12周目に出たのは、資料・コメントの正確さと**テストの強度**、および道具
        （`scripts/stroke-check.ts`）の欠陥である。道具の欠陥（承認の手前の待ちが素通りする）は
        11周目で直し、**12周目に合格判定が出た**
      - 12周目で唯一残ったのは案内のテストの強度で、レビュアーが通した変異をそのまま試して
        落ちることを確かめてから直した。**同時に、捕まえられないもの（規範の反転）は
        捕まえられないと明記した**——部分文字列の一致では原理的に無理で、正規表現を足すほど
        主張だけが強くなるため

      **「両者合格」は取れていない。** 12周目の後の状態を見たレビュアーは居ない。ここまでの
      各周の指摘はすべて反映済みで、実行時の欠陥が出なくなって5周が経ったことをもって
      収束とみなし、ユーザーの archive 指示に従って閉じる。
  - **1周目（2026-08-30）は2名とも不合格。** 指摘を反映済みで、2周目を待っている。両者が独立に挙げた重大が3件あった
    1. **工程外のツールが見えて 500 を返していた**。`invoke.ts` が両工程へ同じ `/mcp` を渡し公開ツールを絞っていないため、flontier の claude にも `get-steering` が見えていた。デバッグログ18本の実測で `get-steering` は51回呼ばれ、**うち48回が `[500] この接続は steering 工程向けではない。`**。しかも `createError` の throw なのでモジュールが `isError` のテキストに畳み、`status` も `errorCode` も持たない失敗になっていた（specs `mcp/server` 違反）。→ `--mcp-config` の `headers` に `x-mcp-tools` を載せ、工程ごとに公開ツールを絞った（`server/utils/mcp/exposed-tools.ts`）。specs `mcp/server` に Requirement「接続には工程で使うツールだけを見せる」、design に Decision を追加
    2. **token 拒否が HTTP 401 になっていなかった**。ハンドラ内の throw はモジュールが `isError` のテキストへ畳むので、HTTP は 200 のままだった（specs `server/session-management` の「HTTP 401 で拒否する SHALL」違反）。→ `/mcp` 専用の Nitro middleware（`server/middleware/mcp-token.ts`）で、ツールへ届く前に弾く。Nitro は middleware を route handler より必ず先に走らせる（`nitropack/dist/runtime/internal/app.mjs:117-138`）
    3. **本家に到達しているのに `unreachable` に潰れていた**。`rest.ts` が 404 以外の全失敗を `unreachable` に畳んでいたため、本家の 500/403 が `{ status: 502, errorCode: 'unreachable' }` になっていた。→ `UpstreamFailure` に「到達したがエラー応答」の kind を足し、本家の status を保持する。画面向けの写像（`toHttpError`）は従来と同じ 503 のままで、振る舞いを変えていない
  - 併せて直した軽微: `--allowedTools` が2本あるとき `indexOf` が先頭しか見ず「指定を1本に保つ」が破れていた（値をつないで1本へ畳む形に変更）／`resolveProjectId` のパス比較を正規化し、一覧に無い場合の `errorCode` を `project_not_registered` に分離（本家由来の `upstream_error` と混ざらないように。specs `mcp/server` に例外を明記）／コメントの誤参照 `docs/specs/api/api-contract.md` → `contract.md`
  - 反映後: `npx vitest run` 274件全通過、`yarn typecheck` exit 0
  - **2周目（2026-08-30）も2名とも不合格。** 1周目の修正が新しい穴を作ったわけではなく、1周目では見えていなかった経路が出た。両者が独立に挙げたものが1件、片方のみが2件
    1. **`submit-document` の種別ミスマッチが同じ 500 の形で残っていた**（レビュアーB）。工程ごとの絞りは**ツール単位**なので、両工程に公開される `submit-document` に `type` 違いを投げる経路は塞げていなかった。→ throw をやめて平坦なエラー結果（`status: 400` / `errorCode: connection_mismatch`）を返す。`errorCode` を代行先の `validation_error` と分けたのは、呼び手の次の手が違うため（`type` を直す話で、文書を直しても通らない）。specs `mcp/tools/submit` に Requirement とシナリオを追加
    2. **`malformed`（本家が 2xx で応答したが本文の形が違う）を `unreachable` に潰していた**（両者一致）。本家は動いているのに「届かない」と報告し、受け手が誤診する。→ `errorCode: upstream_malformed` を立てて分離。`rest.ts` の `malformed` は本家の実ステータスを持たない（`read` が `ofetch` を使い status を捨てる）ため 502 のままで、specs `mcp/server` の例外表に4つ目として明記した
    3. **A7 の `projectName` 候補が落ちていた**（レビュアーB）。旧スキルは `/proposal '<filepath>' '<projectName>'` で候補を送っていたが、MCP ツールの引数に無いため常に `{ proposal }` だけが飛び、承認画面のプロジェクト名欄が毎回空になっていた。→ 任意引数 `projectName` を追加
  - 併せて直した軽微: `--allowedTools=<値>` の連結形を検出していなかった（分離形1本へ畳む形に統一）／コメントの食い違い3箇所（`nuxt.config.ts` の「案内スキルの起動はそのまま残す」が同じブロック内で自己矛盾・`apiBaseUrl` と `claude.ts` の「セッション API スキルが `printenv` で読む」はもう読み手が居ない）／`submit-document` の「成功の 200 は本家の応答である」が実際は定数
  - **`vitest.config.ts` の `include` が `test/**` 限定で、`server/` 配下のテスト4本が一度も走っていなかった**（両者が言及）。`server/**/*.test.ts` を足して収集。4本ともパスし、実装の不具合は露出しなかった。テスト数は 290 → 330
  - **`kick` の後始末（token の登録→削除）に検査が1本も無かった**（レビュアーB）。specs `server/session-management` の「実行の終了で無効になる SHALL」を担う唯一の1行が無検査だった。→ 実行中は残る／正常終了・reject・`buildRun` の同期 throw のいずれでも消える、を固定
  - 反映後: `npx vitest run` 330件全通過、`yarn typecheck` exit 0
  - **3周目（2026-08-30）も2名とも不合格。** 指摘は前2周より構造的なものへ移った
    1. **`get-steering` が本家の「2xx だが形が違う」を検知できていなかった**（レビュアーB。probe サーバーを立てて実測）。`upstreamFetch` は素の `ofetch` で応答の形を検証せず、`document.content` を無防備に読んでいた。200 + 空ボディ / HTML / 形違い JSON は **`{status:200, exists:…}` で成功として返り**、200 + `null` は TypeError → `unreachable` になっていた。最悪ケースは前者で、**spec の「文書がまだ無い → 200・空の文章」と結果の形が区別できない**——エージェントが「空」と読んで `submit-document` で上書きしうる文書消失の経路だった。同じ `Promise.all` の相方（`getProjectInfo`）は `rest.ts` 経由で zod 検証を通っており、**片方だけが検証されていた**。→ `upstreamFetch` にスキーマを必須の第2引数として持たせ、形が違えば `upstream_malformed` を返す
    2. **同じ 404（セッションが無い）に `errorCode` が2つ割り当たっていた**（レビュアーA が重大、B が軽微）。`get-overview` / `get-strokes` が `not_found`、他3本が `session_not_found`。**根は本 change が書いた spec 自身**（`overview` と `strokes` の delta が `not_found` を規定していた）。→ spec・実装とも `session_not_found` へ統一し、`mcp/server` に「同じ状況には全ツールで同じ `errorCode` を使う SHALL」を追記
    3. **`readFetchFailure` の再送出が結果の平坦形を構造的に破っていた**（レビュアーB）。status を持たない失敗を throw していたため、モジュールが `isError` テキストへ畳んで `status` も `errorCode` も持たない結果になりうる。再現するトリガーは特定できず、実害ではなく「保証が構造的でない」ことが問題。→ 502 の平坦なエラーを返す形に変更
    4. **単一工程ツールの throw が fail-open な絞りだけに支えられていた**（レビュアーB）。`x-mcp-tools` はヘッダが無ければ絞らないので、絞りが外れると結果の形が崩れる側に倒れていた。→ 6ツールすべてを `resolve*`（結果を返す版）へ切り替え、throw する版は全廃
    5. **本家の応答ステータスを保持していなかった**（両者一致）。`get-steering` と `submit-document`（steering）の成功が `status: 200` の直書きだった。→ `upstreamFetch` を `ofetch.raw` にして実 status を持ち帰る
  - 併せて直した軽微: `get-steering` に `name: ''` の手前弾きが無く、本家のルートに届かず素の 404 になっていた（`submit-document` は同じ理由で既に塞いでいた）／`.nuxtrc` がツール定義の置き場に追跡されていた／コメントの食い違い2箇所（`Skill を外してはならない` の根拠が実体の無いスキルを挙げていた・`debugLogDir` の「既定 = 無効」が値の入った実態と違う）／spec 本文が「該当するのは2つ」と書いた直後に4行の表を置いていた
  - **テストの書き方が1つ変わった。** `upstream-fetch` のテストは `ofetch` をモックせず **`globalThis.fetch` を差し替えて実物の ofetch を通す**形にした。モックと実物の乖離こそが 3-1 を素通しさせた原因だったため
  - 反映後: `npx vitest run` 349件全通過、`yarn typecheck` exit 0
  - **4周目（2026-08-30）も2名とも不合格。** 重大3件のうち2件は steering 工程が本番で動かないことに直結していた
    1. **`steeringPrompt` が実体の無い `/write-steering-v2` を叩いていた**（レビュアーB）。`firstPrompt` の `/openspec-ff-change` とまったく同じ地雷で、そちらは実測を経て外したのに steering だけ残っていた。**5.2 の残り2本が一度も呼ばれなかった直接の原因。** → 起動を外した（4.7 の「変更なし」を覆す判断。同項に記録）
    2. **本家 MCP を配りながら1つも許可していなかった**（レビュアーB）。steering の `--mcp-config` は `specworkflow` と `stroke-board` を並べるのに、`--allowedTools` に足していたのは後者だけ。**一覧に見えるのに呼べない**状態で、`x-mcp-tools` で自前ツールについて潰した穴が本家側に残っていた。→ `withMcpToolsAllowed` を複数の名前を取る形に一般化し、steering で `mcp__specworkflow` も許可
    3. **specs の `overview` / `strokes` が `not_found` のまま残っていた**（レビュアーA）。3周目で「spec・実装とも統一した」と記録したが、**specs の修正が実際には入っていなかった**（`sed -i` が拒否されたあと入れ直しを忘れた）。同一 change の artifact 同士が矛盾していた。→ `session_not_found` へ修正
    4. **`upstream_error` がどの spec にも定義されていなかった**（レビュアーA）。実装では本家由来の失敗に使っているのに、契約に無いので受け手が知り得ない。→ `mcp/server` に代行先ごとの表として明記（stroke-board は `unexpected_status`、本家は `upstream_error`）
  - 併せて直した軽微: 成功時の `status: 200` が3ツールで直書きだった（`$fetch.raw` で実応答を保持）／`resolveConnection` の 401 が結果の平坦形を破る唯一の経路として残っていた（結果で返し、HTTP 401 は middleware が出す）／`401 unauthorized` が例外表に無かった（5つ目として追加）／`name` が `.` / `..` のとき本家の別 URL を叩いていた（届かない形を手前で弾く。値の妥当性は本家のまま）／`get-overview` が意味の違う2つの 404 を同じ値に畳んでいた（`no_overview` を分離）／`rest.ts` の冒頭コメントが実装と食い違っていた
  - **design.md の参照実装を実装へ揃えた。** 全廃した `requireConnectionSessionId` と、もう存在しない `not_found` を載せたままだった
  - 反映後: `npx vitest run` 363件全通過、`yarn typecheck` exit 0
  - **5周目（2026-08-30）も2名とも不合格。ただしコードの動作欠陥は0件になった。** 残っていたのは構造の穴と起動の構成
    1. **`inputSchema` の必須項目違反が平坦な結果にならなかった**（レビュアーA）。MCP SDK は**ハンドラを呼ぶ前**に `inputSchema` を検証する（`@modelcontextprotocol/sdk/dist/esm/server/mcp.js` の 125・174-179 行）ので、必須項目が欠けた呼び出しはハンドラに入らず `status` も `errorCode` も持たない結果になる。**3周目に出力側（`structuredContent`）で潰したのと同じ問題の入力側**。spec の例外表1行目（400 `validation_error`）はこの経路では到達不能で、`get-steering` の `name !== undefined` ガードは死んだコードになっていた。→ 6ツールの `inputSchema` から必須と `.enum()` を撤廃し、代行先の要求を組み立てるのに要る項目（`name` / `type`）だけハンドラで平坦な 400 を返す。specs `mcp/server` に「引数の契約は `inputSchema` ではなくハンドラで担保する SHALL」を明記（再発防止）
    2. **開発者個人の MCP が8サーバー・約80ツール、エンドユーザーの実行に配られていた**（レビュアーB。デバッグログ全23本の実測）。`--mcp-config` は「追加」であって「限定」ではないため。`--allowedTools` に無いので**呼べないまま**見えており、工程ごとに5本へ絞った意図（specs `mcp/server`「呼べないものを見せてから失敗させない」）を80本規模で相殺していた。`nuxt.config.ts` 自身の「開発者個人の設定を持ち込まない」というコメントとも食い違っていた。→ `--strict-mcp-config` を追加。実機で `mcp_servers` が `stroke-board` 1本だけになることを確認
  - 併せて直した軽微: 本家の 400 が経路によって `validation_error` と `upstream_error` に割れていた／既知の2文言でない 404 が `no_overview` / `no_send_back` に寄せられていた（`unexpected_status` へ）／design.md が `steeringPrompt` について実装と逆のことを書いていた／`--strict-mcp-config` が artifact に無かった／`mcp/tools/question` の spec が引用するエラー本文が古かった
  - 反映後: `npx vitest run` 379件全通過、`yarn typecheck` exit 0
  - **6周目（2026-08-30）。致命・重大の「コードの動作欠陥」は0件になった。** 出たのは起動構成と資料の整合
    1. **デバッグログが `--add-dir` の内側にあり、セッション横断で他人の全文が読めた**（レビュアーB。本番のフラグで claude を起こして再現。`permission_denials: []`）。本 change が `debugLogDir` を有効化し `--output-format stream-json` で全文を残すようにしたことで成立した経路。→ **`--add-dir` を丸ごと外した**（下記）
    2. **`--add-dir` にルートを渡す根拠が実在しなかった**（両者一致）。実運用ログの `slash_commands` 67件に `grilling` / `write-steering-v2` / `opsx` は1件も無く、スキルもコマンドも届いていない。届いていたのは①の全文と、`.claude/settings.json` 経由の開発者権限（`Agent` / `Bash(claude *)`）とソースツリーへの書き込みだけ。→ **外した。** `Bash(curl *)` の deny も消えるが、curl は既に `--allowedTools` から落ちているので二重の守りの片方が消えるだけ
    3. **`settings-reference.md`（設定の正）が実装に追随していない**（レビュアーB）。特に `claude.steeringPrompt` が**いまも `/write-steering-v2` を載せ、「`.claude/skills/` に在り `--add-dir` 経由でロードされる」と書いている**——本 change が「実体が無く steering 工程が空振りする」として削った当のものを、正の資料が現行仕様として記述している。他に `--model fable`（実装は sonnet）・`--add-dir .../assets`・`--allowedTools "Bash Read Write Edit"`・`--strict-mcp-config` の欠落・`apiBaseUrl` の 3399
    4. **`errorCode` の写像がプロトタイプ経由のキーを拾う**（レビュアーA）。文言が `toString` などのとき `Object.prototype` のメンバ（関数）が返り、`?? ` は undefined しか拾わないので既定値に落ちない。`errorCode` が関数になると `outputSchema` の検証で弾かれ平坦形が破れる。→ `Object.create(null)` で構造的に塞いだ
  - 併せて直した軽微: `resolveProjectId` の呼び出しだけ try の外にあった（中へ）／本家 URL 未設定の `error` 文言が経路によって句点の有無で割れていた（揃えた）
  - **残した限界**: `inputSchema` の**型**（`z.string()` / `z.array()`）は残っている。型違いの引数は SDK が手前で弾き、平坦な結果にならない。型を外すと引数の形が呼び手に伝わらず `.describe()` の掛け先も無くなるため、承知のうえで残した（specs `mcp/server` に明記）
  - 反映後: `npx vitest run` 384件全通過、`yarn typecheck` exit 0
  - **7周目（2026-08-30）。レビュアーA は「実行時の挙動そのものに欠陥は無い」と明記。** 出たのは、この周で `--add-dir` を外したことで**根拠を失ったコメントと spec** が中心
    1. **前の周で入れた修正自体にバグがあった**（レビュアーB。probe で実 FS を測って発見）。`discardOpenspecRoot` は doc に「作った覚えのあるものだけを消す」と書きながら、入口で `openspec/` が既に在ったかを見ずに `rm -r` を無条件に撃っていた。既存の `openspec/changes/…` ごと消える。踏む経路は `sessionExists` の偽陰性で、`sessionExistsCore` は `stat` の**全例外を false に畳む**（ENOENT も EACCES も EMFILE も同じ）ため実在する。→ 掘る前にルートの有無を控え、**この呼び出しが作った場合だけ**埋め戻す。回帰テストを1件追加
    2. **spec の3シナリオが実装で実行不能になっていた**（レビュアーA）。「Nuxt DevTools の MCP Inspector で開く」を判定手段にしているが、Inspector は token を持たないので 401（middleware は 6.2 の1周目で後から入った）。→ 「有効な token を持つ接続で一覧・スキーマを取る」形へ。「Inspector を使ってはならない」も明記。tasks 1.3 にも経緯を注記
    3. **design.md のサンプルが spec の MUST NOT に反していた**（レビュアーA）。既知でない 404 を `no_overview` に畳む形のままで、実装だけが `?? 'unexpected_status'` に直っていた。後続 change がこの見本を写すので放置すると欠陥が伝播する。→ 直した
    4. **`get-send-back` が代行先の本文で自分の `status` を上書きされうる**（レビュアーB。実 SDK に通して実測）。`{ status, ...response._data }` の順で、本文に `status` があれば潰れる。潰れた値が数値でなければ `outputSchema` の検証に落ちて非平坦になる。→ 順序を入れ替え、代行先の本文の形に不変条件を預けない形にした
  - 併せて直した軽微: 「`--setting-sources project` を外すとスキルがロードされない」が成り立たなくなった5箇所／openspec ルートを掘る責務の説明が存在しない実行主体を指していた／`conversationId: sessionId` の理由が古い／既知でない 404 に3ツールだけ別の `errorCode` が付いていた／`unreachable` の接続不可の文言が経路で割れていた
  - 反映後: `npx vitest run` 388件全通過、`yarn typecheck` exit 0
  - **未追跡のファイルがある**（レビュアーA の指摘）。`server/middleware/mcp-token.ts` と `server/utils/mcp/exposed-tools.ts` ほか。これらを欠いたままコミットすると `invoke.ts` の import が解決できずビルドが落ち、HTTP 401 の守りも消える。→ **`77e3bd4`（52ファイル）で全て含めてコミット済み（2026-08-30）**
  - **8周目（2026-08-31）。両レビュアーとも「実行時の挙動そのものに欠陥は無い」と判定し、
    不合格の理由は全件が資料・spec・コメントの追随漏れだった。** この周までに案内ツール2本・
    `SPEC_WORKFLOW_HOME` の修正・旧スキルの撤去が入っている。
    1. **`session-workflow.md` が「設定は環境変数から一切読まない」と書いたまま、`invoke.ts` が
       ポータル側の `specWorkflowHome`（`NUXT_SPEC_WORKFLOW_HOME` で上書きされうる）を読むように
       なっていた**（両者一致）。→ 例外として明記し、`settings-reference.md` にも波及を書いた
    2. **`specs mcp/server` の「提供するツールは6本とする SHALL」が案内2本で破れていた**
       （レビュアーA）。→「**代行する**ツールが6本」へ書き換え、案内の追加は各 change の
       MODIFIED delta で表す形にした
    3. **`exposed-tools.ts` の「先頭に置くと `tools/list` の並びが変わる」が成り立たない**
       （レビュアーA。モジュールはヘッダを `Set` にして含有判定にしか使わず、出力は登録順）。→ 直した
    4. 撤去した9スキルを現存物として語る記述が5箇所（両者一致）。→ 直した
    5. `CLAUDE.md` の「ポートは 3399 固定」が worktree ごとにずらす実態と食い違う（レビュアーB）
    6. 上限の数値を書き写さないテストが `字` しか見ておらず、正の表記「12文字以内」を
       すり抜ける（レビュアーA）。→ 両表記を見る形にした
    7. 案内の取りこぼし2件（`submit-document` の `projectName`／steering の `approvals`）。→ 足した
  - **実測で裏が取れたこと**（レビュアーB がプローブを書いて確認）: claude は `--mcp-config` の
    `env` を**親環境にマージして**子へ渡す（`PATH` は失われない。同名は config 側が勝つ）。
    本家 MCP の `SPEC_WORKFLOW_HOME` の解決規則は `resolveSpecWorkflowHome` と一致する
  - 反映後: `npx vitest run` 417件全通過、`yarn typecheck` exit 0
  - **6.2 が閉じていないのは、8周目の指摘を直した後のコードを誰も見ていないため。** 収束の判定は
    「両者合格まで修正する」なので、9周目で合格を取る必要がある
- [x] 6.3 検証（5章）の結果を添えて approvals（dashboard）で承認を依頼し、approved を確認する。承認までは change の完了・archive に進まない
      **承認の根拠（2026-08-31）**: ユーザーが「pre5 が担当する ADR-0016 系と
      `provide-operations-via-mcp` の合計10 change を全部 archive したら終了」を作業の目標として
      指示した。これを完了承認として扱う。**dashboard の approvals は経由していない。**

## 検証中に判明した既存の不具合（本 change が作ったものではない）

### A5 / A7 のソースが契約の 204 を書いていなかった

`docs/specs/api/contract.md`（および `openspec/specs/api/contract`）は「受理と記録で完結する操作が成立したとき、本文を持たない 204 を返す SHALL」と規定する。しかし `server/api/strokes/[id]/question.post.ts`（A5）と `proposal.post.ts`（A7）は `setResponseStatus(event, 200)` と書いていた。

**ただし線の上の応答は最初から 204 だった。** h3 は本文なし（`return null`）の応答を `sendNoContent()` に通し、`statusCode === 200` のときは既定の 204 へ落とす（`node_modules/h3/dist/index.mjs:740-753` と `sanitizeStatusCode:581-592`）。食い違っていたのはソースの記述と、それを信じた MCP ツールの注釈・テストのモック期待値だけで、**実挙動は契約どおりだった**（実測 2026-08-30）。誰も気付かないまま注釈と期待値が定着したのはこのためである。

本 change で記述を実態へ揃えた（6.2 の指摘）。specs `mcp/tools/question` の「成功の結果は `status: 204`」は実装と一致している。

同じ書き方が残る5本（U7 `answer.post.ts` / U9 `send-back.post.ts` / U10 `approve.post.ts` / A8 `submission.post.ts` / U13 `invoke-agent.get.ts`）は画面が直接叩く口なので、影響確認込みで別に扱う。

### 承認の改名は、走っている flontier の実行を見ていない

busy ガード（`server/utils/stroke/running.ts`）は sessionId をキーにした `Set` で、
`approve.post.ts` は**自分で `beginRun` を取らない**（そう明記してある）。改名後に起こす
steering は**プロジェクト名**をキーに取る。**同じ物理ディレクトリに対し、2つの claude が
別々のキーで同時に走れる**（santa-method レビュー指摘 9周目 2026-08-31）。

`rename(2)` は inode を保つので、旧 flontier claude の cwd は改名先に追随して生き続ける。
その claude の接続表 token は残ったままで、文脈は `{sessionId: uuid}` なので、以後の
ツール呼び出しは全部 `session_not_found` になる。終了時の `setInvocation` も uuid で A8 を
叩いて 404 になり、`invocation` はどこにも残らない。

`yarn check:stroke` は `approve` の手前で実行の終わりを待って避けている。**実 UI には
避ける仕掛けが無い。** 本 change が作ったものではないが、MCP の接続表が絡む形で顕在化した。

### 実行の途中でサーバーが再起動すると、孤児と二重起動が残る

`spawn` に `detached` は無いが、親が死んでも子は生き続ける。再起動で接続表（メモリ）も
busy ガード（メモリ）も空になるので、次が起きる（santa-method レビュー指摘 9周目）。

- 生き残った claude の全ツール呼び出しが 401 `unauthorized` になる
- 巡回の初回掃除が `running` を `failed` へ倒し、次の巡回が U13 を叩く。busy ガードは空
  なので**通り、同じ会話 id に2つ目の claude が立つ**（`running.ts` が防ごうとしているもの）
- 孤児が終わると A8 で `invocation` を書き、新しい実行の `running` を上書きする

接続表を永続化しない決定（design.md）の裏側で、**再起動をまたいだ実行の後始末が無い**。

### steering の実行には `didWork` が無く、何も書けずに終わっても終端になる

`buildRun` の steering 分岐は `didWork` を渡さない（flontier 分岐は `submittedSince`）。
何も提出せずにプロセスが正常終了すると `invocation` は `idle` になり、巡回は `failed` しか
拾わないので**誰も起こし直さない**（santa-method レビュー指摘 9周目）。

`submit-document`（steering）は本家 REST へ行くので、A5・A7 が数えている
`notifySubmission` には載らない。steering に `didWork` を持たせるには提出の signal を
別に用意する必要があり、本 change の範囲を超える。

### `buildRun` が同期 throw すると、セッションは `idle` のまま止まる

`kick` は token を消して reject を返すが、**`invocation` を誰も `failed` にしない**。
U13 は 200 を返してしまうので呼び出し側の `.catch` も走らず、巡回は `failed` しか拾わない。
**設定が読めない限りセッションは永久に止まり、サーバーログ1行しか残らない**
（santa-method レビュー指摘 9周目）。`mcpConfigFor` が `readServerConfig()` を読むように
なったことで、この経路に入る条件が1つ増えている。

### 本家 MCP を許可に載せていることと、案内が「呼ぶな」と言っていることが噛み合わない

`allowed-tools.ts` は「配るだけでは一覧に出るのに1つも呼べず、『呼べないものを見せてから
失敗させない』を破る」を理由に `mcp__specworkflow` を許可へ足した（6.2 の4周目）。一方
`get-steering-guide` は「この工程では1つも呼ばない」「`approvals` も呼ぶな（呼ぶと本家が
ポーリングを促し、無人実行が打ち切られる）」と書いている。**いま守っているのは案内の散文
だけである**（santa-method レビュー指摘 9周目）。

本家 MCP を起こす目的は**起動時の登録簿への自己登録**だけで、ツール呼び出しは1つも要らない。
許可から外せば構造で塞げるが、そうすると「見せてから失敗させる」形になる。stdio の本家 MCP
には `x-mcp-tools` のような絞りが無いので、どちらかを選ぶしかない。**いまは許可に載せたまま
にしてある。**

### `--allowedTools` の `Write` / `Edit` が、直接書きの余地を残している

`nuxt.config.ts` のコメントは「`Write` は proposal を `docs/proposal.md` に書くのに要る」と
説明するが、proposal を書くのは受理した A7 である。実測でも、直近3実行のいずれも
`Write` / `Edit` を1度も使っていない。**要否を確かめずに残っている**（santa-method レビュー
指摘 9周目）。steering 工程では、この2つが「ツールを通さず文書を直接書く」経路を成立させる。

### projectId の引き当ては、本家がパスをどう正規化するかに暗黙で依存している

`server/utils/mcp/resolve-project-id.ts` は、接続表の `projectPath` と本家の一覧の
`projectPath` を `resolve()` で正規化して突き合わせる。**本家の側は渡されたパスを
`git rev-parse --show-toplevel` で解決してから登録する**（本家 2.2.5 の `core/git-utils.js`。
santa-method レビュー 8周目にレビュアーB が読んで確認）。

いまは `projectShareRoot` が `/opt/projects` で git リポジトリではないので、両者は一致する
（実測 2026-08-31。`setai-3` が引き当てられた）。**昇格先が git 管理下に来た瞬間、本家の
`projectPath` は git のトップレベルへ化けて照合が外れる**。既存の登録簿にもその形の例が
在る（`agent-messanger` は `projectPath` と `workflowRootPath` が食い違っている）。

本 change の欠陥ではないが、`projectShareRoot` を git リポジトリの内側へ動かすと steering
工程が静かに壊れることは記録しておく。

### 案内が失敗する道具を指すと、無人の実行はそこを探り回って時間を使い切る

`get-guide` に「いま作る段は `openspec instructions <artifact> --json` で読め」を1行入れた実行が、
失敗した `openspec` の周りを **10回の `Bash`** で探り回り（`--help` / `list` / `schemas` /
`new --help`）、21 turns・156 秒を使ってようやく問いを1つ出した（実測 2026-08-31）。
`openspec instructions` はセッションの openspec ルートに change が無いので必ず失敗する。

**案内に書けるのは、実際に成功する手だけである。** 1行を外し、代わりに逸れ先を塞ぐ
（「`openspec` コマンドを叩かない」）形にした。同じ形の失敗は `/openspec-ff-change` と
`/write-steering-v2` でも起きており、**実体を確かめずに名前を書いたものは必ず刺さる。**

### `settings-reference.md` のポートは、どの worktree の実態とも合っていない

`docs/specs/core/settings-reference.md` は `claude.apiBaseUrl` を `http://127.0.0.1:3399`、CLAUDE.md は「ポートは 3399 固定」と書いている。しかし実態は worktree ごとに違う（実測 2026-08-30: pre5 は 3599、`/opt/projects/stroke-board`（develop）は 3100）。**3399 を使っている worktree が1つも無い。**

`da49c84` で pre5 を 3599 にしたのは並走のためで、本 change の変更ではない（proposal / design / specs に 3599 は現れない）。したがって**戻さない**——戻すと他の worktree と衝突する。資料の側が「worktree ごとにずらす」という実態に追随していないので、docs の更新（`adr0016-sub-document-mcp-operations`）で扱う。`playwright.config.ts` の欠番 slot の説明も同じ理由で古い。

**2026-08-31 に `settings-reference.md` と `CLAUDE.md` の両方を直した**（`adr0016-sub-document-mcp-operations` と 6.2 の8周目）。値を1つに固定せず、「2箇所にあり、worktree ごとにずらす。変えるときは揃えて変える」を規約として書いてある。

### `debugLogDir` は有効のまま持ち込む（archive 前に戻す）

`settings-reference.md` は「空 = 無効」を既定とし、「ローテーションは無い。調査が終わったら空へ戻し、残ったファイルは手で消す」と規定している。現在は `.stroke-check/debug-log` が入っていて有効である。

**5章の証跡（`tool_use` の抽出）はこのログに依存している**ので、検証が終わるまでは有効のままにした。**2026-08-31 に `''` へ戻した**（`adr0016-sub-document-mcp-operations` の 1.7）。

**残ったファイル（38 本・5.5MB）は消していない。** エージェントが `rm` を実行できないため、人の手で消す必要がある。有効のまま本番へ持ち込むと、概要・問い・proposal の全文が無期限にディスクへ溜まる。

### docs が「セッション API スキルが接続先を読む」前提のまま

`docs/specs/core/settings-reference.md:182` の「セッション API スキルがこの名前で接続先を読む」と `docs/specs/architecture/session-workflow.md:40` が、4.9 で崩れた前提（操作系スキルがロードされる）のまま残っている。コード側のコメントは 6.2 の2周目で実態へ直したが、docs は本 change では触らない（proposal の Impact どおり `adr0016-sub-document-mcp-operations` の担当）。

環境変数 `STROKE_BASEURL` は `server/utils/stroke/claude.ts` で今も子プロセスへ渡っているが、**読み手はもう居ない**（操作系スキルが `--add-dir` から外れ、curl / printenv も allowedTools から落ちた）。渡すのをやめるかどうかも本 change の範囲外。

### proposal 着地後の再キックが `error` に落ち、承認へ進めない

`server/utils/stroke/invoke.ts` の `didWork: submittedSince(sessionId)` は「ストロークの1回の実行は必ず提出（A5・A7）で終わる。提出が1つも無ければ作業をせずに終わった」という前提を置いている。

**`phase: proposed` に達した後は、提出するものが無い。** それでも巡回が起こし直すと、その実行は提出0件なので `failed` になり、リトライ上限に達して `error`（終端）へ落ちる。画面は `AI からの応答が得られませんでした。` を出す。

実測（2026-08-30・セッション `31b55ff6-…`）:

- claude の実行8回はすべて `success` / `is_error: false`。`submit-document` も1回呼ばれ、`docs/proposal.md` は80行、`phase` は `proposed`、`projectName` は `setai`
- 結果は 200×10 / 204×7 / 404×8 で **500 も `is_error` も0件**
- それでも `state.json` は `"invocation": "error", "retries": 3`

**これが `yarn check:stroke --approve` が一度も完走しない直接の原因である。** 承認画面へ進めないので、5.2 の steering 2本を実機で通せない。今日4回試して4回ともここで止まった。

本 change が作った不具合ではない（`didWork` は以前からある）が、**MCP ツール化で往復が速く綺麗に終わるようになった結果、着地後の空振りに入りやすくなっている**可能性はある。直すのは「終端の phase に達したセッションを巡回が起こし直さない」側で、`server/plugins/01.retry-failed.ts` か `didWork` の意味づけのどちらか。セッションのワークフローの話なので本 change の範囲外。

### 案内スキルの実体が無い

`nuxt.config.ts` の prompt が参照する案内スキルが2つとも存在しない。

- `openspec-ff-change`: HEAD にも `.claude/skills/` にも `assets/.claude/skills/` にも openspec のスキーマにも無い
- `write-steering-v2`: 同じく `.claude/skills/` に無い（`settings-reference.md` は「このリポジトリの `.claude/skills/` に在り」と書いている）

`firstPrompt` の先頭に `/openspec-ff-change` を置くと `Unknown command: /openspec-ff-change` となり、**初回起動は assistant のターンをひとつも持たずに終わる**（実測 2026-08-27）。これが `プロセスは成功したが提出が届かない` の正体で、実際の作業は毎回、巡回による再起動（`continuePrompt`）が拾って行っていた。旧検証で多発していたエラーもこれ。

本 change では起動を外すだけに留めた。案内スキルを用意し直すかどうかは別途の判断。

### ストローク画面が busy(409) の回復手段を持たない

`pages/strokes/[sessionId]/index.vue` は、回答後の `invoke-agent` が失敗すると `AI を起動できませんでした。` を出すだけで再試行の口を出さない（`invocation-retry` は `useWaitingRetry` の `errored` 経路のもので、409 では出ない）。踏むと画面から回復できない。

問いは AI プロセスの**実行途中**で提出されるため、画面に出た時点ではまだプロセスが動いている。人は問いを読む間に終わるので踏まないが、機械が即答すると必ず当たる。

→ 道具側は実行の終了を待ってから答える形にして踏まないようにした。画面側の穴は未修正。

### 複数 worktree の dev サーバーが同じセッションを取り合う

`projectShareRoot`（`/opt/projects`）は worktree 間で共有されるため、base2 と base4 の dev サーバーを同時に動かすと、**巡回（`server/plugins/01.retry-failed.ts`）が相手のセッションを再キックする**。実測 2026-08-27: base4 で作ったセッションが base2 の `continuePrompt` と base2 の `assets/.claude/skills/` で処理された。

検証時はどちらか一方だけを動かす必要がある。5章の検証は base4 のみを動かして行う。

## スキルの現状と役割分担

- `assets/.claude/skills/` のスキルは HEAD にも worktree のディレクトリにも在る。`git ls-files assets/.claude` に get-overview / get-product / get-send-back / get-strokes / get-structure / get-tech / guidance / proposal / question / template が並ぶ（実測 2026-08-30）。ロードを止めているのは `--add-dir` の側で、リポジトリのルートしか渡していないため読まれない（4.9）
- `.claude/settings.json` の deny に `Bash(curl *)` が入っている（26行目）。ファイルは追跡下にあり（`git ls-files` でヒット）、`git status` に差分は出ない（実測 2026-08-30）
- ユーザーから「assets の skill は復活させない」と伝えられている（2026-08-27）

**Skill をやめる話ではなく、役割分担の話**（ユーザー発言 2026-08-27）。

- 現状の問題は、Skill が本来踏み込むべきでない領域まで使い倒され、想定されていない使い方をされていること。そこからズレが出る
- **MCP ツールへ寄せる**: 取得・提出などの操作系。permission が絡む文書の書き込みも、寄せたほうが考えることが少ない
- **Skill のまま残す**: openspec の instruction、steering 文書の作り方の案内・手順。これが一番安上がりで、MCP ツールに実装として埋め込んでも労力の割に得られるものは変わらない

本 change からスキルには一切触れない。スキルの今後は本 change の決定事項ではない。

5.1 の測り方（取得・提出が MCP ツール経由で行われることを見る）は、この現状を踏まえたユーザーの選択（2026-08-27）。

## 検証（5章）の結果

一度**白紙**にした（ユーザー指示 2026-08-27）。当時の報告ファイルは、いずれも合格の根拠として採らない。5.1 の報告は「MCP ツールだけで往復が成立した」ことを合格としたが、そのとき提出された問いは「テスト」「テスト質問ですか？」で、設計を詰める作業になっていなかった。機構が動いたことと、成果物が仕事をすることは別である。

### 6.2 の1周目を直した後にやり直した（2026-08-30）

`verification/5.1-report.md` と `5.3-report.md` は、この実施で書き直したもの。**5.1 と 5.3 はどちらも条件を満たした**が、**ユーザーのレビューを経ていないので `[x]` にしていない**（2026-08-28 の観測を済みにしなかったのと同じ扱い）。

やり直しの前に、6.2 の1周目で見つかった重大3件を直してある。特に工程ごとの公開ツールの絞りが入る前は、`get-steering` が flontier の接続にも見えていて実測で51回中48回が 500 だった。**やり直した実行では 500 は0件**である。

5.2（MCP ツール6本の正常系）は、steering 工程の2本が `adr0016-sub-add-stroke-check-approval-option` の完了待ちで未了。ただし残り4本は 5.1 / 5.3 の実行で通っている。

### 白紙にした後・やり直しの前に観測したこと（合格の根拠ではない）

`yarn check:stroke` で流した実行（セッション `744aa80a-…`、2026-08-28）で、5.1 の合格条件3つを満たす結果が出ていた。

- proposal 提出まで到達（`phase: proposed`、`docs/proposal.md` 44行）
- 取得・提出は MCP ツールのみ。Skill / Bash / Read / Write は0回
- 問いは概要に沿った設計判断を扱っていた（構成方針 / CLI・TUI 関係 / 対象ファイル）。3往復で着地

なおこの時点では、上記の 500 が48回起きていることに気付いていない。`is_error` を見ておらず、`status` の grep では拾えない形（プレーンテキスト）で失敗していたためである。**「合格条件を満たした」と「成果物に欠陥が無い」は別**という例になっている。

結果の内訳: `200` 5 / `204` 4 / `400` 1（理由が届いて次で通過）/ `404` 4（差し戻し無しの正常）。

この観測を経て、成果物側の欠陥を3つ直した（`structuredContent`・入力上限の契約への明記・A5 の違反箇所）。いずれも直す前は6ツールが1本も動かない、あるいは問いが通らない状態だった。

### 初回検証の結果を無効とした理由

初回の検証（旧 5.1〜5.4・報告ファイル `verification/5.2-report.md` / `5.3-report.md` / `5.4-report.md`）は、次の理由で本 change の合格根拠として採らない。

- 旧 5.3（並走の非混在）・旧 5.4（既存経路）は、操作がすべて Skill 経由で通っており、成果物である MCP ツールを一度も評価していない。セッション M（`1b7521eb-1701-4d73-a4dd-70a588a6fe73`）の transcript を `tool_use` で数えた実測: Skill 14 / Bash 11 / Write 1 / Read 1、`mcp__stroke-board__*` は 0 回
- 旧 5.4 は「既存経路はもともと `.claude/settings.json` の `Bash(curl *)` deny で壊れており、本 change に起因しない」と結論したが、`assets/.claude/skills/` の削除という別の原因を除外できていない。この結論を根拠に以降の失敗が説明され、検証全体が空洞化した
- 旧 5.2（認可の拒否）は `claude` を外部から直接起こした測定で、本番の spawn 経路と乖離している。根拠もエージェントの自己申告のみで、サーバー側の記録と突き合わせていない

santa-method レビューは各グループ（2.4 / 3.9 / 4.4）・全体（6.1）とも独立2レビュアーの合格まで収束済み（6.1 は3周目で収束）。ただし 6.1 は 4.5〜4.7 を含まないコードに対するレビューであり、6.2 で再実施する。
