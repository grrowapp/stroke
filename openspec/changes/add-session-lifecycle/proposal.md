# add-session-lifecycle

## Why

セッションは作れるが、**消せない**。作られたセッションは2箇所に残り、どちらにも削除の手段が無い。

- `/var/lib/stroke-board/sessions/<uuid>/` — アプリが書く状態と生成物
- ワークフロー定義のルート配下 `changes/<uuid>/` — openspec の change

検証を1回走らせるたびに両方へ1組ずつ積み上がり、消すには手で `rm` を叩くしかない。これは検証だけの問題ではない。ユーザーが概要だけ投げて放棄したセッション、リトライを尽くして失敗したセッションも同じように残り続ける。

セッションを作る口があるなら、畳む口も要る。

## What Changes

- **セッションを消せるようにする。** 消したときは、そのセッションに属するもの——アプリが書いた状態と生成物、および openspec の change——が両方とも残らない
- **残っているセッションを一覧できるようにする。** 何が残っているか分からなければ、消す判断ができない
- 消す対象が実行中の呼び出しを持つ場合の扱いを定める
- 作成についても制御の口を持つかを見直す。今はユーザーが概要を投稿する経路（`POST /api/overview`）でしか作れず、概要と不可分になっている

口の形（endpoint として公開するか、運用者が叩く script にするか）は design で決める。どちらであっても「消せる」という振る舞いは同じ規定に従う。

## Capabilities

### Modified Capabilities

- `stroke-session`: セッションを消せること、残っているセッションを一覧できること、消した後に何が残らないかを加える。セッションを開始する既存の要件、および往復・履歴の要件は変えない

## Impact

- `server/utils/session-store.ts` — 削除と一覧
- `server/utils/openspec.ts` — openspec の change の削除
- `server/utils/running.ts` — 実行中の呼び出しを持つセッションの扱い
- endpoint を選ぶ場合は `server/api/` と `shared/api-contract.md`、script を選ぶ場合は `package.json` の scripts
- `README.md` / `docs/session-workflow.md` — 畳み方の手順

**前提**: `remove-store-dependency` を先に済ませること。セッションに属する2箇所のうち openspec の change の位置は、あの change で確定する。位置が決まる前に削除処理を書くと、書き直しになる。
