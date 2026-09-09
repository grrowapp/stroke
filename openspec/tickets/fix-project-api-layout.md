---
status: Doing
origin: agent
triage:
  - bug
change: fix-project-api-layout
date: 2026-09-09
tags:
  - proposal
  - specs
  - design
  - tasks
  - fix-project-api-layout/child-12
---

# fix-project-api-layout

`docs/specs/api/server.md` を基準に、プロジェクト系（本家仲介）の handler 9 本を `index.<method>.ts` の置き方に合わせる。URL は変えない。`server.md` の置き方を capability（候補 `server/api-layout`）として新設し、`docs/specs/architecture/spec-screen-flow.md` の位置表を追随させる。基準の docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示）から派生。Gitea issue [#12](http://192.168.1.202/gitea/grrowapp/stroke/issues/12) の内容を1本の子 change にしたもの。移動表・テスト・capability・関連 docs は issue の本文が持つ。

## 直すもの

- handler 9 本の移動（`projects.get.ts` → `projects/index.get.ts`、`info.get.ts` → `info/index.get.ts`、`[action].post.ts` → `[action]/index.post.ts` など）と相対 import の 1 段
- `test/server/api/projects/` の写し — 調べた結果、移動する 9 本を対象とする単体テストは 1 本も無く（既存の 2 本はいずれも移動しない handler が対象）、追随は不要と確定した（tasks 4.1）
- capability の新設（Requirement: Endpoint はディレクトリ・`index.<method>.ts`・Method ごとに handler・動的は `[param]/index.<method>.ts`）
- `spec-screen-flow.md` の本文 API の行（design で案を示し、親がユーザーの承認を取ってから反映）

## 畳む方向

`find server/api/projects -type f` がすべて `index.<method>.ts` で、本家仲介の全 endpoint が同じ URL で応答し、`yarn test`・`yarn test:e2e` が通り、`openspec validate --all --store stroke` でこの change が `✓` になること。PR が `pre3` にマージされ、親が archive すること。
