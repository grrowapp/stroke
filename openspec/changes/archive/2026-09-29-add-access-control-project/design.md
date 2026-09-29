## Context

判定の規則と絞り込みの範囲は specs（`access/identity`・`access/permission`・`access/user-management`）にある。ここでは実装の形と、上位資料への反映の提案を持つ。

実装を縛る事実（`node_modules` のソースで確認）。

- Nuxt 4.5.2 / nitropack 2.13.4 / h3 1.15.11 / crossws 0.3.5
- SSR 中の `useFetch('/api/...')` は元のリクエストの header をほぼすべて転送する（`cf-access-jwt-assertion`・`host`・`x-forwarded-for` を含む）。接続元の socket のアドレスは転送されない
- サーバー内部の `$fetch('/api/...')`（plugin・`server/utils/stroke/invoke.ts`・MCP ツールなど）は同じプロセスの中で処理され、header は渡したものだけ、`host` は `localhost`、接続元のアドレスは空になる
- WebSocket の `upgrade(request)` で読めるのは URL と header だけで、接続元のアドレスは公開の API に無い。接続後の `peer.remoteAddress` では取れる。upgrade を断るには `Response` を return か throw する
- `nuxt-authorization` 0.3.5 は認可の primitive（`defineAbility`・`allows`・`denies`・`authorize`）だけを持ち、route の保護は持たない。server 側の利用者は Nitro の `request` hook で `event.context.$authorization.resolveServerUser` に入れる。`authorize` は AuthorizationError 以外の例外を握り潰す
- `jose` は `@modelcontextprotocol/sdk` 経由の推移的依存としてだけ入っている
- 画面から呼ぶ素の `$fetch` はすべて操作の関数の中にあり、SSR の間には走らない（`app/` を grep して確認）
- 稼働中の cloudflared が stroke-board の hostname に JWT の検証を掛けているかは、ここからは確かめられない

## Goals / Non-Goals

**Goals:**

- 判定を1箇所で行い、画面・API・WebSocket・通知が同じ結果を使う
- 既存の handler と画面の中身に手を入れる量を、判定の呼び出しに留める

**Non-Goals:**

- inet250 側の変更（ゲストの登録、Access ポリシー）
- ログイン・ログアウト・セッション cookie

## Decisions

### D1: 判定は Nitro の `request` hook で1回だけ行い、`event.context` に置く

`server/utils/access/` に判定をまとめ、Nitro plugin の `request` hook で次を求めて `event.context` に置く。`nuxt-authorization` の `resolveServerUser` はこれを返すだけにする。

- token があれば検証し、メールアドレスを利用者とする。管理者に指名されていれば管理者
- token が無ければ、接続元のアドレス（`getRequestIP(event, { xForwardedFor: true })`）と host を登録と照らし、当たれば管理者
- 検証に通らない token は、利用者なし・管理者でもないとして扱う

次の2つはこの判定を使わない。

- `/mcp` — `server/middleware/mcp-token.ts` がそのまま守る
- サーバー内部の呼び出し — D3 の内部 token で通す

- **なぜ hook か** — 判定の材料（token・接続元・host）はリクエストごとに決まり、どの endpoint でも同じである。endpoint ごとに求めると、求め方が割れる
- **不採用: `server/middleware/` で拒否まで行う** — 404 にするかどうかは対象（どのプロジェクトか）で決まり、それを知っているのは api である（`docs/specs/structure/system-structure.md`「どの局面を許すかの判定は api が持ち handler は持たない」）

### D2: token の署名は stroke-board でも検証する

`jose` の `createRemoteJWKSet` で `https://royal-frost-b225.cloudflareaccess.com/cdn-cgi/access/certs` の公開鍵を引き、`jwtVerify` で署名・有効期限・`aud`・`iss` を確かめる。鍵は `kid` で引かれ、ローテーションには `jose` の取り直しが追随する。

- **なぜ** — 稼働中の cloudflared が検証しているかを stroke-board から確かめられない。header は誰でも付けられるので、検証しないと任意のメールアドレスを名乗れる
- **`jose` を直接の依存に足す。**推移的依存のままだと、`@modelcontextprotocol/sdk` の更新で消えうる
- `aud` の値（Access application の AUD tag）は repo のどこにも無い。デプロイ前にユーザーから受け取り `runtimeConfig` に入れる

### D3: サーバー内部の呼び出しは、利用者の判定とは別の内部 token で通す

サーバーが自分の API を呼ぶ経路（巡回の plugin・`server/utils/stroke/invoke.ts`・`server/utils/stroke/ai.ts`・`server/handler/promote.ts`・MCP ツール）は、`server/utils/access/` の `internalFetch` 1つから呼ぶ。`internalFetch` は、プロセスの起動時に乱数で作った内部 token を header に付ける。`request` hook はこの header が一致すれば判定を行わずに通す（管理者と同じく、すべてを見られる）。

- **なぜ** — `/mcp` と同じく、利用者の判定と別の仕組みにすると、管理者の登録を画面でどう編集しても内部の呼び出しは壊れない。内部 token はプロセスのメモリにだけあり、外へ出ない
- **不採用: 内部の呼び出しを host `localhost` の登録で通す** — 画面で編集できる管理者の登録に内部の呼び出しが頼ることになり、その値を消すと巡回・提出・MCP ツールがすべて 404 になる
- **不採用: 同じプロセスの中の呼び出しであること（接続元のアドレスが空）で見分ける** — SSR の `useFetch` の内部呼び出しも同じ形で来るので、画面のリクエストと見分けられない
- **守ること** — サーバーから自分の API を呼ぶときは素の `$fetch` を使わず `internalFetch` を使う。素の `$fetch` で呼んだ経路は判定に掛かり、404 になる（壊れ方が見える側に倒れる）

### D4: SSR の内部呼び出しに接続元のアドレスを残す

SSR の `useFetch` は header を転送するが、socket のアドレスは転送しない。token の無い LAN の接続で、ページの SSR が呼ぶ API の判定が外側と割れないよう、`request` hook で外側のリクエストに `x-forwarded-for` が無ければ socket のアドレスを入れておく。転送される header に乗り、内部の呼び出しでも同じ接続元で判定される。

- 実際の起動形（`nuxt dev` の proxy の有無）で、外側・SSR の内部呼び出し・WebSocket の3つが同じ接続元になることを実測してから確定する（tasks に入れる）

### D5: API は対象ごとに判定を呼び、許可が無ければ 404 を投げる

ability を `shared/access.ts` に置き、画面とサーバーで同じ定義を使う（既存の `#shared/*` の置き方に揃える）。

- `viewProject(user, projectName)` — 管理者、または許可がある
- `viewSession(user, session)` — 管理者、または始めた利用者が本人
- `manageAccess(user)` — 管理者

各 api は `allows` の結果を見て、false なら `createError({ statusCode: 404 })` を投げる。`authorize` は使わない。AuthorizationError 以外の例外を握り潰して通すため（`nuxt-authorization` issue #77）。

一覧を返す api（`GET /api/projects`・`GET /api/sessions/unfinished`）は、行を `viewProject` / `viewSession` で絞って返す。

### D6: WebSocket は接続が開いたときに判定する

upgrade は `request` hook を通らず、公開の API では接続元のアドレスも取れない。判定は `open` で1回だけ行う。peer の header（token・host・`x-forwarded-for`）と `peer.remoteAddress` から利用者を求める。

- W1 / W2 は、見られないセッションなら何も送らずに閉じる
- 通知の `/ws`（`server/utils/control/board.ts`）は、peer ごとに利用者を持ち、`snapshot`・`notification`・`project-creation` の3つを、その peer が見られるプロジェクトに絞って送る。通知は本家の `projectId` しか持たないので、送る前に名前を引く

### D7: 許可と管理者の登録は保存先の下の JSON 1本に持つ

`<projectShareRoot>/.stroke-board/access.json` に持つ。

```json
{
  "users": { "guest@example.com": ["alpha", "beta"] },
  "admins": { "emails": [], "networks": [], "hosts": [] }
}
```

- メールアドレスは小文字にして保存する。プロジェクトはディレクトリ名（`ProjectSummary.name`）で持つ。`projectId` は未接続・生成中で null になるので使わない
- 書き込みは一時ファイルへ書いて rename する
- **なぜ保存先の下か** — セッションとプロジェクトと同じ親に置けば、worktree を替えても同じ許可を見る。直下の走査は `.spec-workflow` か `state.json` を持つディレクトリしか拾わないので、一覧に混ざらない
- 管理者の判定には、`runtimeConfig` の初期値と `access.json` の `admins` を合わせて使う

### D8: 始めた利用者は `state.json` に持つ

`state.json` に `startedBy`（メールアドレス、または token の無い接続なら null）を足す。`POST /api/sessions` で書く。昇格（U14）のとき、この値の利用者に `access.json` で許可を付ける。昇格は内部の呼び出しから来ることがあるので、呼び出し元ではなく `startedBy` を使う。

既存の `state.json` に `startedBy` は無い。無いものは null と読み、管理者にだけ見える（specs の「既にあるプロジェクト」と同じ扱い）。

### D9: 画面は global の route middleware で 404 の画面にする

`app/middleware/access.global.ts` が、`/admin/**`・`/projects/[projectId]/**`・`/strokes/[sessionId]/**` を開いたときに見られるかを確かめ、見られなければ `showError({ statusCode: 404 })` にする。別の URL へは移さない。

- `/admin/**` は `manageAccess` を `allows` で見る。画面側の利用者は `app/plugins/authorization.ts` が `/api/access/me` から取る
- `/projects/**`・`/strokes/**` は `GET /api/access/check` に問う。**対象が無いときは 204 を返す**——無いときの振る舞い（`/strokes/<sessionId>` なら `/` へ移す）は各画面が持ち、ここで塗り替えない（`docs/specs/architecture/screen-flow.md`「見られない対象の URL は 404」）
- 一覧上部の「ユーザー管理」のリンクは `manageAccess` を `Can` で包む

### D10: 作業の順番 — server 側を先に、画面は screen-flow の後に

`docs/specs/architecture/screen-flow.md` はまだ無く、change `update-screen-flow-responsibility` が作る。衝突を避けるため次の順で進める。

1. server 側（判定・内部 token・API の 404・WebSocket・通知の絞り込み・保存）を先に実装する
2. `update-screen-flow-responsibility` が develop に入ったら rebase し、`screen-flow.md` へ `/admin/users`・一覧上部のリンク・404 を足す
3. その後に画面（route middleware・`/admin/users`・リンク）を実装する

### D11: 管理者の初期値

`runtimeConfig.access.admins` の初期値は、メールアドレスとホスト名を空、接続元ネットワークを `127.0.0.1/32`・`::1/128`・`192.168.1.0/24`・`100.64.0.0/10`（Tailscale）とする。`access.json` が無いあいだはこの初期値で判定し、ユーザー管理画面で保存した時点から `access.json` の内容だけを使う。初期値も画面から足し引きでき、限定は設けない。

## 上位資料への反映（承認が要る）

`docs/agents/issue-tracker.md`「更新対応」により、承認を得てから書く。

- `docs/specs/core/settings-reference.md` — 「`nuxt.config.ts` — `runtimeConfig`」の表に `access.teamDomain`・`access.aud`・`access.admins.emails`・`access.admins.networks`・`access.admins.hosts` を足し、`### access` の節を足す。画面で編集した許可と管理者は設定ではなくデータで `access.json` に置く、と書く
- `docs/specs/core/schema.md` — `state.json` の項目に `startedBy` を足し、`access.json` の節を足す
- `docs/specs/structure/system-structure.md` — server の置き場の `utils/` の区分に `access`（利用者の判定と許可）を足す
- `docs/specs/structure/server-structure.md` — `server/utils/access/` のファイルを足す
- `docs/specs/architecture/screen-flow.md` — D10 の 2

## Risks / Trade-offs

- [`nuxt-authorization` は `@nuxt/kit ^3` に依存し、Nuxt 4 の型の issue #71・#41 が open] → 最初のタスクで `yarn install`・`nuxt prepare`・`yarn typecheck` が通ることを確かめる。通らなければその時点で報告する
- [サーバーから自分の API を素の `$fetch` で呼ぶ経路が後から入ると、その経路だけ 404 になる（D3）] → `internalFetch` の doc に書き、tasks で `server/` の素の `$fetch` が残っていないことを grep で確かめる
- [`aud` が入るまで token を検証できない] → `aud` が空のあいだは token を持つリクエストを利用者なしとして扱う。一般の利用者は何も見えないが、管理者の接続元からは使える
- [Cloudflare の公開鍵を取りに行けない] → `jose` の取得が失敗したリクエストは検証に通らないものとして扱う

## Migration Plan

- 入れた時点で `access.json` は無い。無ければ空として読む。既存のプロジェクトはどの利用者にも許可が無い状態で始まる
- 戻すときは、この change の commit を revert する。`access.json` と `state.json` の `startedBy` は残っても読まれないだけである
