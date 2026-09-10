# 実行の決着 — `POST /api/strokes/:id/settlement`

その実行で提出されたものに応じて局面を切り替え、画面へ届ける。共通の約束は [contract.md](../contract.md)。

- input: `{ submitted: 'question' | 'proposal' }`
- output: 本文なし（204）

## 振る舞い

- **叩くのは invoke-agent だけ**とする（A8・U15 と同じ規律。[architecture/invoke-agent.md](../../architecture/invoke-agent.md)）。claude（エージェント）と画面は叩かない
- `question` — 記録された今の1問を W1 へ配信する。phase は動かさない
- `proposal` — phase を `proposed` にし、今の1問を消してから、残っている proposal を W2 へ配信する
- **何をするかは `submitted` が決める。** endpoint が状態を見て選ばない。書き込みを済ませてから配信する（逆にすると、配信だけ届いて局面が動いていない状態が作れる）

## エラー

| status | 状況 |
|---|---|
| 400 | 形式不正 |
| 404 | セッションが無い |
| 409 `phase` | 昇格した対象（`approved` / `activated`）、または残っている proposal が無い |
