---
status: Wait-for-archive
change: fix-orphan-run-on-restart
triage:
  - bug
tags:
  - proposal
  - specs
  - design
  - tasks
  - fix-orphan-run-on-restart/7f3786e2-2ad8-436d-8728-cc8b6be087ed
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
  - update-provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
date: 2026-09-02
---

# fix-orphan-run-on-restart

実行の途中で dev サーバーが再起動すると、走っていた claude が孤児として生き残る。接続表も
busy ガードもメモリなので再起動で空になり、巡回の初回掃除が `running` を `failed` へ倒した
あと、次の巡回が U13 を通してしまう。**同じ会話 id に2つ目の claude が立つ。**

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
同 change の範囲外として記録していたが、範囲外の扱いは不正だった（ユーザー指摘 2026-09-01）。

対応する change: `fix-orphan-run-on-restart`

---

## 検討の記録（2026-09-02）

artifact を2度書いて2度とも枠組みを誤ったため、proposal から破棄してやり直す。**確定した
事実と、絞り込んだ方向性だけをここに残す。**

### 起票時の記述の訂正

**訂正1: 「孤児が終わると A8 で `invocation` を書き、記録を上書きする」は起こらない。**
`invocation` を書くのは `invokeAi` の `setInvocation` で、その継続は再起動で消えたワーカーの
中にあり二度と走らない。孤児自身が A8 を叩く口も無い（`--allowedTools` に HTTP を叩く手段が
無く、MCP は接続表が空なので 401）。

**訂正2: 孤児は生き残るが、永久にではない。**

実測（2026-09-02、本物の `claude -p`）。`server/utils/stroke/claude.ts` と同じ
`stdio: ['ignore','pipe','pipe']` で起こし、2秒後に親だけ `exit` させた。

```
claude pid = 1088009 / 親は exit 済み（t=+2s）
t=+1s 〜 t=+25s : 生存（ppid=1 へ里子）
t=+40s          : 終了
```

`claude -p` は非対話なのでターンを終えれば自分で落ちる。親の死は exit を早めも遅らせもしない
（stdout のパイプが閉じても EPIPE で落ちなかった）。**孤児の寿命は親の死ではなくターンの
長さで決まる。**

### 何が問題で、何が問題でないか

**(1) 記録が `running` のまま固まる — 既に手当て済み。この change の対象ではない。**
孤児が exit しても訂正1のとおり `invocation` を書く者が居ない。巡回は `failed` しか拾わず、
画面が再実行を出すのは `error` のときだけなので、放置すれば動かせなくなる。**しかし変更前の
`server/plugins/01.retry-failed.ts` が「立ち上がって最初の周回だけは `running` も倒す」を
既に持っている。**

**(2) 孤児と2本目が重なる — これがこの change の直す欠陥。**
初回掃除は `failed` へ倒すだけで、その周回では起こさない。U13 を叩くのは
`SWEEP_INTERVAL_MS = 60_000` の次の周回。よって重なるのは孤児が60秒を越えて生きている場合で、
ストロークの実行は guide を読み `openspec` を叩き文書を書いてから提出するため分単位になり、
その間 MCP に触れないので 401 で早期に終わることもない。**60秒は容易に越える。**

### 絞り込んだ方向性

**「起動時に前のプロセスの claude を終了させる」。** 起こし直す時点で重なる相手が居なく
なるので、(2) は成立しなくなる。

**サーバーインスタンスを同時に複数走らせる前提は締め出す。** その前提を置くと「その
`running` は誰が起こしたのか」を判定する仕掛けが要るが、単一インスタンスで動かす通常の運用
には不要なオーバーヘッドである。`pre5` と本体が同じ `/opt/projects` を見るのは worktree を
並走させる開発の都合であって、仕様上の要請ではない。

### 巻き込む capability

- `bootstrap/system/cleanup-agent-process` — **新規。この change の本体。** 起動時の後始末を
  ここ1箇所に置く。既存 capability へ分散させない
- `agent/invocation` — `error` の定義（「リトライ上限到達の終端」）を、後始末が書く分も含む
  形へ直す。**「error 判定を広げる」ではない**——`error` を読んで分岐するコードは無く
  （`sweep.ts` の `shouldRetry` は `failed` だけを見る）、変わるのは書き手が増えることだけ
- `api/stroke/submission`（A8）— **触らない。未解決のまま残す。** 下の「判断の捻じ曲げ」
- `portal/batch` — 変更しない。初回掃除は「巡回は `failed` だけを拾う」に反しており、後始末
  を切り出すと規定どおりに戻る

### 判断の捻じ曲げ（2026-09-02）

**エージェントがユーザーの判断を都合よく捻じ曲げた。事実として記録する。**

capability を詰める過程で A8（`POST /api/strokes/:id/submission`）の性格が問われたとき、
エージェントは `openspec/changes/archive/2026-08-26-connect-portal-and-strokes/design.md` の
「D6: `invocation` は4値、書き込みは A8 だけ」を引き、**「承認された設計と一致している。
変わっていない」とユーザーへ回答した。**

ユーザーの指摘で崩れた。

1. ユーザーが承認したのは「**`submission` で proposal も steering も提出する。`proposal`
   （A7）は無くなる**」形である
2. `### D番号` という決定の書き方は、ユーザーが繰り返し是正させてきたもの。archive 済み
   design.md のうち `### D番号` は4件、`### 決定N` は18件で、8/29 以降はすべて `決定N`
3. つまり当該 design.md は**是正前の書き方のまま archive されており、ユーザーの承認を
   経ていない**

archive はユーザーの承認とエージェントの自己承認を同じ形で並べており、区別する印が無い。
規定は `docs/adr/0019-approval-is-not-inferred-from-archive.md`。

**この change は A8 に触れない。触らないのは面倒を避けたためであって、現状を追認したため
ではない。** `api/stroke/submission` と `api/stroke/proposal` の spec 冒頭に未確定の印を
置いた。

### 上位資料との差分（`docs/specs/architecture/session-workflow.md`）

- 91〜92行目「書き込みは A8 経由で invokeAi だけが行う」は A8 の規定を写したもの。**capability
  を直せば追随する**
- 113〜114行目「自分が起こしたものか判定できない場合」は所有判定があった時の条件。**削る**
- 115〜116行目「他インスタンスが起こした実行には触らない」も同じ。**削除**
- 状態遷移図の `running --> error: 起動時に後始末できない` と、後始末のファイル名
  `server/plugins/01.reap-running.ts` は**既に正しい**

### 実装の現状

artifact に先行して実装が入っており、多重インスタンスの前提（`isOwnLaunch` /
`apiBaseUrl` / `skipped`）は削除済み。`yarn typecheck` exit 0、`yarn test` 72 files・
904 tests 全通過（2026-09-02 実測）。**artifact を起こし直したあとで、実装がそれと合って
いるかを照合すること。**
