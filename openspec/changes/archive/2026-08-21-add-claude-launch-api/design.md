## Context

動機は proposal.md - Why を参照。現状の構造は次のとおり。

- `invokeAi({ sessionId, prompt, first })` が `server/utils/ai.ts` にあり、overview / answer / send-back の3ハンドラがそれぞれ `firstPrompt() / first: true` または `continuePrompt() / first: false` を決め打ちで渡して fire-and-forget で呼ぶ
- busy ガード（`beginRun` / `endRun`、`server/utils/running.ts`）の呼び出しも3ハンドラ側にある
- AI の応答は HTTP レスポンスに載らず、エージェントの提出（agent-api）→ WS でフロントへ届く。受理 endpoint は即応答で完結している
- ユーザーの入力（概要・回答・指摘）は agent-api の取得 endpoint から AI が読む。prompt に入力本文は載らない

## Goals / Non-Goals

**Goals:**

- claude 起動の入口を endpoint 1本に集約し、受理系 endpoint から起動の知識（定型・初回判定・busy）を消す
- `invokeAi` のインターフェースを `sessionId` のみにする

**Non-Goals:**

- セッション作成の分離（`api/create-session` の類は作らない。overview が作成+受理を担う現行のまま）
- 起動のキュー化・状態監視駆動（フロントが明示的に呼ぶ、以上のことはしない）
- リトライ・提出待ち・タイムアウトのセマンティクス変更（`invokeAi` 内部は現行維持）

## Decisions

### 1. endpoint は `GET /api/[id]/invoke-agent`

- メソッドは GET（ユーザー決定・proposal に記載）。セッション id はパスで受け、body・クエリを持たない
- パス名は capability 名 `api/invoke-agent` に揃える。ファイルは `server/api/[id]/invoke-agent.get.ts`
- 代替案: `POST /api/[id]/invoke`（既存の動作系との統一）— 一貫性のみが根拠であり、GET トリガーで実害が無いことを確認済みのため不採用

### 2. 初回判定はセッション一覧との符合で行う

`invokeAi` は一覧（U12）の実体（`listSessionsCore`）を叩き、符合する id があれば継続、無ければ初回と判定する（ユーザー決定）。

- 一覧はディレクトリ・openspec ルート・`config.yaml`（`schema:` 書き込み済み）の検査を全部パスしたセッションだけを載せる
- 実行環境の準備は `invokeAi` の仕事（ユーザー決定）: openspec ルートの初期化と `config.yaml` の書き込みは、セッション作成時ではなく `invokeAi` が初回の起動時に自分で行う。作成直後のセッションは一覧の検査を通らないので初回と判定され、初回の起動を経たセッションだけが一覧に載って継続と判定される。順番と流れがずれない
- 初回: 実行環境を整える → `--session-id` + 初回の定型。環境を整えられなければ起動せず失敗として扱う
- 継続: `--resume` + 続きを促す定型。継続先の会話が無ければ（`sessionMissing`）作り直さず失敗として扱う。実行環境を作った後に初回の呼び出しが失敗し切ったセッションはこの経路に入る（詰みの許容・MVP の割り切り）
- claude 側のセッションログ（`.jsonl`）は読まない（既定事項：履歴は自前のファイルから組み立てる）
- 代替案: 保存済み記録（strokes）の有無で判定 — 提出の有無と会話の有無が食い違う失敗境界で二義的になり、一覧と判定の出どころも割れるため不採用（ユーザー決定で一覧に一本化）

### 3. `invokeAi` の引数は `sessionId` のみ

- `prompt` / `first` を外し、判定と定型選択（`firstPrompt` / `continuePrompt`）を `invokeAi` 内へ移す
- リトライ時の内部切替（mode / prompt）は現行のまま

### 4. 定型は runtimeConfig に持つ

- 初回の定型・続きを促す定型を `runtimeConfig.claude` の項目（`firstPrompt` / `continuePrompt`）として持つ（ユーザー決定）。既存の起動設定（ADR 0001）と同じ仕組みで、`NUXT_` の環境変数で実行時に差し替えられる
- 現行の `prompt.ts` の文言は runtimeConfig の値へ移す。runtimeConfig なので常に値があり、「未設定」の状態は存在しない
- 移設後、コード側（`prompt.ts`）に定型の本文をハードコードで残さない。フォールバック用の内蔵文言も持たない（出どころを runtimeConfig 1本にする）
- 反映の性質も起動設定と同じ: 再ビルド不要、環境変数の差し替えは再起動で次回の呼び出しから効く
- 代替案: 定義ファイル（呼び出しごとに読む）— 再起動なしで反映できるが、設定の出どころが runtimeConfig とファイルの2系統に割れるため不採用

### 5. busy ガードは invoke-agent ハンドラが持つ

- `beginRun` / `endRun` の呼び出しを invoke-agent ハンドラへ移し、実行中なら busy として受理しない
- 受理系 endpoint は busy を見ない。多重送信の抑止はフロントの待機表示（送信を受け付けない）と invoke-agent の busy 拒否が担う

### 6. フロントは受理の成功応答直後に invoke-agent を呼ぶ

- 概要投稿・回答送信・差し戻し送信のそれぞれで、受理成功 → `GET /api/[id]/invoke-agent` を続けて呼ぶ
- invoke-agent の呼び出し失敗（busy 含む）はストロークのエラー表示系に流す

## Risks / Trade-offs

- [受理成功と invoke の間でフロントが落ちると、入力は受理済みなのに AI が起動されない] → invoke-agent は busy でなければいつでも呼べるため、`GET /api/<id>/invoke-agent` を叩けば回復する。自動検知・自動再起動は MVP に入れない
- [GET なので URL 直打ち・再訪で起動が発火し得る] → busy 拒否で多重起動は防がれる。会話が進む可能性は残るが、単一ユーザー・自前フロントの前提で許容する
- [受理と起動が2リクエストに分かれ、片方だけ成功する状態が増える] → 受理済み入力は agent-api の取得 endpoint から次の起動時に読まれるため、遅れて invoke しても内容は失われない

## Migration Plan

1. サーバ側: invoke-agent endpoint 新設 → `invokeAi` の引数変更 → 3ハンドラから起動と busy ガードを除去
2. フロント側: 3操作の成功応答後に invoke-agent 呼び出しを追加
3. `docs/api-contract.md` を更新
4. ロールバックは revert で戻る（データ移行なし）
