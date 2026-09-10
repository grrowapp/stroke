# 回答 — `POST /api/sessions/:id/answer`

いま出ている問いへの回答を受理して記録する。AI の起動は含まない——画面が受理の成功応答の直後に U13 を呼ぶ。共通の約束は [contract.md](../contract.md)。

- input: `Answer`（`{ kind: 'option' | 'free', value: string }`）
- output: 本文なし（204）

## 振る舞い

- **実行中でも受理する**（busy は見ない。多重起動を止めるのは U13 だけである）

## エラー

| status | 状況 |
|---|---|
| 400 | 形式不正 |
| 404 | セッションが無い |
| 409 `phase` | 承認以降（`approved` / `activated`）、または答えるべき問いが無い |
