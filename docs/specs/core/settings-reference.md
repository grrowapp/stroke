# 設定リファレンス

**この資料が設定の正である**（[ADR 0004](../../adr/0004-settings-reference-is-authoritative.md)）。**ここに無いものは設定ではない。** コードが読んでいる値がここに載っていなければ、それは実装の誤りであって、資料の書き漏れではない。

設定を足す・消す・既定値を変えるには、change を起こしてユーザーの承認を得る。

## `nuxt.config.ts` — `runtimeConfig`

サーバー専用。

### `.env` で差し替えられる

置き場の2件だけ。**動かす機械ごとに変わる**ため外に出す。他の設定は機械が変わっても変わらない。

| キー | 環境変数 | 既定値 |
|---|---|---|
| `sessionsRoot` | `NUXT_SESSIONS_ROOT` | `/var/lib/stroke-board/sessions` |
| `projectsRoot` | `NUXT_PROJECTS_ROOT` | `/opt/projects` |

### 差し替えない

値は `nuxt.config.ts` に書かれたものだけである。

| キー | 既定値 |
|---|---|
| `claude.apiBaseUrl` | `http://127.0.0.1:3001` |
| `claude.workflowSchema` | `flontier-strokeflow` |
| `claude.firstPrompt` | `/openspec-ff-change draft-proposal` ＋ 固定指示 |
| `claude.continuePrompt` | 続きを促す1文 |
| `openspec.bin` | `openspec` |
| `openspec.initArgs` | `init --tools none` |
| `wsPathPattern` | `/api/strokes/([^/]+)/ws/{channel}(?:$\|[/?#])` |

## `nuxt.config.ts` — `runtimeConfig.public`

画面とサーバーの両方が読む。**環境変数では上書きしない。** 値は `nuxt.config.ts` に書かれたものだけである。

| キー | 既定値 |
|---|---|
| `claude.command` | `claude` |
| `claude.args` | 下の JSON |

### `claude` の起動定義

`runtimeConfig.public.claude` の `command` と `args`。`.mcp.json` の記述形式に倣い、**JSON のひとかたまり**で持つ。環境変数からは読まない。

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

`-p` / `--output-format json` と、`--session-id` / `--resume` とセッション id、`--` 以降の prompt は**呼び出しごとに決まる**ため、この定義には含まれない。`server/utils/stroke/claude.ts` が `args` の後ろに付ける。
