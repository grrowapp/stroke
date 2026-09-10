---
status: Doing
origin: user
triage:
  - bug
change: fix-server-api-layout
date: 2026-09-08
tags:
  - proposal
  - design
  - tasks
  - pre3/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
---

# fix-server-api-layout

`docs/specs/api/` の規定に `server/api/` の実装を合わせる。**docs は正であり、基準の `overview.md`・`server.md` には触れない。** 乖離は4種類——endpoint の名前空間（U 系・W1/W2 が `/api/sessions/` ではなく `/api/strokes/` に在る）、handler の置き方（`index.<method>.ts` ではなく `<name>.<method>.ts`）、U14 name-conflict 時の判断の扱い、api と実処理の分離（ユーザー決定 2026-09-08）。

この change は**親**である。作業は Gitea の issue 8本（親 #14）に分解済みで、issue ごとに子 change（ticket 同時起票）を切り、1 issue の解消を tasks の1区切りとして最後まで実行する。子 change は change 名のブランチ（worktree）で作業し、完了時に PR を出してマージする。最後にこのブランチ（`pre3`）から PR を出して終える。

## 事実（2026-09-08 調査、2026-09-09 訂正）

規定は `docs/specs/api/overview.md`（名前空間）・`docs/specs/api/server.md`（置き方）・`docs/specs/api/sessions/*.md`・`docs/specs/api/ws/delivery.md`（各 endpoint）。

| 乖離 | 規定（docs） | 実装 |
| --- | --- | --- |
| endpoint の名前空間 | U 系・W1/W2 は `/api/sessions/`（`overview.md`） | U11・U15 以外の U 系 10 本と W1/W2 が `/api/strokes/`。`useAgentQuestion` の基底は `/api/<id>` |
| handler の置き方 | `index.<method>.ts`（`server.md`） | `<name>.<method>.ts` が 24 本中 21 本 |
| U14 name-conflict | 判断を取り下げて 409（`sessions/promote.md`） | 判断を残したまま 409。画面が自分で取り下げて補っている |
| api と実処理の分離 | api は handler を呼ぶ薄いラッパー + HTTP 固有の準備／後始末。実処理は `server/handler/`（`projects/delete.md`「実装の共有」が先例） | handler を経由するのは U11・P1 の2本だけ |

`docs/specs/api/` 配下では `contract.md`「各 endpoint の入出力」が `/api/strokes/` のまま。openspec specs は `server/session-management` が未追従で、`server.md` の置き方の capability が無い。

## 経緯

- `connect-portal-and-strokes`（2026-08-26 archive）の tasks 7.1 / 7.2 / 7.6 が未チェックのまま archive され、U11 だけが後から `sessions/` に置かれた
- `submission-path.ts` の `activatePath` が「他の U 系が `/api/strokes/` に在るのは実装側の誤りで別 ticket が直す」と書いて U15 だけ正しい位置に置いた
- 2026-09-08〜09 に分解を Gitea issue に起票（#10 #11 #12 #13 #15、親 #14）。分解の詳細・修正するファイル・関連 docs は各 issue が持つ

## 影響範囲（子 change 単位）

| Gitea | 子 change（候補名） | 内容 | 大きさ |
| --- | --- | --- | --- |
| #10 | `fix-api-contract-path-drift` | `docs/specs/api/contract.md` の U 系・W1/W2 の見出しを `overview.md` に追従 | 小 |
| #11 | `fix-promote-name-conflict-withdrawal` | U14 name-conflict で判断を取り下げてから 409。画面側の補いを外す | 小 |
| #12 | `fix-project-api-layout` | プロジェクト系 handler 9 本を `index.<method>.ts` に。`server.md` の capability を新設。`spec-screen-flow.md` を追随 | 中 |
| #13 | `fix-session-api-layout` | セッション系 handler 13 本を `index.<method>.ts` に（URL 不変） | 小〜中 |
| #17 | `fix-session-api-namespace` | セッション系 U 系と W1/W2 を `/api/sessions/` へ移設。画面・サーバ内参照・テスト・E2E・`wsPathPattern`・`useAgentQuestion`・spec 1 本・関連 docs 4 ページ | 中 |
| #15 | `update-session-api-handler` | U 系の api を薄い層にし、実処理を `server/handler/` へ。capability 新設・`system-structure.md`・`server-structure.md` を追随 | 中 |
| #18 | `update-stroke-api-handler` | A 系と WS route の実処理を `server/handler/` へ | 小〜中 |
| #19 | `update-project-api-handler` | プロジェクト系 api の実処理を `server/handler/` へ。`toHttp` を1つに | 小〜中 |

2026-09-09: 「作業量が多いものは split が甘い」の指摘で #13・#15 を再分割した（#17・#18・#19 を追加）。

## 順序制約（Gitea #14）

```
#10   （独立）
#11 ──▶ #13 ──▶ #17 ──▶ #15 ──┬──▶ #18
#12 ───────────────────────────┴──▶ #19
```

#10・#11・#12 は並走できる。#13 → #17 → #15 は直列（同じファイルを順に触る）。#18・#19 は #15 の後に並走できる。

## 関連 ticket・change（2026-09-09 決定）

- `openspec/tickets/fix-session-api-path.md` — #17 の子 change に吸収し、`.archive/` へ移す
- `openspec/tickets/fix-agent-question-api-path.md` と同名 change（README のみ）— #17 の子 change に吸収し、ticket を `.archive/` へ、change ディレクトリを消す

## 畳む方向

子 change 8 本がそれぞれ archive され、PR がマージされていること。`docs/specs/api/` の規定と `server/api/` が一致し、`yarn test`・`yarn test:e2e`・`openspec validate --all` が通ること。`pre3` から親ブランチへの PR が出ていること。

## 参照先の資料が増えた（2026-09-09。change `update-api-contract` から）

`docs/specs/api/contract.md` に在った各 endpoint の入出力を、1本1ファイルへ切り出した。**基準の
`api/overview.md`・`api/server.md` は触っていない**が、実装を突き合わせる先が増えている。

- U1・U2・U3・U7・U9・U12 — `docs/specs/api/sessions/{overview,get,strokes,answer,send-back,list}.md`（新設）
- A1・A4・A5・A7・A8 — `docs/specs/api/strokes/{overview,send-back,question,proposal,submission}.md`（新設）
- W1・W2 — `docs/specs/api/ws/delivery.md` へ吸収

切り出し先のパス表記は docs の正（`/api/sessions/`）に揃えてある。実装との差は #17 の範囲のままで、
`update-api-contract` は実装に触っていない。
