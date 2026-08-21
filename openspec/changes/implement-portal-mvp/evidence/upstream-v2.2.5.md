# 本家 v2.2.5 の実測（tasks.md 2.1）

取得日: 2026-08-21
対象: `http://127.0.0.1:5000`（`@pimzino/spec-workflow-mcp@2.2.5` を `spec-workflow-cli` 経由で起動したもの）

`GET /api/projects/:id/info` の `version` が `"2.2.5"` を返しており、**基準バージョンそのもの**を観測している。
design.md に残っていた「確認したのは v2.2.7 のソース」という保留はこれで解消した。

## 稼働中の実物から取得したもの

### `GET /api/projects/list`

```json
[{"projectId":"t_kx1DQkLKdeg1Cl","projectName":"stroke-guard-rev · v2",
  "projectPath":"/home/vagrant/work/stroke-guard/v2",
  "instances":[{"pid":1483974,"registeredAt":"2026-08-17T14:17:54.455Z"}]}]
```

**`workflowRootPath` を含まない。** `activeProjects.json` には含まれる。
走査結果（= `workflowRootPath`）と registry の突き合わせは `activeProjects.json` からしか行えない。
design.md 決定1 の裏付け。

### `GET /api/projects/:id/info`

```json
{"projectId":"YRzzH6mvc1uUzZN3","projectName":"stroke-board · base2",
 "projectPath":"/home/vagrant/work/stroke-board/base2",
 "steering":{"exists":true,"documents":{"product":true,"tech":true,"structure":true},
             "lastModified":"2026-08-19T23:22:30.052Z"},
 "version":"2.2.5"}
```

### WebSocket `ws://127.0.0.1:5000/ws?projectId=<id>`

接続直後に `projects-update` → `initial` の順で届いた。

```json
{"type":"initial","projectId":"YRzzH6mvc1uUzZN3","data":{"specs":[],"approvals":[]}}
```

`projects-update` の `data.projects` は `GET /api/projects/list` と同じ形。**`workflowRootPath` を含まない。**

### `GET /api/projects/:id/approvals`

pending のみが返る。実物は3件とも **`category: "steering"`** だった。

```json
{"id":"approval_1786976855197_mfzyl3llh",
 "title":"ステアリング: structure.md（プロジェクト構成）の承認",
 "filePath":".spec-workflow/steering/structure.md",
 "type":"document","status":"pending",
 "createdAt":"2026-08-17T14:27:35.197Z",
 "category":"steering","categoryName":"steering"}
```

- **`filePath` は相対パス**。プロジェクトルートからの相対で、絶対パスではない
- pending の応答には `annotations` / `comments` / `metadata` / `respondedAt` が出ない（いずれも optional）
- 承認依頼がステアリング文書に対して立つことが、実データで確認できた（design.md 決定9 の根拠）

### `GET /api/projects/:id/approvals/:id/content`

```json
{"content":"# Project Structure\n\n## Directory Organization\n..."}
```

### 親パスの走査

`/opt/projects/*/.spec-workflow` は **9件**。うち registry にあるのは2件。
残る7件は本家 API からは一切見えない。走査で母集合を作る必要がある（design.md 決定3 の裏付け）。

```
injector-hooks  spec-workflow-plugins  srvgm  stroke-board  stroke-guard-rev
stroke-guard  stroke-plugins  stroke  subagents
```

## 稼働中の v2.2.5 の dist を読んで確認したもの

specs を持つプロジェクトが registry に登録されていないため `task-status-update` を実際に
発火させられない。登録は共有 registry の状態変更にあたるので行わず、稼働中プロセスが
読み込んでいる `dist/` を直接読んだ。

### `task-status-update`（`dist/dashboard/multi-server.js:1238`）

```js
{ type: 'task-status-update', projectId,
  data: { specName, taskList: parseResult.tasks,
          summary: parseResult.summary, inProgress: parseResult.inProgressTask } }
```

### `summary`（`dist/core/task-parser.js:262`）

```js
{ total, completed, inProgress, pending, headers }
```

🔴 **v2.2.7 との差**: v2.2.7 は `blocked` を持つが、**v2.2.5 には無い**。

### タスクの状態（`dist/core/task-parser.js:118-126`）

v2.2.5 は3値しか持たない。

| マーカー | 状態 |
|---|---|
| `x` | `completed` |
| `-` | `in-progress` |
| 上記以外（空白・`~` を含む） | `pending` |

🔴 **ADR-0002 の記述の誤り**: ADR-0002 は「`- [ ]` / `- [-]` / `- [x]` / `- [~]` を
pending / in-progress / completed / **blocked** に変換する」と書いているが、これは v2.2.7 の
挙動である。v2.2.5 に `blocked` は存在せず、`- [~]` は `pending` になる。
ADR-0002 は v2.2.5 の記録として書かれているため、記述と対象がずれている。

### `taskList` の各要素（`dist/core/task-parser.js:238`）

必ず入るもの:

```
id, description, status, lineNumber, indentLevel, isHeader, completed, inProgress
```

値があるときだけ入るもの:

```
requirements, leverage, files, purposes, implementationDetails, prompt, promptStructured
```

### `approval-update`（`dist/dashboard/multi-server.js:305`）

```js
{ type: 'approval-update', projectId, data: approvals }
```

`approvals` は `getAllPendingApprovals()` の結果、すなわち pending のみの配列。

---

# Nuxt UI での design token 再現（tasks.md 2.3）

`tech.md` の Known Limitations「Nuxt UI のテーマ機構で本家の token を再現できるか未検証」への回答。

**結論: 再現できる。** 実測した6値すべてが一致した。

## 確認方法

`@nuxt/ui@4.10.0` + `tailwindcss@4.3.3` でビルドし、Chromium で描画して `getComputedStyle` を読んだ。

## 結果

| 本家 token | 実測値 | 描画された値 |
|---|---|---|
| `--surface-base` | `#0f172a` | `rgb(15, 23, 42)` |
| `--surface-panel` | `#1e293b` | `rgb(30, 41, 59)` |
| `--border-default` | `#334155` | `rgb(51, 65, 85)` |
| `--text-primary` | `#f1f5f9` | `rgb(241, 245, 249)` |
| `--text-muted` | `#94a3b8` | `rgb(148, 163, 184)` |
| `--interactive-primary` | `#6366f1` | `rgb(99, 102, 241)` |

## 分かったこと

### 本家の token は Tailwind の slate + indigo と同じ系統

`#0f172a` = slate-900、`#1e293b` = slate-800、`#334155` = slate-700、`#f1f5f9` = slate-100、
`#cbd5e1` = slate-300、`#94a3b8` = slate-400、`#6366f1` = indigo-500。

ただし **Tailwind v4 は階調を oklch に振り直しており、v3 由来の本家 hex とは一致しない**
（例: v4 の slate-900 は `oklch(20.8% 0.042 265.755)`）。色系統だけ `app.config.ts` の
`colors.neutral: 'slate'` / `colors.primary: 'indigo'` で合わせ、実測値のある箇所は
セマンティック変数（`--ui-bg` / `--ui-border` / `--ui-text-*`）を上書きして正確に合わせた。
実測が無い階調は Tailwind の slate に委ねてある。発明した値は入っていない。

### `--ui-primary` はダークモードで 400 に落ちる

Nuxt UI はダークモードで `--ui-primary` に `--ui-color-primary-400`
（`oklch(67.3% 0.182 276.935)`）を割り当てる。本家のアクセントは indigo-500 固定で
明暗によって振らないため、`.dark` で `--ui-primary` を実測値に上書きした。

これをしないとボタン等のアクセントが本家より明るく出る。

### セマンティック変数の名前

`@nuxt/ui@4.10.0` の `dist/runtime/index.css` が定義しているものに合わせた。

```
--ui-text-dimmed / --ui-text-muted / --ui-text-toned / --ui-text / --ui-text-highlighted
--ui-text-inverted / --ui-bg / --ui-bg-muted / --ui-bg-elevated / --ui-bg-accented
--ui-bg-inverted / --ui-border / --ui-border-muted / --ui-border-accented / --ui-border-inverted
```

ダークモードは `.dark` クラスで切り替わる（`@variant dark (&:where(.dark, .dark *))`）。
既定をダークにするため `nuxt.config.ts` に `colorMode: { preference: 'dark', fallback: 'dark' }` を置いた。
