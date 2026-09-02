# `docs/specs/api/` の目録

サーバ API の資料の置き場。**この資料はディレクトリの中身を表す。**

| 置き場 | 何が入るか |
|---|---|
| [contract.md](./contract.md) | 全ての endpoint に共通する約束 |
| `sessions/` | `/api/sessions/` の endpoint。1本につき1ファイル |
| `strokes/` | `/api/strokes/` の endpoint。1本につき1ファイル |
| `projects/` | `/api/projects/` の endpoint。1本につき1ファイル |
| `ws/` | WS 配信 |

## `sessions/` — 9本

| # | メソッド / パス | 内容 |
|---|---|---|
| U1 | `POST /api/sessions` | 概要を投稿してセッションを作る |
| U2 | `GET /api/sessions/:id` | セッションの状態を見る |
| U3 | `GET /api/sessions/:id/strokes` | 済んだストロークを見る |
| U7 | `POST /api/sessions/:id/answer` | 問いに回答する |
| U9 | `POST /api/sessions/:id/send-back` | proposal を差し戻す |
| U10 | `POST /api/sessions/:id/approve` | 承認する |
| U11 | `DELETE /api/sessions/:id` | セッションを消す |
| U12 | `GET /api/sessions` | セッションを一覧する |
| U13 | `GET /api/sessions/:id/invoke-agent` | AI を起動する |

## `projects/` — 1本

| # | メソッド / パス | 内容 |
|---|---|---|
| P1 | `DELETE /api/projects/:projectId` | 作りきれなかったプロジェクトを消す |

## `strokes/` — 5本

| # | メソッド / パス | 内容 |
|---|---|---|
| A1 | `GET /api/strokes/:id/overview` | 概要を取得する |
| A4 | `GET /api/strokes/:id/send-back` | 差し戻しの指摘を取得する |
| A5 | `POST /api/strokes/:id/question` | 問いを提出する |
| A7 | `POST /api/strokes/:id/proposal` | proposal を提出する |
| A8 | `POST /api/strokes/:id/submission` | 実行の記録を変える |

## `ws/` — 3本

| # | パス | 内容 |
|---|---|---|
| W1 | `/api/sessions/:id/ws/question` | 問いを配信する |
| W2 | `/api/sessions/:id/ws/proposal` | proposal を配信する |
| WB | `/ws` | 上層へのサーバー発イベントを配信する |
