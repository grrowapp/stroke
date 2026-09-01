## Why

**症状**: 実行の途中で dev サーバーが再起動すると、走っていた claude が孤児として残り、同じ会話に2つ目の claude が立つ。

`spawn` に `detached` は付いていないが、親が死んでも子は生き続ける。再起動で接続表（メモリ）も busy ガード（メモリ）も空になるので、次が起きる。

- 生き残った claude の全ツール呼び出しが 401 `unauthorized` になる
- 巡回の初回掃除が `running` を `failed` へ倒し、次の巡回が U13 を叩く。busy ガードは空なので**通り、同じ会話 id に2つ目の claude が立つ**（`server/utils/stroke/running.ts` が防ごうとしているもの）
起票時に「孤児が終わると A8 で `invocation` を書き、新しい実行の `running` を上書きする」と書いたが、**これは起こらない**（specs 作成時 2026-09-01 に確認）。`invocation` を書くのは `invokeAi` の `setInvocation` で、その継続は再起動で消えたワーカーの中にあり二度と走らない。孤児自身が A8 を叩く口も無い（`--allowedTools` に curl も HTTP も無く、MCP は 401）。**上書きは起きないので、防ぐ要件ではなく順序（止める→倒す→起こす）で担保する。**

接続表を永続化しない決定（`provide-operations-via-mcp` の design.md）の裏側で、**再起動をまたいだ実行の後始末が無い**。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。

## What Changes

- 変更: サーバーの起動時に、前回の実行が残した子プロセスを見つけて始末する。始末できないものは `failed` へ倒すだけでなく、再起動をまたいで二重に起こさない
- 変更: 後始末は、**自分が起こしたと確かめられた実行にだけ**触る。同じホストで `projectShareRoot` を共有する別インスタンス（pre5 と /opt/projects は同じ `/opt/projects` を見ており、違うのはポートだけ）の走行中の実行を倒さない。いまの初回掃除はこれを区別しておらず、**他インスタンスの `running` まで `failed` へ倒して二重起動を自分で作りうる**

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: 再起動をまたいだ実行の後始末を規定に加える
- `server/session-management`: 起動時の掃除が孤児プロセスを扱うことを規定に加える

## Impact

- `server/plugins/01.retry-failed.ts` — 起動時の掃除
- `server/utils/stroke/running.ts` / 実行の起動と終了の記録
- 接続表の永続化は行わない（design の決定は変えない）。孤児側は 401 のままでよい
