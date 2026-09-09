# セッションの状態 — `GET /api/sessions/:id`

そのセッションの局面（`phase`）と実行の記録（`invocation`）、対象のディレクトリを返す。共通の約束は [contract.md](../contract.md)。

- output: `{ phase: 'stroking' | 'proposed' | 'approved' | 'activated', invocation: 'running' | 'idle' | 'failed' | 'error', path: string }`

## 振る舞い

- `path` は対象のディレクトリ。画面はこれを cwd として U13 に渡す（endpoint に導出させない）
- リロード時に1回読み、画面の行き先（`stroking`＝画面1 / `proposed` 以降＝画面2）と待機・失敗表示を決める。**回答や差し戻しを送って待っている間だけ**、数秒おきに読み直す
- 昇格後（`approved` / `activated`）も `invocation` を持つ。昇格したプロジェクトでは steering の実行が起きるためで、`idle` に潰さずそのまま返す。`activated` は完成の記録（U15）だけが書く
- `failed` のとき、ユーザーの再試行は同じ入力 POST（U7 / U9）の再送と、その成功応答後の U13。巡回（`server/plugins/01.retry-failed.ts`）も `failed` を拾って再起動する
- `error` はリトライ上限に達した**終端**。システムは自動では何もしない。画面が何を示し、ユーザーに何を選ばせるかは [failure.md](../../architecture/failure.md)。**画面は A8 を叩かない**

## エラー

| status | 状況 |
|---|---|
| 404 | セッションが無い |
