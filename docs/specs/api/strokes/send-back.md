# 差し戻しの取得 — `GET /api/strokes/:id/send-back`

エージェントがそのセッションの差し戻しの指摘を読む。共通の約束は [contract.md](../contract.md)。

- output: `SendBackPayload`

## エラー

| status | 状況 |
|---|---|
| 404 | セッションが無い、または差し戻しがまだ無い |
