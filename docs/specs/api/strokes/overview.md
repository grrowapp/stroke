# 概要の取得 — `GET /api/strokes/:id/overview`

エージェントがそのセッションの概要を読む。共通の約束は [contract.md](../contract.md)。

- output: `{ overview: string }`

## エラー

| status | 状況 |
|---|---|
| 404 | セッションが無い、または概要が無い |
