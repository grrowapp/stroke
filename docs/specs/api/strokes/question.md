# 問いの提出 — `POST /api/strokes/:id/question`

エージェントが問い（差し戻しへの問い返しを含む）を1件提出する。共通の約束は [contract.md](../contract.md)。

- input: `Question`（`header` / `detail` / `question` / `options[]`）
- output: 本文なし（204）

## 振る舞い

- 問いと問い返しを区別しない。提出はこの1本、配信は W1 の1チャネルに統合し、strokes に一様に記録する
- **記録だけを行う。** 今の1問として残すところまでで、画面へは配信しない。配信は、この提出を
  行った実行の決着（A9。[settlement.md](./settlement.md)）で行われる
- `invocation` には触れない（実行の記録を書くのは A8 だけである）

## エラー

| status | 状況 |
|---|---|
| 400 | スキーマ不適合 |
| 404 | セッションが無い |
| 409 `phase` | 承認以降（`approved` / `activated`）は拒否 |
