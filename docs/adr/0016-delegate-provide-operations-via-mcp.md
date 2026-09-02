# ADR-0016: provide-operations-via-mcp から切り出した change の委譲理由

- **状態**: 採用（一部は docs へ確定済み。**archive にはしない**——下の「確定していないもの」）
- **日付**: 2026-08-29
- **確定した先**:
  - 提供方式・ツールの契約・結果の形・工程ごとの公開・接続 token → [docs/specs/mcp/tools.md](../specs/mcp/tools.md)
  - 起動フラグ・定型・設定の一覧 → [docs/specs/core/settings-reference.md](../specs/core/settings-reference.md)
  - 配線と置き場 → [docs/specs/architecture/session-workflow.md](../specs/architecture/session-workflow.md)
  - 代行を確定した方式とする判断 → [docs/specs/mcp/tools.md](../specs/mcp/tools.md)「提供の形」「代行するもの」（`adr0016-sub-implement-mcp-operations` の結論。暫定・第一段という書きぶりは docs から消えている）
- **確定していないもの**: 2026-09-01 に足した後続4本（`fix-upstream-mcp-allowance` / `fix-direct-write-allowance` / `fix-project-id-lookup` / `add-steering-context-tools`）の委譲理由は、まだ docs に落ちていない。**取りこぼす規約が残るので archive にしない**（CLAUDE.md「更新対応」）

## 決定

`provide-operations-via-mcp` の範囲を**現行操作の代行**（既存 REST への薄いプロキシ）に限り、そこに収まらないものを 14 本の change へ委譲する。委譲は3種に分ける。

- **後続**（この change の完了後に着手する。範囲を意図的に切った先）
  - `adr0016-sub-implement-mcp-operations`
  - `adr0016-sub-switch-workflow-to-mcp-tools`
  - `adr0016-sub-document-mcp-operations`
  - `adr0016-sub-create-flontier-guidance-mcp-tool`
  - `adr0016-sub-create-steering-guidance-mcp-tool`
  - `adr0016-sub-fix-upstream-mcp-allowance`（2026-09-01 追加）
  - `adr0016-sub-fix-direct-write-allowance`（2026-09-01 追加）
  - `adr0016-sub-fix-project-id-lookup`（2026-09-01 追加）
  - `adr0016-sub-add-steering-context-tools`（2026-09-01 追加）
- **前提**（この change の検証・承認がそれ無しには成立しない。tasks 6章に明記）
  - `adr0016-sub-add-stroke-check-approval-option`
  - `adr0016-sub-define-request-validation-messages`
  - `adr0016-sub-update-debug-log-per-session`
  - `adr0016-sub-fix-busy-response-handling`
- **併走**（前提でも後続でもない。この change の作業が明るみに出したが、完了を待つ関係にない）
  - `adr0016-sub-add-timeout-to-config`

前提のいずれかが未了のうちは、`provide-operations-via-mcp` は承認依頼へ進まない。

## 背景

操作系一式（取得・提出）を curl スキルから MCP ツールへ移す作業を進める過程で、2種類の「この change では扱えないもの」が現れた。

1つは**方式を固めるために意図的に切った範囲**である。代行と実処理を同時に作ると、方式の妥当性と実装の妥当性が切り分けられない。文書・案内も同様で、記述対象が確定する前に書くと書き直しになる。

もう1つは**検証の途中で判明した欠陥**である。MCP ツール自体の不具合ではないが、それが直らないと往復が成立せず、この change の合否が測れない。実測（2026-08-28〜29、`yarn check:stroke`）で確認したものだけを前提に挙げている。

## 委譲の内訳

委譲先を **拡張 / バグ / 資料化 / その他** に分ける。各節の見出しは change 名。本文は **問題 / 原因 / 対処 / 親との関係** の4項で揃える。`状態` は ticket の status と tags、`成果物` は change ディレクトリの現況。

### 拡張

ticket の tags が enhancement のもの。新しい口・選べる幅を増やす（8件）。

#### adr0016-sub-implement-mcp-operations

- **状態**: ready-for-agent / enhancement
- **成果物**: proposal のみ（design・tasks 未作成）
- **触るファイル**:
  - MCP ツールのハンドラ実装一式
  - `server/utils/` — 実処理の呼び出し先として共有化する範囲
  - `server/` — transport を Nitro へ載せ替える場合のみ
  - 起動配線の `--mcp-config` — 同上

**対応内容** — MCP ツールのハンドラを、endpoint への HTTP 発行（代行）からサーバー内部の実装の直接呼び出しへ置き換える。自プロセスから自サーバーへの HTTP 往復を外す。ツールの契約（名前・引数・応答）は変えない。あわせて transport を stdio から Nitro（Streamable HTTP）へ載せ替えるかを判断し、採る場合は実施する。

置き換えの対象は6本。いまの代行先は次のとおりで、これを直接呼び出しへ替える。

| ツール | 実装 | いまの代行先 |
| --- | --- | --- |
| `get-overview` | `server/mcp/tools/get-overview.ts` | `GET /api/strokes/:id/overview` |
| `get-strokes` | `server/mcp/tools/get-strokes.ts` | `GET /api/strokes/:id/strokes` |
| `get-send-back` | `server/mcp/tools/get-send-back.ts` | `GET /api/strokes/:id/send-back` |
| `send-question` | `server/mcp/tools/send-question.ts` | `POST /api/strokes/:id/question` |
| `submit-document` | `server/mcp/tools/submit-document.ts` | `type: proposal` は `POST /api/strokes/:id/proposal`、`type: steering` は本家の `/api/projects/:projectId/steering/:name` |
| `get-steering` | `server/mcp/tools/get-steering.ts` | 本家の `GET /api/projects/:projectId/steering/:name` と `/api/projects/:projectId/info` |

**本家を叩く2本は代行の外し方が違う。** `get-steering` と `submit-document` の steering 種別は、自サーバーではなく本家 spec-workflow へ `upstreamClient` / `upstreamFetch` を通じて出している。この2本の HTTP は外せない。実処理化の対象は、自プロセスから自サーバーへ向かう4本と、`submit-document` の proposal 経路である。

**完了判定** — 次をすべて満たしたとき完了とする。

- ツール6本が実処理で動き、代行時と同じ引数・応答で往復が成立する
- 自プロセスから自サーバーへの HTTP 発行が残っていない
- 既存の呼び出し側（ワークフロー・エージェント）に変更を要さない
- transport を載せ替えるか据え置くかの判断が、根拠とともに記録されている

**親との関係** — 後続。親 change の完了を待つ。ハンドラは親 change で transport 非依存に分離済みなので、載せ替えの判断も独立して行える。capability は契約を維持したまま「代行先の規定」が「実処理の規定」に変わる範囲を specs 段で精査する。`adr0016-sub-switch-workflow-to-mcp-tools` により入口が MCP ツールへ一本化されていることが望ましい。

#### adr0016-sub-switch-workflow-to-mcp-tools

- **状態**: ready-for-agent / enhancement
- **成果物**: proposal のみ（design・tasks 未作成）
- **触るファイル**:
  - `~/.local/share/openspec/schemas/flontier-strokeflow/` — 配置されるワークフロースキーマの実体。リポジトリ外にあり、配置手順は README

**対応内容** — ワークフロースキーマ `flontier-strokeflow` の instruction を、スキル呼び出しから MCP ツールの利用指示へ書き換える。名前の一致に依存しない形にする。

instruction は `/get-overview` `/get-strokes` `/get-send-back` というスラッシュコマンド形式で書かれているが、**指す実体はもう無い**。操作系スキルは `--add-dir` から外してありロードされず、その後**撤去した**（`adr0016-sub-switch-workflow-to-mcp-tools`）。それでも往復が成立しているのは、**MCP ツール名がスキル名とたまたま一致しているため**である。実測 2026-08-29（セッション `d823166d-…`）では往復6回・proposal 提出・差し戻しからの出し直しまで通っており、現時点で実害は出ていない。ただしこれは偶然に依存しており、ツール名を変えた瞬間に壊れる。

**元の proposal から2項目を落とした**（2026-08-29 時点）。`--allowedTools` から取得系の許可を外す件は親 change の tasks 4.5 / 4.6 で**実施済み**（現在の値は `Skill Bash(openspec *) Read Edit Write` で、MCP 分は `server/utils/mcp/allowed-tools.ts` の `withMcpToolsAllowed` が `mcp__stroke-board` を追記する）。旧スキル一式の撤去は**不要**になった（ユーザー 2026-08-29「スキルを残したのは基本的には guidance の作成のため」。ロードさせない制御は `--add-dir` 側で行っている）。残るのは instruction の書き換えだけである。

**完了判定** — 次をすべて満たしたとき完了とする。

- instruction が MCP ツールの利用指示になっており、スラッシュコマンド形式の記述が残っていない
- ツール名とスキル名の一致に依存しない
- 書き換えた instruction で、往復・proposal 提出・差し戻しからの出し直しが通る

**親との関係** — 後続。親 change の完了（MCP ツールが提供済みであること）を待つ。`adr0016-sub-create-flontier-guidance-mcp-tool` と担当範囲が重なるため、**instruction が手順を持つのか、ツール（`get-guide`）が持つのかを先に決める**。案内の手順そのものをツールが返すなら、instruction 側は「まずそのツールを呼べ」と述べるだけで足りる可能性がある。設定値の記述を伴う場合は ADR-0004 の手続きに従い、`settings-reference.md` は `adr0016-sub-document-mcp-operations` も触るため順序の調整が要る。

#### adr0016-sub-create-flontier-guidance-mcp-tool

- **状態**: ready-for-agent / enhancement
- **成果物**: specs のみ（proposal・design・tasks 未作成）
- **対になる change**: `adr0016-sub-create-steering-guidance-mcp-tool`

**対応内容** — flontier 工程の手順をエージェントへ渡すツール `get-guide` を設ける。引数を取らず、`status` と `guide`（手順の本文）を返す。本文はセッションの状態に依存しない（状態は既存の取得ツールが返す）。説明（description）は、他のツールより先に呼ぶべきことを述べる。

いま案内の実体は存在しない。ワークフロースキーマ `flontier-strokeflow` の instruction は `/get-overview` `/get-strokes` `/get-send-back` というスラッシュコマンド形式で**指す実体が無く**、エージェントは名前の一致で偶然 MCP ツールに当たっている。`assets/.claude/skills/guidance/SKILL.md` は旧スキル方式（`STROKE_BASEURL` と `CLAUDE_SESSION_ID` での解決）で MCP に対応せず、`--add-dir` から外したのでロードされなくなり、その後**撤去した**（`adr0016-sub-switch-workflow-to-mcp-tools`）。案内は MCP ツール（`get-guide` / `get-steering-guide`）が配る。

**完了判定** — 次をすべて満たしたとき完了とする。

- `get-guide` が引数なしで呼べ、`status` と `guide` を返す
- 手順の本文に5点が含まれる — 状態の確認から提出までの順序／問いを立てる単位と各項目の上限／把握完了の判定／proposal を提出する条件と形式／差し戻しを受けたときの進め方
- エージェントが他の取得ツールより先に `get-guide` を呼ぶ
- 差し戻しを受けたあと、エージェントが proposal の見本をリポジトリ内へ探しに行かない（実測 2026-08-29 のセッション `167cb9d2-…` / `d823166d-…` で観測した挙動が再現しない）

**往復の回数は完了判定に使わない。** 同日の実測で、往復数は道具側の答え方に依存すると分かった（選択肢から選ぶと1〜2往復、自由記述だと6往復）。

**親との関係** — 後続。親 change の tasks 3.13 から切り出した。親は代行ツール6本の提供に留める。案内は取得・提出とは別の関心事で、工程ごとに内容が変わるため分けた。出典の訂正: tasks 3.13 と proposal は「ユーザー指示 2026-08-27」と記録していたが、実際はエージェントの提案だった（ユーザー指摘 2026-08-29）。

#### adr0016-sub-create-steering-guidance-mcp-tool

- **状態**: ready-for-agent / enhancement
- **成果物**: `.openspec.yaml` のみ（proposal 以降すべて未作成）
- **対になる change**: `adr0016-sub-create-flontier-guidance-mcp-tool`

**対応内容** — steering 工程の手順をエージェントへ渡すツールを設ける。引数を取らず手順の本文を返す（flontier 側と同じ形）。説明は、他のツールより先に呼ぶべきことを述べる。

`steeringPrompt` が指す `write-steering-v2` は**どこにも存在しない**（`.claude/skills/` にも `assets/.claude/skills/` にも無い）。同じ形の欠落は `firstPrompt` でも起きており、`/openspec-ff-change` が `Unknown command` となって初回起動が assistant のターンを1つも持たずに終わっていた（実測 2026-08-27）。親 change の tasks 4.7 で `firstPrompt` からは起動を外したが、`steeringPrompt` は「変更なし」として残してある。

**完了判定** — 次をすべて満たしたとき完了とする。

- 引数なしで呼べ、手順の本文を返す
- 手順の本文に4点が含まれる — steering 文書3種（product / tech / structure）の作り方／取得と提出の順序／文書が無いときの進め方／承認との関係
- `steeringPrompt` が実体の無いスキルを指していない
- steering 工程で `get-steering` と `submit-document`（`type: steering`）の成功経路が通る

**親との関係** — 後続。flontier 側と対にして、両工程で案内の届け方を揃える。

#### adr0016-sub-add-stroke-check-approval-option

- **状態**: ready-for-agent / enhancement
- **成果物**: proposal + specs（design・tasks 未作成）
- **触るファイル**:
  - `scripts/stroke-check.ts`
  - アプリのコードには影響しない（道具の側だけで完結する）

**対応内容** — `yarn check:stroke` に、承認まで進めるかどうかのオプションを足す。既定は proposal で止める（承認はプロジェクトを生成する不可逆な操作であり、既定で走らせない）。承認まで進めた場合は steering 工程の往復も同じ枠組みで追い、着地の判定に含める。検証で作ったセッションを最後に片付けるかどうかも選べるようにする。

現状は proposal に着地したらそこで終え、承認（「承認して作る」）を押さない。そのため steering 工程に入らず、`get-steering` と `submit-document`（`type: steering`）は**一度も成功していない**（2026-08-28 時点）。あわせて、検証で作ったセッションが `projectShareRoot` に残り続ける。

**完了判定** — 次をすべて満たしたとき完了とする。

- オプションで承認まで進められ、既定では proposal で止まる
- 承認まで進めた実行で steering 工程の往復が追え、着地の判定に含まれる
- 片付けのオプションで、検証で作ったセッションが残らない
- 操作がブラウザのみで完結する。サーバーを直接叩かない（実測 2026-08-28、`fetch` で起動を回復させたところ画面側の失敗状態が残り、着地しているのに画面が遷移しなくなった）

**注意** — 承認するとセッションディレクトリがプロジェクト名へ改名される。片付けの対象が uuid から名前へ変わる。

**親との関係** — 前提。親 change の検証 5.2、steering 側2本を通すのに要る。これが未了のうちは親は承認依頼へ進まない。

#### adr0016-sub-define-request-validation-messages

- **状態**: ready-for-agent / enhancement
- **成果物**: proposal + specs + design + tasks（**16/30**）
- **触るファイル**:
  - `server/utils/stroke/request-schemas.ts`
  - `server/utils/stroke/question.ts`
  - `server/api/strokes/**`
  - `server/api/projects/**`

**対応内容** — 送り手が値を組み立てて送るすべての受け口で、入力を検証の定義に通す。定義を経ずに受ける経路を無くす。検証の各制約に、その制約ごとのメッセージを定義し、既定文に委ねない。違反が複数あるときはすべてを返す。長さ・件数の制約に反した場合は現在値を添える。検証の中身（何を許すか）は変えず、伝え方だけを変える。

実測 2026-08-28、A5（`POST /api/strokes/:id/question`）が返していたのは「問いの構造として読み取れない。」の1文だけだった。エージェントの `send-question` は13回中5回が 400 で、原因はすべて `options[].description` が **51 文字**（上限50）の **1 文字**超過。何を削れば通るか分からず、内容を捨てた極端に短い問いを投げて通し方を探る挙動になった。

**完了判定** — 次をすべて満たしたとき完了とする。

- 送り手が組み立てて送る受け口に、検証の定義を経ない経路が残っていない
- 制約ごとのメッセージが定義され、既定文が送り手へ届かない
- 違反が複数あるとき、1回の応答ですべてが返る
- 長さ・件数の違反に現在値が添えられ、あと幾つ削ればよいかが読み取れる
- 上記の 51 文字超過と同じ状況で、エージェントが何を直せばよいかを応答から判断できる

**親との関係** — 前提。違反箇所が届かないと問いが通らず、親 change の往復が成立しない。ADR-0014 との関係として、検証の正は受け口に置いたままにし、MCP ツール側に事前検証を足すことはしない。ツール側の契約は説明（`.describe()`）で上限を伝えるに留める。

#### adr0016-sub-update-debug-log-per-session

- **状態**: ready-for-agent / maintenance
- **成果物**: proposal + specs + design + tasks（**18/22**）
- **触るファイル**:
  - `server/utils/stroke/claude.ts` — `writeDebugLog` / `debugLogStamp`
  - `test/server/utils/stroke/claude.test.ts` — ファイル数と名前を見ている

**対応内容** — デバッグログをセッションごとに1ファイルにし、呼び出しのたびに追記する。ファイル名からセッションを特定でき、1つ開けばそのセッションの全呼び出しを時系列で読める形にする。`claude-debug-logging` の Requirement「ログは呼び出しごとに1ファイルで、上書きされない」を、記録を失わないという意図はそのままに、単位をセッションへ改める。

現状は呼び出しごとに1ファイルで、実測 2026-08-28 では3往復のセッション1本が4ファイルに分かれた。時系列に読むにはファイル名の時刻で並べ直す手間がかかり、並走したセッションのファイルも同じディレクトリに混ざる。同じ調査で `--output-format` が `json` 固定だった点も判明した（`json` は最終結果1件しか出さず、ツールの呼び出しと結果がどこにも残らない）。

**完了判定** — 次をすべて満たしたとき完了とする。

- 1つのセッションのログが1ファイルに収まり、ファイル名からセッションを特定できる
- 呼び出しのたびに追記され、前の呼び出しの記録が失われない
- 呼び出しの区切りがファイルから読み取れる
- 並走したセッションのログが混ざらない
- メイン spec `openspec/specs/debug/logging/spec.md` の Requirement「中身は claude が `--output-format json` で stdout へ出した全文と一致する」が、この change の delta で MODIFY されている（現状は未 MODIFY で、このまま archive するとメイン spec に実装と矛盾した記述が残る）

**親との関係** — 前提。親 change の5章の証跡（`tool_use` の抽出）がこのログ形式に依存する。なお archive を阻む問題が別にある。メイン spec `openspec/specs/debug/logging/spec.md` の Requirement が「中身は claude が `--output-format json` で stdout へ出した全文と一致する」のままで、この change の delta がその Requirement を MODIFY していない。このまま archive するとメイン spec に実装と矛盾した記述が残る。

#### adr0016-sub-add-timeout-to-config

- **状態**: ready-for-agent / enhancement
- **成果物**: proposal / specs / design / tasks（2026-08-30 に実装まで完了。ui は画面を持たないため省略）
- **触るファイル**:
  - `server/utils/stroke/claude.ts` — `CLAUDE_TIMEOUT_MS` の廃止と、渡された値での打ち切り
  - `server/utils/stroke/ai.ts` — リトライ回数から今回の長さを決めて渡す
  - `nuxt.config.ts` — `runtimeConfig.claude` へ2件追加
  - `docs/specs/core/settings-reference.md` — 式の改訂・表からの削除・新設定の記述

**対応内容** — 設定を2件増やす。`claude.timeoutMs`（打ち切るまでの時間。`retries` が 0 のときの値）と `claude.timeoutStepMs`（同じターンでリトライを重ねる間、`retries` 1つにつき足す刻み）である。前者は `claude.ts` のハードコード定数を `runtimeConfig` へ昇格させて `maxRetries` と同じ場所に揃えるもの、後者は新規。

```
今回のタイムアウト = timeoutMs + timeoutStepMs × retries
```

**伸びるのは1つのターンの中だけである。** `retries` は `state.json` が持つ「そのターンでこれまでに起こし直した回数」で、`maxRetries` の上限に達すればそこで終わる。次のターンでは `retries` が 0 に戻り、タイムアウトも `timeoutMs` へ巻き戻る。上限に達して `error` で終わったターンの後でも同じで、ターンをまたいで積み上がらない。`timeoutStepMs` に `0` を入れれば現在と同じ固定の振る舞いになる。

いまタイムアウトは `claude.ts:21` のハードコード定数で、同じ式（`総待ち時間 = (maxRetries + 1) × タイムアウト`）を作る `maxRetries` は `runtimeConfig` にある。**同じ式の因子が別の手続きに属しており**、片方は ADR-0004 の承認が要るのに、片方は定数を書き換えるだけで変えられる。

さらに `settings-reference.md` が同じ資料の中で二枚舌になっている。タイムアウトを「設定ではないもの」の表（`:149`）に載せながら、設定の説明にその値を使っている（`:86`「既定の `2` では最大30分」）。

**完了判定** — 次をすべて満たしたとき完了とする。

- タイムアウトが `runtimeConfig.claude` から決まり、`CLAUDE_TIMEOUT_MS` の定数が無い
- 同じターンでリトライを重ねる間だけタイムアウトが伸び、その刻みが設定から決まる
- 次のターンでタイムアウトが `timeoutMs` へ巻き戻る（`error` で終わったターンの後も同じ）
- `settings-reference.md` の総待ち時間の式が刻みを含む形になっている
- 同資料の「設定ではないもの」の表からタイムアウトの行が落ちている
- 上記の資料変更が ADR-0004 の手続き（change 起票 → ユーザー承認 → 資料編集 → コード追随）を経ている

**親との関係** — 拡張。親 change の完了を待たない。ただし値の調整履歴は親 change の検証が作った。180 秒では初回が必ず時間切れになり10分へ延ばし（実測 2026-08-25、当時は claude がスキルをロードし `!` フェンスで curl を往復させていた）、操作が MCP ツールへ移って所要が減ったので3分へ戻した（実測 2026-08-28: 8回の呼び出しで 28.5〜64.7 秒）。**代行への移行が所要を変えたことが、この値を設定に出すべき理由を作っている。**

なお現在の2つの記述（`claude.ts` の「設定ではない」、`settings-reference.md:86`）は `ccfb65b` / `494c156` の feat / chore コミットで入っており、ADR-0004 の手続きを経ていない。この change で手続きに載せ直す。

### バグ

ticket の tags が bug のもの。あるべき振る舞いに戻す（5件）。

#### adr0016-sub-fix-busy-response-handling

- **状態**: needs-triage / bug
- **成果物**: proposal + specs（design・tasks 未作成）
- **触るファイル**:
  - `app/pages/strokes/[sessionId]/index.vue:118-125` — **発生源**。`catch` が理由を見ずに一律「AI を起動できませんでした。」を出し、409 とそれ以外を区別しない。`waitingRetry.startWaiting()` も `try` の中にしかなく、409 のとき待機状態に入らない
  - `app/composables/useAgentQuestion.ts:117-128` — 409 を区別する分岐は持つが、`startWaiting()` は成功時しか呼ばれない
  - `app/composables/useProposalReview.ts:306-317` — 上と同じ形。同じ扱いが3箇所に散っている
  - API・サーバー・依存の変更なし

**問題** — 回答したあと画面が「AI を起動できませんでした。」で止まり、同じ問いにもう一度答えるまで先へ進めない（ブラウザで一から通した結果、毎回発生）。ユーザーが問いに答えると U7 は受理されるが、画面が続けて呼ぶ U13 が 409 busy を返す。走っていた claude が終了すると `invocation` は `idle` に戻るのに `currentQuestion` は残ったままで、誰も AI を起こし直さない。結果 `strokes.json` に回答が重複記録される（「実行環境」×3・「完了指定」×2・「保存場所」×2）。

**原因** — 409 を返す側は契約どおりである（`docs/specs/api/contract.md:29-30` AI の起動は U13 が唯一の入口で受理系は AI を起動しない、`:111` U7 は実行中でも受理し busy を見ない、`:180` U13 が 409 busy で多重起動を止める）。欠陥は画面側にあり、409 を失敗として扱って回復手順を持たないことにある。

**対処** — 前の応答をまだ待っていることが分かったとき、画面はそれを失敗として示さず待機として示す。待機に入る扱いを、起動を要求できた場合とまだ待っている場合の両方で通す（今は前者だけ）。散っている3箇所を1つに揃える。409 を返す側は正しいので触らない。

**親との関係** — 前提。画面が 409 から回復できないと往復が止まり、親 change の検証が完走しない。

#### adr0016-sub-fix-upstream-mcp-allowance

- **状態**: needs-triage / bug
- **成果物**: proposal のみ（specs・design・tasks 未作成）
- **触るファイル**:
  - `server/utils/mcp/allowed-tools.ts` — `mcp__specworkflow` を許可へ足している箇所
  - `server/mcp/tools/get-steering-guide.ts` / `get-guide.ts` — 「呼ぶな」と述べている節
  - `docs/specs/mcp/tools.md` — 整合反映（ADR-0004 の手続き）

**問題** — 本家 MCP のツールは `--allowedTools` に載っていて呼べるのに、案内は「この工程では1つも呼ばない」「`approvals` も呼ぶな」と書いている。守っているのは案内の散文だけである。

**原因** — 許可へ足した理由は「配るだけでは一覧に出るのに1つも呼べず、『呼べないものを見せてから失敗させない』を破る」（親 change 6.2 の4周目）。一方、本家 MCP を起こす目的は起動時の登録簿への自己登録だけで、ツール呼び出しは1つも要らない。stdio の本家 MCP には `x-mcp-tools` のような絞りが無いので、「構造で塞ぐ」と「見せてから失敗させない」は両立しない。

**対処** — どちらへ倒すかを design で決め、選んだ側を `docs/specs/mcp/tools.md` の「操作の入口はこれだけである」と整合させる。

**親との関係** — 後続。親 change の santa-method レビュー 9周目（2026-08-31）が見つけた。当初は範囲外として記録したが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）。案内2本の change（`create-flontier-guidance-mcp-tool` / `create-steering-guidance-mcp-tool`）が確定させた文言に掛かるので、それらの完了後に着手する。

#### adr0016-sub-fix-direct-write-allowance

- **状態**: needs-triage / bug
- **成果物**: proposal のみ（specs・design・tasks 未作成）
- **触るファイル**:
  - `nuxt.config.ts` — `allowedTools` の値と、事実と違うコメント
  - `docs/specs/core/settings-reference.md` — 起動フラグの記述（ADR-0004 の手続き）

**問題** — `--allowedTools` の `Write` / `Edit` が、MCP ツールを通さず文書を直接書く経路を残している。`docs/specs/mcp/tools.md` の「操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない」を迂回できる。

**原因** — 要否を確かめずに残っている。`nuxt.config.ts` のコメントは「`Write` は proposal を `docs/proposal.md` に書くのに要る」と説明するが、proposal を書くのは受理した A7 である。**ただし `Write` が入った実際の理由は別で**、コミット `1ce89cfc`（2026-08-26）が示すとおりワークフロー定義の `generates`（`stroke.md` / `proposal.md`）の新規作成である。その要求は schema.yaml にいまも残っている。

**起票時に「直近3実行のいずれも `Write` / `Edit` を1度も使っていない」と書いたが、取り下げた**（2026-09-01）。根拠にしたデバッグログは削除済みで再現できず、逆に `Write` で書かれた下書きの実物が2本残っている（`/opt/projects/5d34fd6b-…/proposal.md` ほか、2026-08-30）。ただし `get-guide` 導入前の実行なので現構成の証拠にはならない。

**対処** — `claude.debugLogDir` を一時設定して1周させ、道具ごとの使用回数を実測する。要らないなら許可から外して1周通ることを確認し、要るなら何に要るかを根拠付きでコメントに書き直す。**手順が求める書き出しを残したまま道具だけを外さない**（schema.yaml は `adr0016-sub-switch-workflow-to-mcp-tools` の担当）。

**親との関係** — 後続。親 change の santa-method レビュー 9周目（2026-08-31）が見つけた。当初は範囲外として記録したが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）。

#### adr0016-sub-fix-project-id-lookup

- **状態**: needs-triage / bug
- **成果物**: proposal のみ（specs・design・tasks 未作成）
- **触るファイル**:
  - `server/utils/mcp/resolve-project-id.ts` — 照合の仕方
  - `docs/specs/reference/upstream-observations.md` — 本家の正規化についての事実を記録
  - `docs/specs/mcp/tools.md` — `errorCode` を足す場合の整合反映（ADR-0004 の手続き）

**問題** — projectId の引き当てが、本家がパスをどう正規化するかに暗黙で依存している。`projectShareRoot` が git リポジトリの内側へ動いた瞬間、steering 工程が静かに壊れる。失敗は `project_not_registered` として出るので、登録はあるのに「登録されていない」と読める。

**原因** — `resolve-project-id.ts` は接続表の `projectPath` と本家の一覧の `projectPath` を `resolve()` で突き合わせるが、**本家は渡されたパスを `git rev-parse --show-toplevel` で解決してから登録する**（本家 2.2.5 の `core/git-utils.js`。親 change の santa-method レビュー 8周目にレビュアーB が読んで確認）。いまは `projectShareRoot` が `/opt/projects` で git リポジトリではないため一致している（実測 2026-08-31、`setai-3` が引き当てられた）。登録簿には既に食い違う形の例が在る（`agent-messanger` は `projectPath` と `workflowRootPath` が違う）。

**対処** — `projectPath` の一致だけに頼らず、**一致または祖先（最深優先）**で照合する。引き当てられなかったときに「登録されていない」と「登録はあるが照合が外れた」を区別できるようにする（`errorCode` は増やさず `error` の本文で区別する。表は「これ以外を足してはならない」で閉じている）。

**起票時に書いた「本家が持つ別の手掛かり（`workflowRootPath` など）も見る」は取り下げた**（2026-09-01）。`GET /api/projects/list` は `workflowRootPath` を返さず、登録簿を直読みしても `SPEC_WORKFLOW_SHARED_ROOT` / `resolveGitRoot` で決まる値なので起動 cwd との一致も祖先関係も保証されない。**`agent-messanger` の食い違いの機序も git ではなかった**——当該ディレクトリに `.git` は無く、同ディレクトリの `.mcp.json` が `SPEC_WORKFLOW_SHARED_ROOT` を渡している（`git-utils.js` が env を最優先で返す）。食い違う登録が在るという事実は正しいが、原因の説明は誤りだった。

**親との関係** — 後続。親 change の santa-method レビュー 8・9周目（2026-08-31）が見つけた。当初は範囲外として記録したが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）。

#### adr0016-sub-add-steering-context-tools

- **状態**: Propose / bug
- **成果物**: proposal のみ（specs・design・tasks 未作成）
- **触るファイル**:
  - `server/utils/mcp/exposed-tools.ts` — steering の公開一覧
  - `server/mcp/tools/` — 公開するツール（既存の再利用か新設かは design）
  - `nuxt.config.ts` — `--allowedTools` の `Read` / `Bash(openspec *)`
  - `server/mcp/tools/get-steering-guide.ts` — 案内の文言
  - `docs/specs/api/mcp-tools.md` / `docs/specs/core/settings-reference.md` — 整合反映

**問題** — steering 工程に文脈を取る MCP ツールが1本も無く、claude が毎回ファイルを直接読んでいる。`docs/specs/api/mcp-tools.md` の「操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない」と、`get-steering-guide` の「ファイルを直接読み書きしない」の両方が守られていない。

**原因** — 公開しているのが `get-steering-guide` / `get-steering` / `submit-document` の3本だけである。実測 2026-09-01（`yarn check:stroke --approve` を2周、`debugLogDir` を一時設定して計測）では、steering の実行が2周とも `Read` 5回・`Bash` 1〜2回で `overview.txt` / `docs/proposal.md` / `state.json` / `strokes.json` / `openspec/config.yaml` を直接読み、`.spec-workflow` と `openspec` を `find` していた。**flontier 側は `Read` も `Bash` も0回**で、差は道具の有無そのものにある。

**対処** — 文脈を取るツールを steering に用意し、その後で `Read` を外す。`Read` を先に外すと工程が成立しない（実測のとおり文脈は全部ファイルから取っている）。

**親との関係** — 後続。`adr0016-sub-fix-direct-write-allowance` が `Write` / `Edit` を外して書き込み側を構造で閉じた結果、**読み取り側だけが開いたまま残っている**ことが実機検証で分かった（2026-09-01）。同 change の対の位置にある。

### 資料化

ticket の tags が document のもの。実装を文書へ写す（1件）。

#### adr0016-sub-document-mcp-operations

- **状態**: ready-for-agent / document
- **成果物**: proposal のみ
- **触るファイル**:
  - `docs/specs/` — 新規資料
  - `docs/specs/core/settings-reference.md`
  - `docs/adr/`

**対応内容** — MCP 操作系の定義資料を `docs/specs/` に起こす（ツール一覧・各ツールの契約・配線。ファイル構成は design / tasks で確定）。起動定義に増えた設定を `docs/specs/core/settings-reference.md` へ追記する（ADR-0004 の手続きに従う）。「操作系は endpoint 代行の MCP ツールで提供し、ファイル直読み・直書きを採らない」という決定を `docs/adr/` に記録する。

あわせて既存記述の誤り2件を直す（実装との突き合わせで判明、2026-08-29）。`settings-reference.md:90` の `claude.debugLogDir` の説明が「`--output-format json` の stdout 全文」のままで、実装は stream-json に変わっている（コミット e4fc81f）。同ファイルが write-steering-v2 を「このリポジトリの `.claude/skills/` に在り」と書いているが実体が無い。

ドキュメントのみで挙動は変わらないため `skip_specs: true`。アプリのコード・既存 spec への影響は無い。

## 根拠

- 代行と実処理を段で分けると、方式の妥当性を先に確定できる。契約を変えないため、次段は内部の置き換えだけで済む
- 文書と案内を分けることで、設計が動いている間の書き直しを避けられる
- 前提はいずれも MCP ツールの不具合ではない。この change の delta に混ぜると、何が原因で往復が止まったのかが記録から読めなくなる
- 前提はすべて実測を伴う。推測で挙げたものは含めない

## 影響

- `provide-operations-via-mcp` は実装（1〜4章）とレビュー（6.1）を終えているが、検証（5章）と承認は前提の完了を待つ
- 委譲先はいずれも個別に ticket を持つ。親 ticket への集約はしない。着手条件と担当範囲が独立しており、集約すると「どれが着手可能か」が読めなくなるため
- `adr0016-sub-create-flontier-guidance-mcp-tool` の出典は訂正済み。tasks 3.13 と proposal は「ユーザー指示 2026-08-27」と記録していたが、実際はエージェントの提案だった（ユーザー指摘 2026-08-29）
- 検証の再現条件が2つある。`projectShareRoot`（`/opt/projects`）は worktree 間で共有されるため、複数の dev を同時に動かすと巡回が相手のセッションを再キックする。検証時は一方だけを動かす。また往復の回数は検証ツール側の答え方に依存し、選択肢から選ぶと1〜2往復、自由記述だと6往復になる（実測 2026-08-29）。合否を測るときは答え方を明示する
