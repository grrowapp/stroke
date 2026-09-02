# ADR-0008: 本家の基準を 2.2.7 とする

- **状態**: 採用
- **日付**: 2026-08-21
- **関連**: [ADR-0006](./0006-upstream-observed-behaviour.md) の「基準は v2.2.5 とする」を置き換える

## 決定

stroke-board が追随する本家 spec-workflow-mcp の基準を **2.2.7** とする。
実体は `https://github.com/Pimzino/spec-workflow-mcp` の main（手元では
`/home/vagrant/work/repo/spec-workflow-mcp`、`package.json` の `version` が `2.2.7`）。

**基準は「いつ時点でそう決めたか」とセットでしか意味を持たない。** 本家は動き続けるので、
版だけを書いても、読む人はそれが今も成り立つのか判断できない。基準を書くときは決めた日を
添え、観測を書くときは**読んだ版と読んだ日**を添える（`docs/specs/reference/upstream-observations.md`）。

**実行時に走る版はこの基準と一致しない。** 起動は `npx -y @pimzino/spec-workflow-mcp@latest`
で、`@latest` が解決した版が走る。手元の解決先は **2.2.5** だった（実測 2026-09-01。
npx のキャッシュと `node_modules` の両方で `core/git-utils.js` はバイト一致）。基準より古い
版が走ることも新しい版が走ることもある。**基準は「何を読んで設計したか」を指すのであって、
実行時の版を固定するものではない。** 固定したいなら起動の指定から `@latest` を外す判断が要る
——それはこの ADR の範囲外である。

## 背景

ADR-0006 は基準を v2.2.5 と定めていた。一方で ADR-0006 の本文には
「`- [~]` を blocked に変換する」と、2.2.7 の挙動が混ざって書かれていた。
基準を 2.2.7 に上げることで、この記述は正しくなる。

なお **このプロジェクトはリリースにタグを打っていない**。remote にあるタグは
`v0.0.25` と `v0.0.28` の2つだけで、2.0.x〜2.2.5 はいずれもタグ無しで公開されている。
バージョンの判別は `package.json` の `version` で行う。タグの有無を根拠にしない。

## 2.2.5 との差分

接点面（stroke-board が読む範囲）に効く差分は `blocked` まわりだけである。
`d37b076..HEAD` の差分を接点面のファイルに絞って確認した。

| ファイル | 差分 | 影響 |
|---|---|---|
| `src/core/task-parser.ts` | `status` に `'blocked'` 追加。`blocked: boolean` と `blockedReason?: string` を `ParsedTask` に追加。`summary` に `blocked: number` 追加。チェックボックスの `~` を blocked として解釈 | **あり** |
| `src/dashboard/multi-server.ts` | `PUT /api/projects/:projectId/specs/:name/tasks/:taskId/status` が `blocked` と `reason` を受けるようになった | 無し。stroke-board は書き込み系を呼ばない（決定11） |
| `src/dashboard/approval-storage.ts` | `categoryName` のパストラバーサル対策。`ApprovalRequest` の形は変わっていない | 無し |
| `src/core/project-registry.ts` / `src/types.ts` / `src/core/parser.ts` | 無変更 | 無し |

したがって、registry の構造・`SpecData`・`ApprovalRequest`・WebSocket のメッセージ種別・
読み取り系 REST は 2.2.5 と 2.2.7 で同一である。

## 影響

- タスクの状態は **4値**（`pending` / `in-progress` / `completed` / `blocked`）として扱う
- `summary` は `{total, completed, inProgress, pending, blocked, headers}` を基準の形とする
- **ただし `blocked` と `summary.blocked` は zod で optional にする。**
  この環境で実際に動いているダッシュボードは 2.2.5 であり（`GET /api/projects/:id/info` の
  `version` が `"2.2.5"`、npm の `latest` も 2.2.5）、2.2.5 のペイロードには
  `blocked` が入らない。必須にすると手元で1件も通らなくなる
- `blocked` は通知の判定には使わない。通知は本家 `NotificationProvider` と同じ4種のままで、
  そこに blocked は含まれない（[ADR-0005](./0005-do-not-derive-from-upstream-data.md)）。
  タスク画面の表示にのみ効く
- ステアリングの `tech.md` は「Dependency Versions: 本家 spec-workflow-mcp v2.2.5 を基準とする」
  と書いており、本 ADR と食い違う。tech.md の更新は別途行う
