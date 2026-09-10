---
status: Wait-for-archive
origin: agent
triage:
  - enhancement
change: update-project-api-handler
date: 2026-09-09
tags:
  - update-project-api-handler/92d3ea72-e0cf-4412-a969-d5e6aaab99d7
---

# update-project-api-handler

capability `server/api-handler`（`update-session-api-handler` が新設）を、**プロジェクトの endpoint（本家仲介）**に適用する。api は HTTP 固有の準備と後始末だけを持ち、実処理（本家 REST の呼び出しと詰め替え、`projectId` から名前を引く走査）は `server/handler/` に切り出す。URL・入出力・本家との仲介の挙動は変えない。docs には触れない。

## 経緯

親 change `fix-server-api-layout`（ユーザー指示 2026-09-08「api は handler を持つ、REST コール受付のインターフェースとする」）から派生。Gitea issue [#19](http://192.168.1.202/gitea/grrowapp/stroke/issues/19) の内容を1本の子 change にしたもの。現状の判定・修正するファイル・完了条件は issue の本文が持つ。物差しは `openspec/specs/server/api-handler`（新しい capability は作らない）。

## 直すもの

- 実処理を持つ 4 本 — `server/api/projects/index.get.ts`・`[projectId]/approvals/[approvalId]/[action]/index.post.ts`・`[projectId]/specs/[specName]/[document]/index.put.ts`・`[projectId]/steering/[name]/index.put.ts`
- P1 `[projectId]/index.delete.ts` — `resolveName`（`projectId` から保存先を走査して名前を引く）を handler へ。`toHttp` を消し、`update-session-api-handler` が `server/utils/stroke/conflict.ts` に出した `deleteErrorToHttp` を使う（同じ処理を 2 箇所に書かない）
- 局面の述語（`DELETABLE`）は api に残す（`docs/specs/api/projects/delete.md`「どの局面のものを許すかは各 endpoint が持つ」）
- 実処理のテストを `test/server/handler/` へ寄せ、api のテストは返し方だけにする

## 畳む方向

`server/api/projects/**` が capability `server/api-handler` の Scenario を満たし、`toHttp` が 1 つになり、`yarn test`・`yarn test:e2e` が通って本家仲介の応答が変わらないこと。PR が `pre3` にマージされ、親が archive すること。
