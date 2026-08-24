# add-session-management-command

## Why

セッションは作れるが、**消せない**。作られたセッションは2箇所に残り、どちらにも削除の手段が無い。

- `/var/lib/stroke-board/sessions/<uuid>/` — アプリが書く状態と生成物
- ワークフロー定義のルート配下 `changes/<uuid>/` — openspec の change。この置き場はマシン共有の store を全セッションで使い回しており、セッションディレクトリの外にある

検証を1回走らせるたびに両方へ1組ずつ積み上がり、消すには手で `rm` を叩くしかない。これは検証だけの問題ではない。ユーザーが概要だけ投げて放棄したセッション、リトライを尽くして失敗したセッションも同じように残り続ける。

セッションを作る口があるなら、畳む口も要る。

## What Changes

### セッション管理の口

**endpoint と script の両方を持つ。**

- **endpoint** が通常の経路。実行中の呼び出しを持つかどうかを知っているのはサーバだけで、その判定を効かせられるのはここだけである
- **script** はサーバが動いていなくても畳める経路。設定が壊れて起動しないときや、プロセスが落ちているときに畳めないのは困る。そういうときに畳めないままセッションが積み上がるのが、まさに今の状態である

**同じ規定を2つ実装しない。** 「セッションに属するものは何か」「消したときに何が残らないか」の実体を1つ置き、endpoint も script もそれを呼ぶ。設定値も同じ出どころから読む。写した先が本体とずれる形にしない。

**どちらかが他方を叩く形にはしない。**

- script が endpoint を叩く形にすると、サーバが動いていない状況で役に立たず、片方を持つ意味が消える
- endpoint が script を子プロセスで起こす形にすると、ビルド成果物だけをデプロイしたときに動かない。`nuxt build` の出力はバンドルされたサーバと公開ファイルだけで、リポジトリの任意のファイルは同梱されない（実測で確認した）

その上で次を足す。

- **セッションを消す口を1つ公開する。** 消したときは、そのセッションに属するものが残らない。実行仕様の変更後は全てがセッションディレクトリ配下に収まるため、削除の実体は1ディレクトリの削除になる
- **残っているセッションを一覧する口を1つ公開する。** 何が残っているか分からなければ消す判断ができない。一覧には、それぞれの phase と、いつのものかが分かるものを載せる
- **実行中の呼び出しを持つセッションは削除を受理しない。** 既存の busy と同じ扱いにし、呼び出しが終わってから消す。サーバが動いていない経路ではこの判定の材料が変わるため、そこで何をもって実行中と見なすかを定める
- **セッションを作る口を script にも持たせる。概要の指定を必須とする。** 概要を持たないセッションは AI が最初に読むものを持たず、進めようがない状態になる。必須にすることでその状態が生まれない。API 側は今の `POST /api/overview` が同じ規定を満たしているので、新設しない

### 実行仕様の変更（store を外す）

- セッション作成時に `openspec init --tools none` を**毎回必ず**実行し、セッションディレクトリ自体を openspec ルートにする
- セッションの `openspec/config.yaml` に `schema: flontier-strokeflow` を書く。スキーマは、マシン共有の user レベル配置（`~/.local/share/openspec/schemas/`）に登録されたものを使う
- openspec コマンドの実行は cwd = セッションディレクトリで行う。`--store` はどのコードパスからも使わない。設定値 `storeId` を廃する
- **サーバは change を作成するコマンドを打たない。** change は初回呼び出しの `openspec-ff-change` スキルが作る
- 初回 prompt での opsx コマンド指定をやめ、`openspec-ff-change` スキルの呼び出しに置き換える
- レジストリへの登録を、動かすための手順から外す。旧定義ディレクトリ `workflow/` は撤去する
- セッションの change はセッションディレクトリ配下（`<sessionDir>/openspec/changes/draft-proposal/`）に固定名で作られる形になり、セッションに属するものはセッションディレクトリ1箇所に収まる

## Capabilities

### New Capabilities

- `api/session`: endpoint 経由のセッション管理を規定する。セッションを消せること、消したときに何が残らないか、残っているセッションを一覧できること、実行中の呼び出しを持つセッションの削除を受理しないこと（作成は既存の `POST /api/overview` のままで足りる）
- `tools/session-cli`: サーバが動いていなくても使える script 経由のセッション管理を規定する。セッションを作れること（概要が必ず伴う）、消せること、消したときに何が残らないか、残っているセッションを一覧できること、サーバ無しの状況で何をもって実行中と見なすか

既存の `stroke-session` に足さないのは、あの capability が「概要を起点にストロークを重ね、把握完了に至るまでの進行と状態」を責務としているためである。畳むことと一覧することは進行ではなく、セッションそのものの管理にあたる。押し込むと責務が濁る。

### Modified Capabilities

- `workflow-definition`: セッションのワークフロー参照が、マシン共有の登録簿（store）に依存しない規定を加える。定義の変更が次回の呼び出しから反映されるという既存の要件は変えない

## Impact

- `server/utils/openspec.ts` — change 作成の実行を廃し、「init → config.yaml 書き込み」（cwd = セッションディレクトリ・store 無し）へ置き換え。change の削除もここ
- `server/utils/claude-config.ts` / `nuxt.config.ts` — `storeId` と `opsxCommand` を廃する。schema 名は設定値として持つ
- `server/utils/prompt.ts` — 初回 prompt を `openspec-ff-change` スキルの呼び出し（prompt 内の固定文言）に変更、store の言及を除去
- `server/utils/session-store.ts` — セッションの作成・削除・列挙の実体。endpoint と script の双方から呼べる形にする。今は Nitro の `useRuntimeConfig` と `createError` に依存しているため、script から呼ぶには設定の読み取りとエラーの返し方を切り離す必要がある（範囲は design で確定）
- `server/utils/running.ts` — 実行中かどうかの判定を削除の受理に使う
- `server/api/` — 削除と一覧のハンドラ
- `docs/api-contract.md` — endpoint の追加。「1リソース1パス、書き手は POST」という現行の言い回しに、削除と一覧をどう収めるかを含む
- `package.json` — script の登録と依存の追加（`fs-extra`・`tsx`）
- `workflow/` — 撤去
- `README.md` / `docs/session-workflow.md` — 登録手順の除去、schema 配置手順、畳み方の手順（サーバが動いているとき／いないとき）
- `openspec/changes/archive/2026-08-20-claude-p-openspec-workflow/design.md` の決定3（store として登録する）を覆す。同決定が却下していた user レベル schema 配置を採用する形になる

**前提**: 先行する change は無い。旧 `remove-store-dependency`（実行仕様の変更）は本 change に統合した。設定の出どころの一本化は「同じ規定を2つ実装しない」の範囲として design で確定する。
