---
status: Wait-for-archive
origin: agent
triage:
  - bug
change: fix-session-api-layout
date: 2026-09-09
tags:
  - proposal
  - design
  - tasks
  - fix-session-api-layout/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
---

# fix-session-api-layout

`docs/specs/api/server.md` を基準に、セッション系（U 系・A 系・U15）の handler 13 本を `index.<method>.ts` の置き方に合わせる。URL は変えない。名前空間の移設（`/api/strokes/` → `/api/sessions/`）は次の子 change（Gitea #17）が行う。基準の docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示）から派生。Gitea issue [#13](http://192.168.1.202/gitea/grrowapp/stroke/issues/13) の内容を1本の子 change にしたもの。移動表・テスト・完了条件は issue の本文が持つ。#12 からの申し送り 3 件（`.spec-workflow/steering/structure.md` の命名例、`test/server/api/projects/index.delete.test.ts` の階層、capability `server/api-layout` を完了判定に使う）は issue #13 のコメントにある。

## 直すもの

- handler 13 本の移動（`strokes/[id]/<name>.<method>.ts` → `strokes/[id]/<name>/index.<method>.ts`、`sessions/[id]/activate.post.ts` → `sessions/[id]/activate/index.post.ts`）と相対 import の 1 段
- `test/server/api/strokes/**`・`test/server/api/sessions/**`・`support.ts` の写し。`test/server/api/projects/index.delete.test.ts` を `[projectId]/` 階層へ
- `.spec-workflow/steering/structure.md` の server API ルートの命名例 1 行（親の実体。`projects.get.ts` → `projects/index.get.ts` の形）

## 畳む方向

`find server/api/strokes server/api/sessions -type f` がすべて `index.<method>.ts` で、全 endpoint が同じ URL で応答し、`yarn test`・`yarn test:e2e` が通り、capability `server/api-layout` の Scenario を満たすこと。PR が `pre3` にマージされ、親が archive すること。
