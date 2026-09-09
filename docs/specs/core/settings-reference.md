# 設定リファレンス

**この資料が設定の正である**（[ADR 0004](../../adr/0004-settings-reference-is-authoritative.md)）。**ここに無いものは設定ではない。** コードが読んでいる値がここに載っていなければ、それは実装の誤りであって、資料の書き漏れではない。

設定を足す・消す・既定値を変えるには、change を起こしてユーザーの承認を得る。

## 設定の置き場は2つだけ

| 置き場 | 何が入るか | 読み方 |
|---|---|---|
| `nuxt.config.ts` の `runtimeConfig` | サーバーが使う値 | endpoint は `useRuntimeConfig()`、CLI は `nuxt.config.ts` を import |
| `app/app.config.ts` | 画面の見た目 | `useAppConfig()` |

**環境変数から設定を読まない。** `.env` はストローク側の設定の経路ではない。値は `nuxt.config.ts` と `app/app.config.ts` に書かれたものだけである。

**値の実体をこの2つ以外のソースファイルに置かない。** 既定値を並べた別モジュール（かつて存在した `server/utils/stroke/settings.ts`）は作らない。同じ値が2箇所に現れ、どちらが正かを資料と突き合わせられなくなるためである。

**設定を引くのは端だけである。** endpoint と CLI が値を解決し、共有のモジュール（`session-core.ts`・`paths.ts`・`claude.ts` など）は**引数で受け取る**。共有モジュールが自分で設定を引くと、endpoint と CLI で引く経路が割れる。

CLI（`yarn session`、Nitro の外）が `useRuntimeConfig()` を使えないことは、値の置き場を分ける理由にならない。`nuxt.config.ts` は `tsx` から普通に import できる（実測確認済み）。環境変数を読まないので、endpoint と CLI は同じ値になる。

```ts
import config from '../nuxt.config'

const { projectShareRoot, claude } = config.runtimeConfig
```

## `nuxt.config.ts` — `runtimeConfig`

サーバー専用。

| キー | 既定値 |
|---|---|
| `projectShareRoot` | `/opt/projects` |
| `claude.workflowSchema` | `flontier-strokeflow` |
| `claude.firstPrompt` | `get-guide` を読ませる1文 |
| `claude.continuePrompt` | `get-guide` を読み直させ、続きを促す1文 |
| `claude.steeringPrompt` | `get-steering-guide` を読ませる1文 |
| `claude.maxRetries` | `2` |
| `claude.timeoutMs` | `180000` |
| `claude.timeoutStepMs` | `0` |
| `claude.debugLogDir` | （空 = 無効） |
| `openspec.bin` | `openspec` |
| `openspec.initArgs` | `init --tools none` |
| `wsPathPattern` | `/api/strokes/([^/]+)/ws/{channel}(?:$\|[/?#])` |

### `projectShareRoot`

セッションと、承認で昇格したプロジェクトの**共通の親**。ポータルとストロークが共有する1つの場所である。

- ストローク: 承認はこの下でのディレクトリ改名だけで昇格を行うため、両者が同じ親に居ることが前提になる（`openspec/specs/project/generation`）
- ポータル: 一覧はここの直下1階層を走査し、`.spec-workflow/` を持つものを拾う

昇格したプロジェクトが一覧に現れるのは、両者がこの**1つの値**を見ているからである。設定を2つに分けると、食い違ったときに承認したプロジェクトが一覧から消える。分けてはならない。

```
/opt/projects/                    ← projectShareRoot
├── 3f2a…-uuid/                   セッション（昇格前。.spec-workflow を持たないので一覧に出ない）
│   ├── state.json
│   ├── overview.txt
│   ├── strokes.json
│   └── docs/proposal.md          AI が書く
├── my-new-project/               昇格後（改名しただけで中身は同一）
│   ├── docs/proposal.md
│   └── .spec-workflow/           本家が作る。ここで一覧に現れる
└── .spec-workflow-mcp/           本家のグローバル状態
```

### 接続先は設定ではない — 実際の待ち受けから作る

エージェントへ渡す接続先（`--mcp-config` の url）は**設定に無い**。サーバーが実際に bind したアドレスから、起動のたびに組み立てる（`server/utils/stroke/listen-address.ts`）。

**かつては `claude.apiBaseUrl` という設定だった。外した。** 理由は、その値が待ち受けを決めていなかったからである。待ち受けを決めるのは `nuxt.config.ts` の `devServer.port` と、起動コマンドの `--port` である。`claude.apiBaseUrl` はそれを書き写しただけの値で、一致する保証が無く、ずれても誰も検知しなかった。

**実測 2026-09-01**: `package.json` が `nuxt dev --port 3100` を持つようになった結果、サーバーは 3100 で待ち受け、設定は 3599 を指し、3599 は `ECONNREFUSED` を返した。起動した claude は MCP ツールへ1本も繋げなかった。

以後、ポートをどこで変えても接続先は追随する。**揃えるべき2箇所は無くなった。**

### `claude.firstPrompt` ・ `claude.continuePrompt` ・ `claude.steeringPrompt`

AI へ渡す定型。**手順の本文をここに書かない。** 手順は MCP の案内ツール（flontier は `get-guide`、steering は `get-steering-guide`）が返すもので、定型が持つのは「そのツールを読め」という指示だけである。

本文を定型にも書くと、ツールの契約が変わったときに定型だけが古くなる。**実際にそれが起きた**——かつて `steeringPrompt` は `/write-steering-v2` を、`firstPrompt` は `/openspec-ff-change` を先頭に置いていたが、どちらもスキルの実体を持たず、`claude -p` は `Unknown command` で起動を終えていた（assistant のターンがゼロ。実測 2026-08-27 / 2026-08-30）。steering 工程が何もせず終わっていた直接の原因である。

**定型が名前で指してよいのは、その起動で公開される MCP ツールだけとする。** 公開の一覧は `server/utils/mcp/exposed-tools.ts` にある。

`steeringPrompt` は承認でプロジェクトへ昇格した直後に渡る（[ADR 0011](../../adr/0011-steering-stage-follows-approval.md)）。cwd は昇格先のプロジェクトで、`--mcp-config` は呼び出し側がそこから組み立てて足す。`write-steering`（v2 でない方）は対話インタビュー（`grill`）を含み、無人実行では進まないため使わない。

### `claude.maxRetries`

失敗した実行を**起こし直す**回数の上限。初回のキックは起こし直しではないので数えない。上限を超えたキックは起動せず `invocation` を `error`（終端）にする（`openspec/specs/agent/invocation`）。

1回の呼び出しで起こすのは1回だけで、起こし直しは巡回が担う。したがって起動の総回数は「上限 + 1」で決まる。`0` にすると起こし直さない（1回だけ試す）。

総待ち時間は下の2件と合わせて決まる。起動ごとのタイムアウトが刻みで伸びるため、単純な掛け算にはならない。

```
総待ち時間 = (上限 + 1) × timeoutMs + timeoutStepMs × (0 + 1 + … + 上限)
```

既定（`maxRetries: 2` / `timeoutMs: 180000` / `timeoutStepMs: 0`）では 3分 × 3 = **9分**で `error` に達する。

> **この式は「起動の総回数は上限 + 1」を前提にしているが、実測がその前提と食い違っている。** `timeoutMs` / `timeoutStepMs` をどちらも 5000 にして必ず時間切れさせたところ、`error` に達するまでに起きた `claude` は**2回**だった（実測 2026-08-30）。前提が崩れていれば総待ち時間は式より短くなる。切り分けは change `fix-retry-count-without-launch` で行う。**確定するまでこの数値を鵜呑みにしないこと。**

### `claude.timeoutMs` ・ `claude.timeoutStepMs`

1回の起動を打ち切るまでの時間。`timeoutMs` が基準の長さ、`timeoutStepMs` は起こし直し1回ぶんの刻みである。

```
その起動のタイムアウト = timeoutMs + timeoutStepMs × これまでに起こし直した回数
```

- 打ち切られた呼び出しは `failed` になり、起こし直しは巡回が担う（`openspec/specs/agent/invocation`）
- 参照する回数は `claude.maxRetries` の判定が見るものと同じ値である。**初回のキックは 0** なので、初回は必ず `timeoutMs` そのものになる
- **既定の `timeoutStepMs: 0` は「伸ばさない」。** どの起動も `timeoutMs` で打ち切られる
- 伸びるのはひと続きの起こし直しの中だけである。完了（`idle`）でも、`error` の後のユーザーの再実行でも回数は 0 に戻り、タイムアウトも `timeoutMs` へ戻る。前の連なりで伸びた長さは持ち越さない

`timeoutMs` の既定 `180000`（3分）は実測から置いた値である。180秒では初回が必ず時間切れになり10分へ延ばしたが（実測 2026-08-25。当時は claude がスキルをロードし `!` フェンスの中で curl を往復させて概要を取っていた）、操作が MCP ツールへ移って所要が大きく減ったので3分へ戻した（実測 2026-08-28: 8回の呼び出しで 28.5〜64.7 秒、turns は 4〜15）。

### `claude.debugLogDir`

呼び出しの生出力を書き残すディレクトリ（`openspec/specs/debug/logging`）。空なら書かない（**既定 = 無効**）。

- ファイルは**セッションごとに1つ**、`<セッション uuid>.json`。呼び出しのたびに追記し、過去の記録を失わない。呼び出しの区切りは `# <日時>` の見出し行
- 設定したときだけ `--output-format stream-json --verbose` で呼ぶ。`json` は最終結果1件しか出さず、`tool_use` / `tool_result` が残らないため。空のときは `--output-format json` のまま
- 調査用の複製であり、書き出しの失敗は呼び出しの成否・セッションの状態・画面の挙動に影響しない（サーバーログへ警告1行のみ）
- ローテーションは無い。調査が終わったら空へ戻し、残ったファイルは手で消す

### `claude` の起動定義

`runtimeConfig.claude` の `command` と `args`。`.mcp.json` の記述形式に倣い、**JSON のひとかたまり**で持つ。

| キー | 既定値 |
|---|---|
| `claude.command` | `claude` |
| `claude.args` | 下の JSON |

`runtimeConfig.public` には置かない。画面はこの値を1つも読まず、`public` はブラウザへ配信される区画なので、置くと許可ツールの一覧が外へ出る。

```json
{
  "command": "claude",
  "args": [
    "--setting-sources", "project",
    "--model", "sonnet",
    "--allowedTools", "Skill Bash(openspec *) Read",
    "--disallowedTools", "Bash(cd *)",
    "--strict-mcp-config"
  ]
}
```

**`--add-dir` を渡さない。** 作業場所はその実行の対象（セッションのディレクトリ、または昇格先のプロジェクト）だけとする。かつてリポジトリのルートを渡していたが、根拠に挙げていたスキルとコマンドは実在せず、実際に届いていたのは次の2つだけだった（実測 2026-08-30）。

- **他人のセッションの全文**。`claude.debugLogDir` をリポジトリ配下に置くと、`--output-format stream-json` で概要・問い・proposal がそのまま残る。セッション A の claude が B のログを読めた
- **開発者の権限とプラグイン**。ルート配下の `.claude/settings.json` が `--setting-sources project` で効き、`Agent` や `Bash(claude *)` が渡っていた

### `--allowedTools`

**許可するのは、実測で要ると確かめた道具だけとする。** 根拠なく残った道具は、MCP ツールを通さない経路を黙って開けたままにする。

**成果物をファイルへ直接書ける道具を許可しない。** 取得・提出の入口は MCP ツールだけである（`docs/specs/mcp/tools.md`「操作の入口はこれだけである」）。`Write` / `Edit` はそれを迂回できるので外した——実測 2026-09-01（`yarn check:stroke --approve` を2周、計4実行）で呼び出しは0回、外した構成でも往復・承認・steering 3本が揃うことを実機で確かめている。

**`Read` は残してある。** steering 工程には文脈を取る MCP ツールが無く（公開は `get-steering-guide` / `get-steering` / `submit-document` の3本）、同じ実測で `Read` は5回使われていた。読み取りの手段を MCP ツールへ寄せる作業は未着手で、**道具を用意する前に `Read` を外すと steering が成立しない。**

**第三者の MCP を配線しない。** 両工程とも `--mcp-config` に並ぶのは自前 MCP（`stroke-board`）だけである。プロジェクトの生成は `POST /api/projects`（`docs/specs/api/projects/generate.md`）が本家 REST へ依頼する。

**`--strict-mcp-config` を外してはならない。** `--mcp-config` は「追加」であって「限定」ではないので、これが無いと開発者個人の MCP 設定が全部読み込まれる（実測 2026-08-30: 8サーバー・約80ツールが、許可されていないので呼べないまま実行に並んでいた）。

`--setting-sources` から `project` を外してはならない（ADR 0001）。**ただし `--add-dir` を外した今、この指定は実効を持たない**——探索先は cwd だけで、そこに `.claude/` は無いのでロードされるスキルは0本である。案内を Skill として配り直したときに要る守りとして残してある。

`-p` / `--output-format json` と、`--session-id` / `--resume` と会話 id、`--mcp-config`、**MCP ツール分の `--allowedTools`**（両工程とも `mcp__stroke-board` だけ）、`--` 以降の prompt は**呼び出しごとに決まる**ため、この定義には含まれない。呼び出し側が `args` の後ろに足す。

会話 id の与え方は用途で違う。

| 用途 | 会話 id |
|---|---|
| ストローク | 自前採番の uuid（= セッションディレクトリ名）を `--session-id` で渡す。**続きを開くのに要る**——次の起動が `--resume <id>` で同じ会話へ戻るには、こちら側が id を決めて覚えているしかない |
| steering | **渡さない。** 対象のディレクトリ名はプロジェクト名で uuid ではなく、`--session-id` は uuid しか受け付けない（実測: `Invalid session ID. Must be a valid UUID.`）。初回は claude に採番させ、output stream の `session_id` を `state.json` の `runId` に覚えて次から `--resume` する |

## `app/app.config.ts`

画面の見た目。サーバーの動作には関わらない。

| キー | 既定値 |
|---|---|
| `ui.colors.primary` | `indigo` |
| `ui.colors.neutral` | `slate` |

## 設定ではないもの

外から変えられないようにしているもの。**この資料に載っていない = 設定ではない。** 使う側のモジュールが持つ。

| 値 | 置き場 |
|---|---|
| セッションディレクトリ内のファイル名（`state.json` ほか） | `server/utils/stroke/session-core.ts` |
| openspec ルートの名前（`openspec` / `config.yaml`） | `server/utils/stroke/openspec.ts` |
| 子プロセスを打ち切るシグナル（`SIGKILL`） | `server/utils/stroke/claude.ts` |
| 継続先が無いときに `claude` が出す文言 | `server/utils/stroke/claude.ts` |
| 子プロセスへ接続先を渡す環境変数の名前（`STROKE_BASEURL`） | `server/utils/stroke/claude.ts` |
| プロジェクト名として許す文字 | `server/utils/stroke/project.ts` |
| 対象の id として受け付ける形 | `server/utils/stroke/session-core.ts` |
| 失敗した実行を起こし直す巡回の間隔 | `server/plugins/01.retry-failed.ts` |
| ログの接頭辞 | `server/utils/stroke/log.ts` |

`STROKE_BASEURL` は**こちらが読む設定ではなく、子プロセスへ渡す名前**である。かつてはセッション API スキルがこの名前で接続先を読んでいたが、**読み手はもう居ない**——操作系スキルは `--add-dir` を外したうえで撤去され、`curl` / `printenv` も `--allowedTools` から落ちている。渡すのをやめるかどうかは別途判断する。

いま子プロセスへ接続先が届く経路は `--mcp-config` の url である。その値は設定ではなく、サーバーが実際に bind したアドレスから作る（上の「接続先は設定ではない」）。

## ポータル側

`upstreamBaseUrl` / `specWorkflowHome` / `syncIntervalMs` の3件はこの資料に未統合で、現状は環境変数から読む。README の「設定（ポータル側）」を参照。一本化は別 change で行う。

**ここに無い値でも、環境変数が効かないわけではない。** `runtimeConfig` は Nitro が `useRuntimeConfig()` のたびに `applyEnv` を掛けるので、**全キーが `NUXT_*` で上書きされうる**（`NUXT_CLAUDE_COMMAND` など）。この資料が定めているのは「**コードが環境変数を読みに行かない**」ことと「値の実体を `nuxt.config.ts` に置く」ことであって、外から差し替えられないことではない。差し替えられたときに何が起きるかは、各項目の説明が持つ。

`specWorkflowHome` はポータルの登録簿の読み（アクティブ判定）にだけ使う。steering 工程の起動には載らない（本家 MCP を配線しないため）。

`upstreamBaseUrl` は steering 工程に効く。生成（`POST /api/projects`）の依頼先であり、`get-steering` と `submit-document`（steering 種別）の代行先そのものなので、ずらせば工程は成立しない（`server/utils/mcp/upstream-fetch.ts`）。

`projectsParentPath` は廃止した。ストローク側の保存先と同じ場所を指す必要があるため、上の `projectShareRoot` に畳んである。
