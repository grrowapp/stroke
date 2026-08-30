# provide-operations-via-mcp Tasks

## 1. モジュール導入

- [x] 1.1 `@nuxtjs/mcp-toolkit` を依存に追加し、lockfile でバージョンを固定する
- [x] 1.2 `nuxt.config.ts` の modules に追加する（route は既定 `/mcp`、`dir` は既定のまま）
- [x] 1.3 Nuxt DevTools の MCP Inspector で `/mcp` が開けることを確認する

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
- [x] 4.8 4.5 / 4.6 / 4.7 の実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する。→ 2名とも不合格。指摘を反映済み: ①値の無い `--allowedTools` でフラグが2本になり「指定を1本に保つ」不変条件を破っていた（次が `-` 始まりなら値だけ差し込む形に修正）②その誤挙動をテストが正としてロックしていた（期待値を修正し、別フラグの値を書き換えないケースも追加）③MCP サーバー名が定数と直書きに割れていた（`MCP_SERVER_NAME` を `mcpServers` のキーに使用）
- [x] 4.9 `nuxt.config.ts` の `--add-dir` から2つ目（`${import.meta.dirname}/assets`）を外す。**4.6 だけでは目的を満たしていなかった。** curl / jq を落としても、`assets/.claude/skills/` の操作系スキル（get-* / question / proposal）が読める限り、取得・提出を真似る余地は残る。スキルのファイルは `64a2cdc`（`chore: live 系統を撤去し、スキルを戻して ADR の番号衝突を解く`）の git 操作で HEAD に復元されており、「worktree 上で削除された状態」という前提は既に成立していない（実測 2026-08-29）
  - 1つ目の `--add-dir`（リポジトリルート）は残す。案内スキル（`/openspec-ff-change`・`/write-steering-v2`・grilling・domain-modeling）と opsx コマンドの置き場であり、役割分担「操作系＝MCP ツール / 案内・instruction＝Skill」のとおり案内側は Skill が担う
  - スキルのファイル自体には触れない（`guidance` の作成に要るので残す）。ロードさせないのは `--add-dir` の側で制御する
  - なお 4.6 の記録「残りは `Skill Bash(openspec *) Read Edit`」は実態と違う。現在は `Skill Bash(openspec *) Read Edit Write` で、`Write` は develop 側の追加（`docs/proposal.md` を書くのに要るという理由）。5.1 の証跡では Write は0回で、提出は `submit-document` 経由の endpoint が書いている

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
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use") | .name' \
  <debugLogDir>/<セッション id>.json | sort | uniq -c | sort -rn
```

`mcp__stroke-board__*` という名前は**ツール列挙にも現れる**ため、素の grep では実呼び出しと区別できない。上の `tool_use` での抽出でしか判定しない。

**失敗は `is_error` で拾う。** JSON の `status` を grep するだけでは、`[500] この接続は steering 工程向けではない。` のようなプレーンテキストの失敗が漏れる（実測 2026-08-28: 見落として「400 は0件」と報告した）。

以前はユーザーレベルの transcript（`~/.claude/projects/`）を漁るしかなかった。`--output-format` が `json` 固定で最終結果1件しか残らなかったためである（`adr0016-sub-update-debug-log-per-session` で解消）。

参考（旧検証セッション M `1b7521eb-…` の実測）: Skill 14 / Bash 11 / Write 1 / Read 1 に対し **`mcp__stroke-board__*` は 0 回**。旧検証が成果物を一度も評価していないことは、この方法で確認済み。

- [ ] 5.1 **取得・提出が MCP ツール経由で行われ、往復が成立すること（本命）**: 操作系のスキル（`assets/.claude/skills/` の get-* / question / proposal）が無く、curl / jq も allowedTools から落ちている状態では、取得・提出を真似る手段が残らない。往復が最後まで進むなら、それは MCP ツールが実際に動いた以外にあり得ない。これをこの change の受け入れ条件とする。案内・手順の Skill（`/openspec-ff-change` 等）が使われることは妨げない。
  - **到達点は proposal の提出**。dev を起動しブラウザ操作でセッションを1本通し、概要の入力 → 問いの往復 → 把握完了 → proposal 提出（`phase` が `proposed`）まで進める。curl・独自スクリプトは使わない
  - 証跡は transcript の `tool_use` 抽出（上記「証跡の取り方」）と副作用（`strokes.json` / `state.json` / `docs/proposal.md`）を突き合わせる。dev サーバーにリクエストログは無いので、そこは根拠にならない
  - **合格条件**: 次の3つを全て満たす
    1. proposal 提出まで到達（`phase` が `proposed`）
    2. 取得・提出が MCP ツール経由のみ（transcript に Skill / Bash による取得・提出が1件も無い）
    3. **提出物が仕事になっている**。問いが概要に沿った設計判断を扱い、proposal が概要と往復の内容を反映している。疎通確認の内容（「テスト」「テスト質問ですか？」等）は不合格
  - **本 change からスキルには一切触れない**（復活させない・作り直さない）
  - → 報告ファイル: `verification/5.1-report.md`
- [ ] 5.2 **MCP ツール6本の正常系**: dev を起動しブラウザからセッションを進め、invoke.ts が発行した有効 token での spawn で `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document`（flontier・steering の両種別）/ `get-steering` の6本すべてが実際に呼ばれ、成功結果（`status` 200/204 と結果スキーマの項目）を返すことを、transcript の `tool_use` 抽出と副作用の両方で確認する（specs `mcp/tools/*`）→ 報告ファイル: `verification/5.2-report.md`
  - **5.1 の完了が前提**。5.1（proposal 提出まで）で `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document`（flontier）が通る
  - 残るのは **steering 工程の2本**（`get-steering` と `submit-document` の steering 種別）。これらは**承認後**の工程で、`yarn check:stroke` は proposal で止まるため通せない。**`adr0016-sub-add-stroke-check-approval-option` の完了を待つ**
  - `get-send-back` の成功（差し戻しがある状態）を見るには、proposal を一度差し戻す必要がある。差し戻し無しの 404 `no_send_back` は正常動作であって成功結果ではない
- [ ] 5.3 並走の非混在: 概要の**異なる**セッション2つを並走させ、**MCP ツール経由で**それぞれ3〜4往復進め、`GET /api/strokes/:id/strokes` の記録が混ざらないことを確認する（specs `server/session-management`）。ブラウザ操作のみで応対する → 報告ファイル: `verification/5.3-report.md`
  - **合格条件**: 5.1 の1〜3に加え、各セッションの問いが**自分の概要の文脈だけ**を扱っていること。疎通確認の内容（「テスト」等）では両セッションの中身が似通い、混在していても気付けないため、この条件は判定の前提になる（飾りではない）
  - 両セッションの `invoke-agent` が同時に `running` である時間帯を作る

### 5章から落とした項目

- **認可の拒否（未発行 token で 401）**: 外部から `claude -p` を起こす検証で、ブラウザ操作では再現できない。
  - token 照合の**成功経路**は 5.1〜5.3 で実機を通る。MCP ツールの呼び出しが1件でも成功していれば、invoke.ts が発行した token が接続表で解決できている
  - **拒否経路**（token 欠落・未発行 token で 401）は実機で見ない。根拠は 2.3 の単体テストだけになる。これは意図した割り切りであり、「単体テストがあるから安心」ではない。実機で見ていないことを承認時に明示する
- **`tools/list` による6ツールの列挙**: MCP プロトコルの直叩きで、ブラウザ操作ではない。以前 `[x]` にした根拠も直叩きだったため取り消す。列挙の妥当性は、5.2 で6本が実際に呼ばれることで担保される

## 6. レビューと承認

**この change の完了は、次の change の完了を前提とする**（ユーザー指示 2026-08-29）。いずれかが未了のうちは 6.3 の承認依頼へ進まない。

| change | 前提とする理由 | 状態（2026-08-29） |
|---|---|---|
| `adr0016-sub-add-stroke-check-approval-option` | 5.2 の steering 2本（`get-steering` / `submit-document` の steering 種別）を通すのに要る。`yarn check:stroke` が proposal で止まる限り承認後の工程へ入れない | 未着手（proposal + specs） |
| `adr0016-sub-define-request-validation-messages` | 送り手に違反箇所が届かないと問いが通らない。`521b273` は A5 のみの先行修正で、change 自体は未完 | 実装 47%（design / tasks は 2026-08-29 に作成） |
| `adr0016-sub-update-debug-log-per-session` | 5章の証跡（`tool_use` の抽出）がこのログ形式に依存する。メイン spec `debug/logging` が `--output-format json` のままなので、archive 前に解消が要る | 実装 78%（design / tasks は 2026-08-29 に作成） |
| `adr0016-sub-fix-busy-response-handling` | 画面が 409 から回復する手段を持たず、踏むと往復が止まる | 未着手 |
| `adr0016-sub-create-steering-guidance-mcp-tool` | steering 工程の案内。`steeringPrompt` が指す `/write-steering-v2` は実体が無く、案内の足場が無い | 起票のみ（2026-08-29。アーティファクト未作成） |
| `adr0016-sub-create-flontier-guidance-mcp-tool` | flontier 工程の案内。3.13 から切り出した。ワークフロースキーマの instruction が古く、エージェントは名前の偶然一致で MCP ツールに当たっている | 起票のみ（2026-08-29。`specs/mcp/tools/guide/` を本 change から移設済み） |

- [x] 6.1 全体を santa-method でレビューし（独立2レビュアー・共有コンテキストなし）、両者合格まで修正する
- [ ] 6.2 4.5〜4.7 の追加後に 6.1 を再実施する（6.1 のレビュー時点のコードにこれらが含まれていないため）
- [ ] 6.3 検証（5章）の結果を添えて approvals（dashboard）で承認を依頼し、approved を確認する。承認までは change の完了・archive に進まない

## 検証中に判明した既存の不具合（本 change が作ったものではない）

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

- `assets/.claude/skills/` は worktree 上で削除された状態にある（未コミット。`assets/.claude` は空）
- `.claude/settings.json` の deny に `Bash(curl *)` が入っている（未コミット）
- ユーザーから「assets の skill は復活させない」と伝えられている（2026-08-27）

**Skill をやめる話ではなく、役割分担の話**（ユーザー発言 2026-08-27）。

- 現状の問題は、Skill が本来踏み込むべきでない領域まで使い倒され、想定されていない使い方をされていること。そこからズレが出る
- **MCP ツールへ寄せる**: 取得・提出などの操作系。permission が絡む文書の書き込みも、寄せたほうが考えることが少ない
- **Skill のまま残す**: openspec の instruction、steering 文書の作り方の案内・手順。これが一番安上がりで、MCP ツールに実装として埋め込んでも労力の割に得られるものは変わらない

本 change からスキルには一切触れない。スキルの今後は本 change の決定事項ではない。

5.1 の測り方（取得・提出が MCP ツール経由で行われることを見る）は、この現状を踏まえたユーザーの選択（2026-08-27）。

## 検証（5章）の結果

**白紙**（ユーザー指示 2026-08-27）。5.1 / 5.2 / 5.3 とも未了で、合格済みの項目は無い。

`verification/` に残っている報告ファイル（`5.1-report.md` / `5.2-report.md` / `5.3-report.md` / `5.4-report.md`）は、いずれも合格の根拠として採らない。5.1 の報告は「MCP ツールだけで往復が成立した」ことを合格としたが、そのとき提出された問いは「テスト」「テスト質問ですか？」で、設計を詰める作業になっていなかった。機構が動いたことと、成果物が仕事をすることは別である。

### 白紙にした後に観測したこと（合格の根拠ではない）

`yarn check:stroke` で流した実行（セッション `744aa80a-…`、2026-08-28）で、5.1 の合格条件3つを満たす結果が出ている。**ユーザーのレビューを経ていないため済みにしない。**

- proposal 提出まで到達（`phase: proposed`、`docs/proposal.md` 44行）
- 取得・提出は MCP ツールのみ。Skill / Bash / Read / Write は0回
- 問いは概要に沿った設計判断を扱っていた（構成方針 / CLI・TUI 関係 / 対象ファイル）。3往復で着地

結果の内訳: `200` 5 / `204` 4 / `400` 1（理由が届いて次で通過）/ `404` 4（差し戻し無しの正常）。

この観測を経て、成果物側の欠陥を3つ直した（`structuredContent`・入力上限の契約への明記・A5 の違反箇所）。いずれも直す前は6ツールが1本も動かない、あるいは問いが通らない状態だった。

### 初回検証の結果を無効とした理由

初回の検証（旧 5.1〜5.4・報告ファイル `verification/5.2-report.md` / `5.3-report.md` / `5.4-report.md`）は、次の理由で本 change の合格根拠として採らない。

- 旧 5.3（並走の非混在）・旧 5.4（既存経路）は、操作がすべて Skill 経由で通っており、成果物である MCP ツールを一度も評価していない。セッション M（`1b7521eb-1701-4d73-a4dd-70a588a6fe73`）の transcript を `tool_use` で数えた実測: Skill 14 / Bash 11 / Write 1 / Read 1、`mcp__stroke-board__*` は 0 回
- 旧 5.4 は「既存経路はもともと `.claude/settings.json` の `Bash(curl *)` deny で壊れており、本 change に起因しない」と結論したが、`assets/.claude/skills/` の削除という別の原因を除外できていない。この結論を根拠に以降の失敗が説明され、検証全体が空洞化した
- 旧 5.2（認可の拒否）は `claude` を外部から直接起こした測定で、本番の spawn 経路と乖離している。根拠もエージェントの自己申告のみで、サーバー側の記録と突き合わせていない

santa-method レビューは各グループ（2.4 / 3.9 / 4.4）・全体（6.1）とも独立2レビュアーの合格まで収束済み（6.1 は3周目で収束）。ただし 6.1 は 4.5〜4.7 を含まないコードに対するレビューであり、6.2 で再実施する。
