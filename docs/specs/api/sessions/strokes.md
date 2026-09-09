# 済んだストローク — `GET /api/sessions/:id/strokes`

そのセッションで済んだ往復を古い順に返す。共通の約束は [contract.md](../contract.md)。

- output: `{ strokes: Stroke[] }`

## 振る舞い

- `Stroke` は `proposal: false`（問いと回答のペア。問い返しも同じ形）か `proposal: true`（proposal 初提出のマーカー。`question` / `answer` は null）のどちらかである

## エラー

| status | 状況 |
|---|---|
| 404 | セッションが無い |
