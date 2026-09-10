# 実行の記録 — `POST /api/strokes/:id/submission`

実行の記録（`invocation`）を、渡された値に変える。共通の約束は [contract.md](../contract.md)。

- input: `{ invocation: 'running' | 'idle' | 'failed' | 'error', retries?: number }`
- output: 本文なし（204）

## 振る舞い

- 実行の記録を指定の値に変えるだけの endpoint である。**`invocation` を書き込めるのはここだけ**であり、叩くのは invoke-agent だけとする（[architecture/invoke-agent.md](../../architecture/invoke-agent.md)）。claude（エージェント）と画面は叩かない。A5・A7 も `invocation` に触れない
- 値の意味づけも遷移の判定もここでは持たない。`retries` は渡されたときだけ上書きする（`error` からの再実行で 0 に戻すのに使う）
- **成功の決着は流さない。** `idle` は「終わった」であって「できた」ではなく、`done` を配信するのは完成の記録（U15）だけである。生成中（`approved`）の対象が `error` に達したときの `failed` だけをここから流す

## エラー

| status | 状況 |
|---|---|
| 400 | 形式不正 |
| 404 | セッションが無い |
