---
status: Wait-for-archive
change: add-access-control-project
origin: user
tags:
  - proposal
  - specs
  - design
  - tasks
  - add-access-control-project/a6786566-d43d-492b-ac94-d8e0cd2468f4
---

# add-access-control-project

一覧に出るプロジェクトごとに、登録されたメールアドレス単位でアクセスを許可する。ログイン画面は作らない。inet250-gateway が提供する Cloudflare Access の認証を通過したリクエストに付く token header（`Cf-Access-Jwt-Assertion`）から、stroke-board 側で利用者を判別する。

## 事実

起票時点で分かっていること。

- 利用者の入口は Cloudflare Tunnel（cloudflared）で、Cloudflare Access が守る。origin には `Cf-Access-Jwt-Assertion` が届く。cloudflared は `originRequest.access` の設定で、WebSocket の upgrade 要求も含めて JWT を検証してから origin へ流す（cloudflared の `proxy/proxy.go`・`ingress/middleware/jwtvalidator.go`）
- inet250 はゲストのメールアドレスを Cloudflare Access ポリシーへ登録し、`GET /api/access/emails` で一覧を返す。inet250 の中継（`X-Auth-Email` を付ける経路）は WebSocket を通さない
- stroke-board の画面は `app/pages/` 配下、API は `server/api/` 配下、WebSocket は `server/routes/ws.ts`・`server/routes/api/sessions/[id]/ws/question.ts`・`server/routes/api/sessions/[id]/ws/proposal.ts` の3本
- Nitro の WebSocket upgrade は `server/middleware/` と Nitro の `request` hook を通らない。検査は各 WebSocket handler の `upgrade` で行う必要がある
- `server/utils/control/board.ts` は通知を全プロジェクト分、全ての接続先へ同じ内容で配っている
- `/mcp` はエージェントが bind したアドレスへ直接つなぐ。Cloudflare の header は付かず、`server/middleware/mcp-token.ts` の token で守っている
- セッション（ストローク）には作成者を表す項目が無い
- `nuxt-authorization` 0.3.5 の `authorize` は、AuthorizationError 以外の例外を握り潰して通す（GitHub issue #77、open）。`allows` と `denies` は握り潰さない

## ユーザーが確定させたこと

- ログイン画面は作らない。利用者の判別は Cloudflare Access の token header で行う
- 認可には `nuxt-authorization` を使う
- アクセス制限は基本的に全画面に入れる
- ユーザー管理画面が要る前提で設計する
- 実装は worktree `pre2`（ブランチ `add-access-control-project`）で行う

## 未決

- Cloudflare を通らない LAN・Tailscale からのアクセスの扱い
- セッション（プロジェクトになる前）を誰に見せるか
- 利用者とプロジェクトの割り当ての保存先
- 管理者の判定方法
- ユーザー管理画面の遷移と責務範囲（`docs/specs/architecture/screen-flow.md` への反映を含む）
