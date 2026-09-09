---
status: Open
change: fix-session-api-path
triage:
  - bug
---

# fix-session-api-path

docs が `/api/sessions/` と定めている U 系の endpoint と W1 / W2 の配信が、実装では `/api/strokes/` に置かれている。docs が正なので実装が間違いであり、直す。

## 事実（2026-09-02）

`docs/specs/api/overview.md` はディレクトリごとに endpoint を分けている。

| 置き場 | 何が入るか | 実装の現状 |
| --- | --- | --- |
| `/api/sessions/` | U1 / U2 / U3 / U7 / U9 / U10 / U11 / U12 / U13 / U14、W1 / W2 | **U11 だけ** `server/api/sessions/[id]/index.delete.ts` に在る。残りは `server/api/strokes/` |
| `/api/strokes/` | A1 / A4 / A5 / A7 / A8（エージェント向け） | `server/api/strokes/[id]/` に在る。**ここは合っている** |
| `/api/projects/` | P1 | 合っている |

`docs/specs/api/sessions/approve.md` / `promote.md` / `invoke-agent.md` / `delete.md` と `ws/delivery.md` も、いずれも `/api/sessions/:id/...` で書かれている。

## 経緯

移設は `connect-portal-and-strokes`（2026-08-26 archive）の tasks に載っていたが、**未チェックのまま archive された**。

```
- [ ] 7.1 U 系・W 配信のルートを `/api/sessions` 系へ移す（`server/api/` のディレクトリ移設。旧 path の互換は残さない）
- [ ] 7.2 U11 を `DELETE /api/sessions/:id` にする
- [ ] 7.6 エージェントスキルの U3 参照 path を `/api/sessions/:id/strokes` へ直す。A 系の path は変えない
```

7.2 に当たる U11 だけが後で `sessions/` に置かれ、他は残った。docs は 2026-09-02 の分割（`docs/specs/api/` を endpoint ごとに分ける）で `/api/sessions/` に揃えられたが、実装は追随していない。

## 触るもの

- **`server/api/strokes/` → `server/api/sessions/`** — U1 / U2 / U3 / U7 / U9 / U10（POST と DELETE）/ U12 / U13 / U14 と、W1 / W2 の `ws/` を移す。A 系（`overview` / `send-back.get` / `question` / `proposal` / `submission`）は `strokes/` に残す
- **画面の呼び出し** — `app/pages/strokes/index.vue`、`app/pages/strokes/[sessionId]/index.vue`、`app/pages/strokes/[sessionId]/proposal.vue`、`app/composables/useProposalReview.ts`、`useWaitingRetry.ts`、`useProjectApi.ts`、`useSessionChannel.ts`（W1 / W2）
- **サーバ内から U13 を叩いている箇所** — `server/utils/stroke/invoke.ts`、`ai.ts`、`server/plugins/01.retry-failed.ts` などに `/api/strokes/.../invoke-agent` の参照が無いか確認して直す（A8 `submission` の参照は A 系なので変えない）
- **テスト** — `test/server/api/strokes/` の U 系（`approve.*` / `promote.*` / `invoke-agent.*` / `send-back.post`）、`test/app/composables/useWaitingRetry.test.ts`、E2E 5本（`stroke-exit` / `ws-disconnect` / `agent-question` / `proposal-annotation` / `proposal-persistence`）。ディレクトリも `test/server/api/sessions/` へ
- **openspec specs** — `specs/server/session-management` のシナリオが `POST /api/strokes/:id/approve` / `GET /api/strokes/:id/invoke-agent` / `GET /api/strokes/:id/strokes` / `GET /api/strokes` で書かれている。docs に合わせて `sessions` へ直す（`docs/agents/issue-tracker.md`「更新対応」の「見つけた者が直す」）

## docs 側の食い違い（design で提案してから直す）

`docs/specs/api/contract.md`「各 endpoint の入出力」は U1〜U12 と W1 / W2 を `/api/strokes/...` で列挙したままで、同じ docs の `overview.md` と食い違っている。docs の書き換えは design.md で提案し、承認を得てから行う。

## 関連

- [[fix-agent-question-api-path]] — `useAgentQuestion.ts` の基底を `/api/strokes/${id}` へ直すとしているが、**直し先は `/api/sessions/${id}` になる**。あちらの起票時の注意書き（`connect-portal-and-strokes` の 7.x で形が変わる）が、この ticket で現実になる
- [[add-activated-phase]] — U15 `POST /api/sessions/:id/activate` を `server/api/sessions/[id]/` に置く前提。この ticket が先に済んでいなくても U15 は `sessions/` に置く
