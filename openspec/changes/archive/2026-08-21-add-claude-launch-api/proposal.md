## Why

claude の起動（`invokeAi`）が overview / answer / send-back の3つの API ハンドラに個別に埋め込まれており、入口が分散している。さらに、アクションの受理という API の処理の中に AI の起動が同居しているため、受理と起動の責務が癒着している。起動の入口を1本の API として独立させ、この2つを解消する。

## What Changes

- AI 起動を担う専用 endpoint（起動 API）を1つ新設する。claude 起動の唯一の入口とする。メソッドは GET とし、セッション id はパスで受ける。body・パラメータは持たない。
- **BREAKING** overview / answer / send-back の各 endpoint から AI 起動を取り除き、入力の受理と状態更新のみで完結させる。これらの API を呼んだだけでは AI は走らない。
- フロントエンドは、概要の投稿（`POST /api/overview`）・回答の送信（`POST /api/[id]/answer`）・差し戻しの送信（`POST /api/[id]/send-back`）のそれぞれについて、受理の成功応答を受け取った直後に起動 API を呼ぶ。
- 初回か継続か（`--session-id` / `--resume`）と渡す定型（初回定型・続きを促す定型）の判定は `invokeAi` 側が持ち、セッション一覧との符合から導く（符合すれば継続、無ければ初回）。呼び出し側（フロントエンド・endpoint）は起動の中身を指定しない。`invokeAi` の外部インターフェースから `prompt` / `first` を外す。
- 実行環境の準備（セッションディレクトリ内の openspec ルート初期化・スキーマ設定）は、セッション作成時から初回起動時へ移し、`invokeAi` が自分で行う。一覧には実行環境の揃ったセッションだけが載る。
- 渡す定型（初回の定型・続きを促す定型）は、コードに埋めず設定値として外に出す。変更は再ビルドなしで次回の呼び出しから反映される。
- 既存の起動セマンティクス（リトライ・提出待ち・タイムアウト・失敗時の `invocation: failed`）は変えず、起動 API の背後に集約する。
- 同一セッションの多重起動は受け付けない。busy ガード（`beginRun` / `endRun`）の呼び出し責務は受理側の endpoint から起動 API 側へ移る。
- 承認後（phase `approved`）のセッションへの起動要求・回答・差し戻しは受理しない。差し戻しは、proposal が出る前（phase `stroking`）のセッションにも受理しない。

## Capabilities

### New Capabilities

- `api/invoke-agent`: AI 起動を担う endpoint。claude 起動の唯一の入口であり、初回・継続の判別と渡す定型をセッションの状態から導く。同一セッションの多重起動を受け付けない。
- `api/overview`: 概要の投稿を受理する endpoint。セッションの作成と状態更新で完結し、AI の起動を含まない。
- `api/answer`: 回答を受理する endpoint。記録と状態更新で完結し、AI の起動を含まない。
- `api/send-back`: 差し戻しを受理する endpoint。指摘の記録と状態更新で完結し、AI の起動を含まない。

### Modified Capabilities

- `api/session`: 一覧に載る条件を変更する。実体の揃ったセッション（ディレクトリ・openspec ルート・ワークフロースキーマ設定済み）だけが載り、作成直後（初回起動前）のセッションは載らない。ai-invocation の初回判定がこの一覧との符合を使う。
- `ai-invocation`: 初回か継続かの判定の規定を加える。判定は呼び出し側から受け取らず、セッション一覧との符合から導く。初回は実行環境を整えた上で新しい会話を開始する。渡す定型もその判定に従う。既存の「同一セッションの往復は会話として継続する」は、この判定を前提とする形に修正する。あわせて、定型を設定値として外に出し、再ビルドなしで変更できる規定を加える。
- `stroke-session`: 概要の投稿・回答の送信の受理挙動は `api/overview` / `api/answer` が規定する。ここからは受理挙動の規定を削除し、画面と進行（ユーザーが投稿・回答すると問いが表示される流れ）の規定を残す。
- `proposal-review`: 差し戻しの受理挙動は `api/send-back` が規定する。ここからは受理挙動の規定を削除し、画面と進行（差し戻すと proposal が出し直される流れ）の規定を残す。

## Impact

- `server/api/overview.post.ts` / `server/api/[id]/answer.post.ts` / `server/api/[id]/send-back.post.ts` — `invokeAi` 呼び出しと busy ガードの除去
- 起動 API の endpoint を新設（パス・命名は design で決める）
- `server/utils/ai.ts` — `prompt` / `first` を引数から外し、初回・継続の判定を `invokeAi` 内でセッション一覧との符合から導く。初回は実行環境の準備も行う
- `server/utils/session-core.ts` — セッション作成から openspec ルート初期化を外す（`invokeAi` の初回処理へ移設）。一覧は実行環境の揃ったセッションだけを載せる
- フロントエンド — 概要投稿・回答送信（画面1）と差し戻し送信（画面2）の成功応答後に、続けて起動 API を呼ぶ処理の追加
- `docs/api-contract.md` — endpoint の追加と、アクション API の挙動変更の記載
