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
| `claude.apiBaseUrl` | `http://127.0.0.1:3001` |
| `claude.workflowSchema` | `flontier-strokeflow` |
| `claude.firstPrompt` | `/openspec-ff-change draft-proposal` ＋ 固定指示 |
| `claude.continuePrompt` | 続きを促す1文 |
| `claude.steeringPrompt` | `/write-steering-v2` ＋ 固定指示 |
| `claude.maxRetries` | `2` |
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
│   └── .spec-workflow/           本家 MCP が作る。ここで一覧に現れる
└── .spec-workflow-mcp/           本家のグローバル状態
```

### `claude.steeringPrompt`

承認でプロジェクトへ昇格した直後に、steering 文書を作らせるために渡す定型（[ADR 0011](../../adr/0011-steering-stage-follows-approval.md)）。cwd は昇格先のプロジェクトで、`--mcp-config` は呼び出し側がそこから組み立てて足す。

起動するスキル `write-steering-v2` はこのリポジトリの `.claude/skills/` に在り、`--add-dir` 経由でロードされる（[ADR 0001](../../adr/0001-claude-p-invocation.md)）。`write-steering`（v2 でない方）は対話インタビュー（`grill`）を含み、無人実行では進まないため使わない。

```
/write-steering-v2

スキルの指示に従って steering 文書を作成する。
```

### `claude.maxRetries`

失敗した実行を**起こし直す**回数の上限。初回のキックは起こし直しではないので数えない。上限を超えたキックは起動せず `invocation` を `error`（終端）にする（`openspec/specs/agent/invocation`）。

1回の呼び出しで起こすのは1回だけで、起こし直しは巡回が担う。したがって起動の総回数は「上限 + 1」、総待ち時間は「(上限 + 1) × タイムアウト」で決まる。`0` にすると起こし直さない（1回だけ試す）。

### `claude` の起動定義

`runtimeConfig.claude` の `command` と `args`。`.mcp.json` の記述形式に倣い、**JSON のひとかたまり**で持つ。

| キー | 既定値 |
|---|---|
| `claude.command` | `claude` |
| `claude.args` | 下の JSON |

`runtimeConfig.public` には置かない。画面はこの値を1つも読まず、`public` はブラウザへ配信される区画なので、置くとリポジトリの絶対パス（`--add-dir`）と許可ツールの一覧が外へ出る。

```json
{
  "command": "claude",
  "args": [
    "--setting-sources", "project",
    "--model", "fable",
    "--add-dir", "<リポジトリのルート>",
    "--add-dir", "<リポジトリのルート>/assets",
    "--allowedTools", "Bash Read Write Edit"
  ]
}
```

`--setting-sources` から `project` を外してはならない（ADR 0001）。外すとスキルが一切ロードされない。

`-p` / `--output-format json` と、`--session-id` / `--resume` と会話 id、`--mcp-config`、`--` 以降の prompt は**呼び出しごとに決まる**ため、この定義には含まれない。呼び出し側が `args` の後ろに足す。

会話 id の与え方は用途で違う。

| 用途 | 会話 id |
|---|---|
| ストローク | 自前採番の uuid（= セッションディレクトリ名）を `--session-id` で渡す。スキルが `${CLAUDE_SESSION_ID}` でセッション id を知る前提に効いている |
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
| 子プロセスのタイムアウトと打ち切りシグナル | `server/utils/stroke/claude.ts` |
| 継続先が無いときに `claude` が出す文言 | `server/utils/stroke/claude.ts` |
| 子プロセスへ接続先を渡す環境変数の名前（`STROKE_BASEURL`） | `server/utils/stroke/claude.ts` |
| プロジェクト名として許す文字 | `server/utils/stroke/project.ts` |
| 対象の id として受け付ける形 | `server/utils/stroke/session-core.ts` |
| 失敗した実行を起こし直す巡回の間隔 | `server/plugins/02.retry-failed.ts` |
| ログの接頭辞 | `server/utils/stroke/log.ts` |

`STROKE_BASEURL` は**こちらが読む設定ではなく、子プロセスへ渡す名前**である。セッション API スキルがこの名前で接続先を読む。

## ポータル側

`upstreamBaseUrl` / `specWorkflowHome` / `syncIntervalMs` の3件はこの資料に未統合で、現状は環境変数から読む。README の「設定（ポータル側）」を参照。一本化は別 change で行う。

`projectsParentPath` は廃止した。ストローク側の保存先と同じ場所を指す必要があるため、上の `projectShareRoot` に畳んである。
