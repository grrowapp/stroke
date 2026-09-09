# 概要の投稿 — `POST /api/sessions`

概要を受け取ってセッションを1つ作る。AI の起動は含まない——起動は U13 が唯一の入口である。共通の約束は [contract.md](../contract.md)。

- input: `{ overview: string }`（空・空白のみは 400）
- output: `{ sessionId: string }`

## 振る舞い

- **受理の応答に本文を持つのはこの1本だけである。** 他の受理系は本文なし（204）で返す

## エラー

| status | 状況 |
|---|---|
| 400 | 概要が空、または空白のみ |
