## 1. 着手

- [x] 1.1 ticket `openspec/tickets/add-access-control-project.md` の `status` を `Doing` にし、`tags` に `add-access-control-project/a6786566-d43d-492b-ac94-d8e0cd2468f4` を足す

## 2. 依存と設定

- [x] 2.1 `nuxt-authorization` と `jose` を依存に足し、`nuxt.config.ts` の modules に `nuxt-authorization` を入れる。`yarn install`・`nuxt prepare`・`yarn typecheck` が通ることを確かめる
- [x] 2.2 `nuxt.config.ts` の `runtimeConfig.access` に `teamDomain`・`aud`・`admins`（design D11 の初期値）を足す
- [x] 2.3 `docs/specs/core/settings-reference.md` へ `runtimeConfig.access` の表と `### access` の節を足す

## 3. 判定（`server/utils/access/`）

- [x] 3.1 token の検証（`jose` の `createRemoteJWKSet` と `jwtVerify`。署名・有効期限・`aud`・`iss`）を書き、unit test で有効・偽の署名・期限切れ・`aud` 違いを確かめる
- [x] 3.2 接続元ネットワーク（CIDR）とホスト名の照合を書き、unit test で確かめる
- [x] 3.3 `<projectShareRoot>/.stroke-board/access.json` の読み書き（無ければ空、メールアドレスは小文字、一時ファイルから rename）を書き、unit test で確かめる
- [x] 3.4 Nitro plugin の `request` hook で利用者と管理者を求めて `event.context` に置き、`resolveServerUser` を返す。`x-forwarded-for` が無ければ socket のアドレスを入れる（design D4）。`/mcp` は対象にしない
- [x] 3.5 内部 token と `internalFetch` を書き、`request` hook で内部 token が一致したら判定せずに通す。`server/` から自分の API を呼ぶ素の `$fetch` をすべて `internalFetch` に置き換え、grep で残りが無いことを確かめる
- [x] 3.6 ability（`viewProject`・`viewSession`・`manageAccess`）を `shared/utils/abilities.ts` に書く
- [x] 3.7 `docs/specs/structure/system-structure.md` と `docs/specs/structure/server-structure.md` へ `server/utils/access/` を足す

## 4. API

- [x] 4.1 `server/api/projects/[projectId]/**` の全 endpoint で `viewProject` を見て、false なら 404 を投げる
- [x] 4.2 `server/api/sessions/[id]/**` と `server/api/strokes/[id]/**` の全 endpoint で `viewSession` を見て、false なら 404 を投げる
- [x] 4.3 `GET /api/projects`・`GET /api/sessions`・`GET /api/sessions/unfinished` の行を、要求した利用者が見られるものに絞る
- [x] 4.4 `POST /api/sessions` で `state.json` に `startedBy` を書く。`docs/specs/core/schema.md` へ `startedBy` と `access.json` の節を足す
- [x] 4.5 昇格（U14）のとき、`startedBy` の利用者に `access.json` で許可を付ける
- [x] 4.6 ユーザー管理の API（登録の取得と保存）を足し、`manageAccess` が false なら 404 を投げる
- [x] 4.7 画面が自分の利用者を知るための API（メールアドレス・管理者か・許可のあるプロジェクト）を足す
- [x] 4.8 API の判定を、一般の利用者・許可のある利用者・管理者・内部 token の4通りで test する

## 5. WebSocket と通知

- [x] 5.1 W1 / W2（`server/routes/api/sessions/[id]/ws/question.ts`・`proposal.ts`）で、接続が開いたときに利用者を判定し、見られないセッションなら何も送らずに閉じる（design D6）
- [x] 5.2 `/ws`（`server/routes/ws.ts`）で peer ごとに判定の結果を持ち、`server/utils/control/board.ts` の `snapshot`・`notification`・`project-creation` を peer が見られるプロジェクトに絞って送る
- [x] 5.3 通知の絞り込みを test する（許可の無いプロジェクトの通知が届かない）

## 6. server 側の検証

- [x] 6.1 `yarn test`・`yarn typecheck`・`yarn spec` が通る
- [x] 6.2 `yarn dev` で、token の無い LAN の接続について、外側のリクエスト・SSR の `useFetch` の内部呼び出し・WebSocket の3つが同じ接続元で判定されることを実測する（design D4）。確かめた後にサーバーを止める
- [x] 6.3 巡回・エージェントの提出・MCP ツールが 404 にならずに動くことを `yarn check:stroke` で確かめる

## 7. 画面（`update-screen-flow-responsibility` が develop に入った後）

- [x] 7.1 `git rebase develop` し、`docs/specs/architecture/screen-flow.md` へ `/admin/users`・一覧上部のリンク・404 を足す
- [x] 7.2 Nuxt plugin で `resolveClientUser` を 4.7 の API から返す
- [x] 7.3 `app/middleware/access.global.ts` で `/projects/[projectId]/**`・`/strokes/[sessionId]/**`・`/admin/**` を開いたときに見られなければ 404 にする
- [x] 7.4 `/admin/users` の画面（利用者ごとの行とプロジェクトの選択、利用者の追加と削除、管理者のメールアドレス・接続元ネットワーク・ホスト名の編集）を作る
- [x] 7.5 プロジェクト一覧の上部に、管理者にだけ「ユーザー管理」のリンクを出す
- [x] 7.6 E2E で、一般の利用者・管理者それぞれの一覧・404・`/admin/users` を確かめる

## 8. 完了

- [x] 8.1 Cloudflare Access application の AUD tag をユーザーから受け取り、`runtimeConfig.access.aud` に入れる
- [x] 8.2 ユーザーから完了の承認を得て、ticket の `status` を `Wait-for-archive` にする
