---
status: Open
origin: user
triage:
  - bug
change: fix-server-api-layout
date: 2026-09-08
---

# fix-server-api-layout

`docs/specs/api/` の規定と `server/api/` の実装を突き合わせ、docs を正として実装を直す。乖離は3種類ある——**endpoint の名前空間**（U 系・W1/W2 が `/api/sessions/` ではなく `/api/strokes/` に在る）、**handler ファイルの置き方**（`index.<method>.ts` ではなく `<name>.<method>.ts` になっている）、**昇格の name-conflict 時の判断の扱い**。加えて docs 同士の食い違いと openspec specs の未追従を、この change の責務として整合反映する。

## 事実（2026-09-08 調査）

規定は `docs/specs/api/overview.md`（名前空間）・`docs/specs/api/server.md`（置き方）・`docs/specs/api/sessions/*.md`・`docs/specs/api/ws/delivery.md`（各 endpoint）。

| # | 規定（docs） | 実装の現状 | 判定 |
| --- | --- | --- | --- |
| U1 / U2 / U3 / U7 / U9 / U12 | `/api/sessions/…` | `server/api/strokes/…` | 乖離 |
| U10（POST / DELETE） | `/api/sessions/:id/approve` | `server/api/strokes/[id]/approve.{post,delete}.ts` | 乖離 |
| U13 / U14 | `/api/sessions/:id/{invoke-agent,promote}` | `server/api/strokes/[id]/…` | 乖離 |
| U11 / U15 | `/api/sessions/:id` / `…/activate` | `server/api/sessions/[id]/` | 合っている |
| W1 / W2 | `/api/sessions/:id/ws/{question,proposal}` | `server/routes/api/strokes/[id]/ws/`。`nuxt.config.ts` の `wsPathPattern` 既定値も `/api/strokes/` | 乖離 |
| A1 / A4 / A5 / A7 / A8 | `/api/strokes/:id/…` | `server/api/strokes/[id]/` | 名前空間は合っている |
| P1 | `DELETE /api/projects/:projectId` | `server/api/projects/[projectId]/index.delete.ts` | 合っている |
| 置き方（`server.md`） | Endpoint = ディレクトリ、Method = `index.<method>.ts` | `answer.post.ts` / `overview.get.ts` / `projects.get.ts` / `info.get.ts` / `[action].post.ts` / `[name].{get,put}.ts` など、`index.` でない handler が `server/api/` に **24 本中 21 本** | 乖離 |
| U14 name-conflict | 判断を取り下げて 409 name-conflict | 判断を残したまま 409（`promote.post.ts`。コメントも「判断つきのまま残る」と明記） | 乖離 |
| U14 順序・busy・巻き戻し、U15、U11、P1、U13（503 / 409 / 200 `{}`）、A7（残す → phase → 配信）、A8（`error` のときだけ `failed` 配信）、WB の4種別 | — | 読み合わせて一致 | 合っている |

## 経緯

- `connect-portal-and-strokes`（2026-08-26 archive）の tasks 7.1 / 7.2 / 7.6 が **未チェックのまま archive** され、U11 だけが後から `sessions/` に置かれた（旧 ticket `fix-session-api-path` の記録）
- docs は 2026-09-02 の分割で `/api/sessions/` に揃えられたが、実装は追随せず、`submission-path.ts` の `activatePath` が「他の U 系が `/api/strokes/` に在るのは実装側の誤りで別 ticket が直す」と書いて U15 だけ正しい位置に置いた
- `docs/specs/api/server.md` の置き方の規定に対しては、追随する change がこれまで無かった

## 影響範囲

### A. 名前空間の移設（`/api/strokes/` → `/api/sessions/`）

- **A-1 handler** — `server/api/strokes/` の U 系 10 本（`index.get` / `index.post` / `[id]/index.get` / `strokes.get` / `answer.post` / `send-back.post` / `approve.post` / `approve.delete` / `invoke-agent.get` / `promote.post`）
- **A-2 WS route** — `server/routes/api/strokes/[id]/ws/{question,proposal}.ts` と、URL からセッション id を抜く `wsPathPattern`（`nuxt.config.ts` 既定値・`server/utils/stroke/ws-channels.ts`）
- **A-3 画面** — `app/pages/strokes/index.vue`・`app/pages/strokes/[sessionId]/index.vue`・`proposal.vue`、`app/composables/useSessionChannel.ts`（W1/W2 の URL）・`useWaitingRetry.ts`（U2 / U13）・`useProjectApi.ts`（U13）・`useProposalReview.ts`（U2 / U3 / U9 / U10 / U14 / U13）・`useAgentQuestion.ts`（基底が `/api/<id>` で、そもそも実ルートに届いていない）
- **A-4 サーバ内の自己呼び出し** — `server/utils/stroke/invoke.ts`（U13 の `invokePath`・U12 の一覧）、`server/plugins/01.reap-running.ts`・`01.activate-approved.ts`・`01.retry-failed.ts`（U12 の一覧）。A8 `submissionPath` は A 系なので触らない
- **A-5 テスト** — `test/server/api/strokes/` の U 系 8 本（`answer` / `approve.post` / `approve.delete` / `invoke-agent.get` / `invoke-agent.multiplex` / `promote` / `send-back.post` と `support.ts` の参照）、`test/app/composables/useWaitingRetry.test.ts`、`test/server/utils/stroke/sweep.test.ts`（`invokePath`）、`test/server/middleware/mcp-token.test.ts`（`/api/strokes` を U12 として列挙）、E2E 5 本（`stroke-exit` / `agent-question` / `proposal-annotation` / `proposal-persistence` / `ws-disconnect`）
- **A-6 設定・許可** — `.claude/settings.json` の `curl … /api/strokes` 許可行（U1 の疎通用）
- **触らないもの** — `server/mcp/tools/*`（A1 / A4 / A5 / A7 を叩く。A 系は `/api/strokes/` のまま）、`server/api/projects/**`（本家仲介。名前空間は合っている）

### B. handler の置き方（`<name>.<method>.ts` → `<name>/index.<method>.ts`）

- **B-1 セッション系** — A-1 と同じ 10 本＋A 系 5 本（`overview.get` / `send-back.get` / `question.post` / `proposal.post` / `submission.post`）。移設（A）と同じファイル移動で済ませる
- **B-2 プロジェクト系（本家仲介）** — `server/api/projects.get.ts`、`projects/[projectId]/info.get.ts`・`approvals/index.get.ts`・`approvals/[approvalId]/content.get.ts`・`approvals/[approvalId]/[action].post.ts`・`specs/index.get.ts`・`specs/[specName]/documents.get.ts`・`specs/[specName]/tasks.get.ts`・`specs/[specName]/[document].put.ts`・`steering/[name].get.ts`・`steering/[name].put.ts`（`index.` でない 10 本）
- **B-3 テストの写し** — `test/server/api/**` は `server/api/**` の構造を写す規定（`docs/specs/structure/system-structure.md` §2）なので、B-1 / B-2 に合わせて `answer/index.post.test.ts` の形へ動かす
- **B-4 相対 import の深さ** — 1 階層深くなるので、各 handler の `../../../utils/…` が全て 1 段増える。`test/server/utils/upstream/read-only.test.ts` は `server/utils/upstream/` を走査するだけで handler 名に依らない（確認済み）

### C. 挙動の乖離（U14 name-conflict）

- **C-1** — `server/api/strokes/[id]/promote.post.ts` の衝突確認。docs は「判断を取り下げて 409 name-conflict」、実装は判断を残す。`test/server/api/strokes/promote.post.test.ts` の該当ケースと、画面側の衝突時の再入力（`useProposalReview.ts`。docs `approve.md` は「置き換えるときは先に DELETE してから POST」）の整合

### D. docs 同士の食い違い（design.md で提案し、承認後に直す）

- **D-1** `docs/specs/api/contract.md`「各 endpoint の入出力」——U1〜U12 と W1/W2 を `/api/strokes/…` で列挙。`overview.md`・`sessions/*.md`・`ws/delivery.md` と食い違う
- **D-2** `docs/specs/structure/system-structure.md` §1（`routes/ … api/strokes/:id/ws/**`）と §4（「セッション系（`/api/strokes/**`、WS を含む）」）
- **D-3** `docs/specs/architecture/session-workflow.md`「畳み方」——`GET /api/strokes` と `POST /api/strokes/<uuid>/delete`（U11 は docs でも `DELETE /api/sessions/:id`）。「実行の記録」節の A8 表記は A 系なので合っている
- **D-4** `docs/specs/core/settings-reference.md`——`wsPathPattern` 既定値 `/api/strokes/…`
- **D-5** `docs/specs/structure/file-composables.md`——`useWaitingRetry`（`GET /api/strokes/<id>`）・`useSessionChannel`（`ws://…/api/strokes/<id>/ws/`）・`useAgentQuestion` の「契約の形は `/api/strokes/…`」の3箇所
- **D-6（判断要）** `docs/specs/plan/portal-stroke-exit.md` の現状表（`server/api/strokes/[id]/invoke-agent.get.ts` 等）——plan の「当時の現状」記述であり、直すか据え置くかを design で問う
- **D-7（判断要）** `docs/specs/api/contract.md`「セッションの参照方法」は概要入力を `/` と定めるが、`system-structure.md` §2 は「セッションへの入口はプロジェクト一覧の作成で、専用のトップページを持たない」とし、実装は `app/pages/strokes/index.vue`。API の規定ではないため、この change で直すか別起票かを design で問う

### E. openspec specs の未追従

- **E-1** `openspec/specs/server/session-management`——シナリオが `POST /api/strokes/:id/approve` / `POST /api/strokes` / `GET /api/strokes/:id/invoke-agent` / `GET /api/strokes/:id/strokes` / `GET /api/strokes`。docs に合わせて `sessions` へ直す（issue-tracker「見つけた者が直す」）
- **E-2** `docs/specs/api/server.md` の置き方に対応する capability が `openspec/specs/` に無い。物差しとして delta を起こす（置き場は design で決める。候補: `server/api-layout`）
- **E-3** `openspec/specs/api/session/*`・`api/session/ws`・`api/contract` は既に `/api/sessions/` で書かれている。delta は不要で、実装がこれに追いつく形

### F. 関連 ticket・change

- **F-1** `openspec/tickets/fix-session-api-path.md`——名前空間の移設（A）と D-1 を扱う ticket だが、**対応する change ディレクトリが無く**（issue-tracker「どちらか単独の起票を厳禁」に反する状態）、`origin` も無い。本 ticket が内容を引き継ぐ
- **F-2** `openspec/changes/fix-agent-question-api-path/`（README のみ）と同名 ticket——`useAgentQuestion.ts` の基底修正。直し先が `/api/sessions/${id}` になることは同 ticket の注意書きどおりで、A-3 に含まれる

## 必要な対応

影響範囲の項目に対応する。番号は上と同じ。

### A. 名前空間の移設

- **A-1 / B-1** `server/api/strokes/` の U 系 10 本を `server/api/sessions/` へ移し、同時に `index.<method>.ts` の形にする（`sessions/index.{get,post}.ts`・`sessions/[id]/index.get.ts`・`sessions/[id]/strokes/index.get.ts`・`sessions/[id]/answer/index.post.ts`・`sessions/[id]/send-back/index.post.ts`・`sessions/[id]/approve/index.{post,delete}.ts`・`sessions/[id]/invoke-agent/index.get.ts`・`sessions/[id]/promote/index.post.ts`）。旧 path の互換は残さない（`connect-portal-and-strokes` 7.1 の決め）
- **A-2** WS route を `server/routes/api/sessions/[id]/ws/` へ移し、`wsPathPattern` 既定値を `/api/sessions/([^/]+)/ws/{channel}(?:$|[/?#])` にする。`ws-channels.ts` の doc コメント（`/api/:id/ws/…`）も docs の path に揃える
- **A-3** 画面の U 系・W 系の参照を `/api/sessions/${id}` 基底へ揃える。`useAgentQuestion.ts` は `/api/<id>` → `/api/sessions/<id>`（F-2 の修正を兼ねる）
- **A-4** `invoke.ts` の `invokePath` と一覧取得、3 つの plugin の一覧取得を `/api/sessions` へ。`submissionPath`（A8）は変えない
- **A-5** テストを `test/server/api/sessions/**` へ写し替え、期待 path を差し替える。E2E 5 本は `request.post('/api/sessions', …)` 等へ。`mcp-token.test.ts` の列挙は U12 を `/api/sessions` に
- **A-6** `.claude/settings.json` の許可行を `/api/sessions` にする（U1 の疎通用の意図を保つ）

### B. handler の置き方

- **B-1** A-1 と同時に行う（上記）。A 系 5 本は `strokes/[id]/{overview,send-back,question,proposal,submission}/index.<method>.ts` へ
- **B-2** プロジェクト系 10 本を `index.<method>.ts` の形へ（例: `projects/index.get.ts`・`projects/[projectId]/info/index.get.ts`・`approvals/[approvalId]/[action]/index.post.ts`・`steering/[name]/index.{get,put}.ts`）。URL は変えない
- **B-3** `test/server/api/**` を新しい構造に写す
- **B-4** 相対 import を 1 段直す。`#shared` / `#imports` の alias は影響なし

### C. 挙動の乖離

- **C-1** 昇格の衝突確認で判断を取り下げてから 409 name-conflict を返す形にし、テストを docs の文言に合わせる。画面が衝突後に「先に DELETE してから POST」している箇所があれば、取り下げ済みでも 204 のまま通るので動作は変わらないことを確認する

### D. docs 同士の食い違い

- **D-1〜D-5** design.md で書き換え案を提示し、承認後に `/api/sessions/…` へ揃える（issue-tracker「上位資料への整合反映は design.md でユーザーへ提案し、承認を持って許可される」）
- **D-6 / D-7** design.md で「直す／据え置く／別起票」を挙動の差で問う。承認前は触らない

### E. openspec specs

- **E-1** `server/session-management` のシナリオを `sessions` へ直す delta を入れる
- **E-2** `server.md` の置き方を Requirement + Scenario にした delta を新しい capability として入れる
- **E-3** delta 不要（実装の追いつきで満たす）

### F. 関連 ticket・change

- **F-1** `fix-session-api-path.md` を本 ticket に畳む。ファイルの扱い（削除するか `.archive/` へ移すか）は起票時にユーザー確認
- **F-2** `fix-agent-question-api-path` は A-3 で解消する。change（README のみ）と ticket をどう閉じるかは同上

## 畳む方向

A〜C の実装と A-5 / B-3 のテストが通り、D の docs 反映が承認済みで、E の delta が `openspec validate --all` を通ること。F の旧 ticket・change の処遇が決まっていること。

## 順序制約（2026-09-08 の分解。Gitea issue #14）

この ticket の範囲は Gitea の issue に分解した（親 #14）。着手の順序は次の制約に従う。

| issue | 内容 | 制約 |
| --- | --- | --- |
| #10 | D・E-1（docs の食い違いと specs の追従） | 最初。実装より先 |
| #11 | C-1（U14 name-conflict） | #13 より先。同じ `promote.post.ts` を触るため並走させない |
| #12 | B-2・E-2（プロジェクト系の置き方） | 独立。いつでも |
| #13 | A・B-1・F-2（セッション系の移設と index 化） | #10 と #11 の後 |
| #15 | api と実処理の分離（handler への切り出し。この ticket の A〜F には無い追加の判定） | #12 と #13 の後。移動が済んでから中身を切り出す |

```
#10 ──┐
#11 ──┼──▶ #13 ──┐
#12 ─────────────┼──▶ #15
```
