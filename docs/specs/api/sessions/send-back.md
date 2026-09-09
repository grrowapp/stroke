# 差し戻し — `POST /api/sessions/:id/send-back`

proposal への指摘を受理して記録する。AI の起動は含まない——画面が受理の成功応答の直後に U13 を呼ぶ。共通の約束は [contract.md](../contract.md)。

- input: `SendBackPayload`（`response` / `comments[]` / `annotations` / `nextSteps`）
- output: 本文なし（204）

## 振る舞い

- **実行中でも受理する**（busy は見ない。多重起動を止めるのは U13 だけである）

## エラー

| status | 状況 |
|---|---|
| 400 | 指摘が0件、または形式不正 |
| 404 | セッションが無い |
| 409 `phase` | `proposed` 以外（受理するのは `proposed` だけ） |
