## Why

**サーバーを再起動すると、1つの会話に claude が2本並ぶ。**

再起動でプロセス内のメモリ——MCP の接続表と busy ガード——は消える。だが**前のプロセスが起こした claude は生き残る**。巡回（`server/plugins/01.retry-failed.ts`）は立ち上がって最初の周回で宙に浮いた `running` を `failed` へ倒し、`SWEEP_INTERVAL_MS = 60_000` 後の次の周回が U13 を叩いて起こし直す。**そのとき前の claude がまだ走っていれば、同じ会話に2本目が立つ。**

前の claude は放っておいても終わる。`claude -p` は非対話なので、ターンを終えれば自分で exit する。だが**その寿命は親の死ではなくターンの長さで決まる**。

実測（2026-09-02。本物の `claude -p` を `server/utils/stroke/claude.ts` と同じ `stdio: ['ignore','pipe','pipe']` で起こし、2秒後に親だけ exit させた）。

```
claude pid = 1088009 / 親は exit 済み（t=+2s）
t=+1s 〜 t=+25s : 生存（ppid=1 へ里子）
t=+40s          : 終了
```

親の死は exit を早めも遅らせもしない（stdout のパイプが閉じても EPIPE で落ちなかった）。「10 から 1 まで数える」程度の依頼で38秒である。ストロークの実行は guide を読み、`openspec` を叩き、文書を書いてから提出するので分単位になる。その間 MCP に触れないため、接続表が空で 401 になることを理由に早く終わることもない。**60秒の隙間は容易に越える。**

残った claude に救うものは無い。接続表が消えているのでツール呼び出しは 401 で通らず、提出も記録もできない。新しいサーバープロセスとの関係は既に切れている。

**足りていないのは、起こし直す前に前の claude を終わらせることだけである。**

### この欠陥に含めないもの — 記録が `running` のまま固まること

孤児が exit しても `invocation` を書く者は居ない。書くのは `invokeAi` の `setInvocation` で、その継続は再起動で消えたワーカーの中にあり二度と走らない。孤児自身が A8 へ到達する手段も無い——`--allowedTools` に HTTP を叩く手段が無く、MCP は接続表が空で 401 になる。放置すれば記録は `running` のまま固まり、画面が再実行を出すのは `error` のときだけなので動かせなくなる。

**しかしこれは既に手当てされている。** 巡回が「立ち上がって最初の周回だけは `running` も倒す」を持つ。この change が直す欠陥ではない。

## What Changes

- 変更: サーバーの起動時に、前のプロセスが起こした claude を**終了させる**。**終了を確かめてから**記録を倒す。起こし直す時点で重なる相手が居なくなるので、2本目は成立しなくなる
- 変更: 宙に浮いた `running` を倒す役目を、巡回の初回周回から起動時のステップへ移す。初回掃除は `portal/batch`「巡回は `failed` だけを拾う」に反しており、切り出すと規定どおりに戻る
- 変更: 実行の記録を書ける者の限定を「invokeAi だけ」から外し、**外から書けない**という本来の禁止（claude と画面は書いてはならない）に戻す。後始末が畳む実行には、記録を書く invokeAi がもう居ない（再起動でその継続ごと失われている）。**サーバー内部の誰が書くかは、その振る舞いを持つ capability 側が持つ**
- 変更: `error` に至る経路が「invokeAi がリトライ上限に達した」だけでなくなる。**後始末が終わらせられなかった実行も `error` になる**。読む側は変えない——巡回が拾う条件は `invocation === 'failed'` のままで、`error` を見て分岐するコードは無い（`server/utils/stroke/sweep.ts` の `shouldRetry`）
- 削除: `startup-readiness` を capability ごと落とし、**起動時に前提を確かめる処理を実装から外す**。残す振る舞いは `api/session/invoke-agent`「前提が欠けている間は起動を受け付けない」だけとする

### この change で扱わないもの

**サーバーインスタンスを同時に複数走らせる前提は持ち込まない。** その前提を置くと「その `running` を起こしたのはどのインスタンスか」を判定する仕掛けが要るが、それは**単一インスタンスで動かす通常の運用には不要なオーバーヘッド**である。`pre5` と本体が同じ `/opt/projects` を見るのは worktree を並走させる開発の都合であって、仕様上の要請ではない。

したがって終了させる対象は「**前のプロセスがこのアプリとして起こした claude**」であり、インスタンスの区別は判定条件に入れない。

## Capabilities

### New Capabilities

- `bootstrap/system/cleanup-agent-process` — サーバーの起動時に、前のプロセスが残した実行を、走っている claude を終了させたうえで畳む振る舞い

### Modified Capabilities

- `agent/invocation` — Requirement「実行の記録は invocation の4値で持つ」を2点だけ直す。`error` の説明を「リトライ上限到達の終端」から「自動では回復しない終端」へ広げること、書き手の限定「invokeAi だけ」を外して**外から書けない**という本来の禁止（claude と画面は MUST NOT）に戻すこと。**起動時の処理はここに書かない**——サーバー内部の誰が書くかは、その振る舞いを持つ capability 側の話である。書き込み経路（A8 を通す）は変えない

### Removed Capabilities

- `startup-readiness` — **正しい specs の分類ではない。** capability ごと落とす。移し先は作らない

  この capability は「起動時に確かめる」という**実装の置き場**を単位にしており、振る舞いの単位になっていない。確かめている3点はいずれも起動時に見る理由が無い——保存先が絶対パスかと `claude` の起動定義は `nuxt.config.ts` 直書きの定数で書き間違い以外では変わらず、実際に発行される `claude` の起動引数は呼び出しごとに組み立てが変わるので静的な検査では捕まえられない。書き込み権限だけが実行時に変わるが、それは使う直前に見るもの。

  外から観測できる契約は `api/session/invoke-agent`「前提が欠けている間は起動を受け付けない」で、そちらは残る。起動時のログは運用の助けであって契約ではない

## 変更しない capability

- `api/stroke/submission` — 実行の記録の書き込みに関する規定を持つが、**この capability の性格そのものが未確定である**（`docs/adr/0019-approval-is-not-inferred-from-archive.md`）。未確定のまま規定を触ると、決まっていない形を固定してしまう
- `portal/batch` — 巡回が拾う条件（`invocation === 'failed'`）は今のままでよい。初回掃除を切り出すことで規定と再び合う

## Impact

- `server/plugins/` — 起動時の後始末を、巡回とは別のステップとして置く
- `server/plugins/01.retry-failed.ts` — 初回周回が兼ねていた掃除を外す
- `server/utils/stroke/` — 走っているプロセスの一覧の取得、argv による対象の照合、終了の確認
- `server/api/strokes/[id]/submission.post.ts`（A8）— **変えない**。後始末はこの endpoint を通して記録を書く。呼び手が誰かの規定は `agent/invocation` 側で持つ
- `docs/specs/architecture/session-workflow.md` — 「実行の記録（`invocation`）」の記述。91〜92行目は A8 の規定を写したもので capability を直せば追随する。113〜116行目の「自分が起こしたものか判定できない場合」「他インスタンスが起こした実行には触らない」は所有判定があった時の条件なので**削る**
- `server/plugins/00.startup-checks.ts` — **削除する**。起動時に前提を確かめる理由が3点とも無い
- `server/utils/readiness.ts` — 残す。`server/api/strokes/[id]/invoke-agent.get.ts` が使っており、そちらは `api/session/invoke-agent` が規定している。消える capability への参照だけ外す
- `docs/adr/0010-create-button-always-enabled.md` — `startup-readiness` への参照を外す（2箇所）
- 進行中の change `scope-storage-requirements`・`align-settings-conventions` — `startup-readiness` への参照を外す
- 接続表の永続化は行わない（`provide-operations-via-mcp` の決定を変えない）。残った claude のツール呼び出しは 401 のままでよい
- 画面・MCP ツールの契約・`state.json` のスキーマは変えない
