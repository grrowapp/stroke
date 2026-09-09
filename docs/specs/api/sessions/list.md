# セッションの一覧 — `GET /api/sessions`

実体の揃ったセッションと、昇格したプロジェクトを新しい順に返す。共通の約束は [contract.md](../contract.md)。

- output: `SessionSummary[]`（`{ id, phase, updatedAt, path, invocation }`。`updatedAt` は `state.json` の mtime。読めない `state.json` は `phase: 'unknown'`）。1件も無ければ `[]`

## 振る舞い

- `path` は対象のディレクトリ。**キックする側はこれを cwd として U13 に渡す**（endpoint に導出させない）。`invocation` は実行の記録で、巡回はこれが `failed` の件だけを拾う
- 一覧には実体の揃ったセッション（ディレクトリ・openspec ルート・スキーマ設定済み）だけが載る。**作成直後（初回起動前）のセッションはまだ載らない。** U13 はこの符合で初回か継続かを判定する
- **承認で昇格した対象も載る。** 昇格後は id がプロジェクト名に変わるが、steering の巡回・再キックの対象になるため一覧から外さない。完成した対象は `phase: 'activated'` で載る（起動時の書き上げはこの一覧の `approved` かつ `invocation: 'idle'` を拾って U15 を叩く）。`state.json` を持たないディレクトリは載らない
- サーバが動いていないときの削除・一覧・作成は `yarn session`（[session-workflow.md](../../architecture/session-workflow.md)）
