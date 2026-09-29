## Why

stroke-board は Cloudflare Access の背後に置かれ、inet250 がゲストとして登録したメールアドレスの利用者が外から入ってくる。今はどの利用者にも全プロジェクト・全ストロークが見え、操作もできる。誰にどのプロジェクトを見せるかを、登録されたメールアドレスごとに管理者が決められるようにする。

## What Changes

- 利用者を、Cloudflare Access を通ったリクエストに付く token（`Cf-Access-Jwt-Assertion`）のメールアドレスで判別する。ログイン画面は作らない。token は stroke-board 側でも署名を検証する
- 利用者と管理者を次の規則で判定する
  - token があれば、token のメールアドレスが利用者。管理者に指名されたメールアドレスなら管理者
  - token が無ければ、登録された接続元ネットワーク（例 `192.168.1.0/24`）またはホスト名（例 `xxx.grrow.app`）からの接続を管理者とする
- プロジェクトごとに許可を持つ。許可に段階は無く、許可された利用者はそのプロジェクトで今できる操作をすべてできる。管理者はすべてのプロジェクトとストロークに入れる
- 許可の無いプロジェクトは一覧・通知に出さない。その下層の URL と API は 404 を返す。WebSocket も許可の無いプロジェクト・ストロークの接続と配信を行わない
- 一般の利用者も作成できる。ストロークを始めた時点で始めた利用者のメールアドレスを記録し、作成途中のストロークは始めた本人と管理者にだけ見せる。プロジェクトへ昇格したら始めた本人に許可を付ける
- この機能を入れた時点で既にあるプロジェクトは、管理者にだけ見える状態で始める
- ユーザー管理画面 `/admin/users` を新設する。プロジェクト一覧の上部に管理者にだけ入口のリンクを出す。利用者（メールアドレス）ごとに見せるプロジェクトを選び、管理者に指名するメールアドレス・管理者として通す接続元ネットワークとホスト名も同じ画面で編集する。管理者でない利用者には 404 を返す
- エージェントが使う `/mcp` は今の token のまま守り、利用者の判別の対象にしない
- 認可には `nuxt-authorization` を使う

## Capabilities

### New Capabilities

- `access/identity`: リクエストから利用者を判別し、管理者かどうかを判定する
- `access/permission`: 許可に基づいて、プロジェクト・ストロークの画面・API・WebSocket・通知を利用者ごとに絞り込む
- `access/user-management`: 管理者が許可・管理者の指名・管理者として通す接続元を編集するユーザー管理画面

### Modified Capabilities

- `project/directory`: 一覧に並ぶのは、見ている利用者に許可のあるプロジェクトだけになる
- `notification-feed`: 通知の一覧に並ぶのは、見ている利用者に許可のあるプロジェクトの通知だけになる
- `api/session/list`: 返すのは、要求した利用者が見られるセッションとプロジェクトだけになる
- `api/session/unfinished`: 返すのは、要求した利用者が見られるセッションだけになる

## Impact

- 画面: `app/pages/` 全体（許可の判定と 404）、`app/pages/projects/index.vue`（管理者向けの入口）、新設の `/admin/users`
- API: `server/api/projects/**`・`server/api/sessions/**`・`server/api/strokes/**` の全 endpoint、新設のユーザー管理用 API
- WebSocket: `server/routes/ws.ts`・`server/routes/api/sessions/[id]/ws/question.ts`・`server/routes/api/sessions/[id]/ws/proposal.ts`、配信の絞り込みで `server/utils/control/board.ts`
- データ: ストロークの `state.json` に始めた利用者の項目が増える。許可と管理者の登録を保存する場所が増える
- 設定: token の検証に要る値と管理者の初期値が `runtimeConfig` に増える
- 依存: `nuxt-authorization` を追加する。token の署名検証に Cloudflare Access の公開鍵（`https://royal-frost-b225.cloudflareaccess.com/cdn-cgi/access/certs`）を取りに行く
- docs: `docs/specs/core/schema.md`・`docs/specs/core/settings-reference.md`・画面遷移の docs への反映が要る（design.md で提案する）
