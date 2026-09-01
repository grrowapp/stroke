---
status: Open
tags:
  - bug
---

# fix-retry-count-without-launch

起こし直しの回数が、claude を起こさずに1つ進む。`maxRetries: 2` なら起動は3回のはずが、実測では**2回**しか起きないまま `error`（終端）へ落ちた。

## 事実

実測 2026-08-30。`adr0016-sub-add-timeout-to-config` の刻みを実機で見るため、`claude.timeoutMs: 5000` / `claude.timeoutStepMs: 5000` を一時的に入れて必ず時間切れになる状態を作った。セッション `931af1ae-308b-4e8e-961d-98760fa2e623`。

サーバーログ:

```
AI 呼び出しが失敗: 931af1ae-… [ 'タイムアウト (5000ms)' ]
AI 呼び出しが失敗: 931af1ae-… [ 'タイムアウト (10000ms)' ]
リトライ上限に達した: 931af1ae-…（3/2）
```

claude の生出力（`.stroke-check/debug-log/931af1ae-….json`）の見出し行は**2本**:

```
# 2026-08-30 10:05:01.428
# 2026-08-30 10:05:53.398
```

終わったときの `state.json`:

```json
{ "phase": "stroking", "currentQuestion": null, "invocation": "error", "retries": 3 }
```

**起動2回に対して `retries` が 3 になっている。** 3回目の起動があったなら `タイムアウト (15000ms)` が出て生出力も3本になるはずだが、どちらも無い。ほかの失敗経路（`実行環境を作れない` / `継続先の会話が失われた` / `プロセスは成功したが提出が届かない`）のログも出ていない。

**ただし「数え方が壊れている」と決めつけないこと。** `error` が `（3/2）` を出したということは、`retries` が 3 になるところまで進んだ、すなわち `retries = 2` のキックが上限判定（`retries > maxRetries` は `2 > 2` で false）を通り、`setInvocation('running', 3)` まで到達したことを意味する。つまり **3回目の `invokeAi` は走っている**。

したがって疑うべきは次の2つで、どちらかを先に切り分ける。

1. 3回目の起動が**早期に失敗**し、`タイムアウト` にも既知の失敗ログにも現れなかった
2. 3回目の起動は走ったが、**生出力の書き出しが取りこぼされた**（`writeDebugLog` は呼び出しの完了処理から切り離されていて `await` されない。プロセスが先に終わると落ちうる）

## 規定との食い違い

`docs/specs/core/settings-reference.md` の `claude.maxRetries`:

> 1回の呼び出しで起こすのは1回だけで、起こし直しは巡回が担う。したがって起動の総回数は「上限 + 1」で決まる。

既定の `maxRetries: 2` なら3回。実測は2回である。

## 見るべきところ

- `server/utils/stroke/claude.ts` の `writeDebugLog`。呼び出しの完了処理から切り離されており（`await` しない）、プロセスが先に終われば書き残しが落ちる。3回目の生出力が無いのはこれかもしれない
- `server/utils/stroke/ai.ts` の `setInvocation('running', retries + 1)`。起動の**前**に回数を進めているので、起動に至らなかった呼び出しでも1つ消費されうる
- `server/plugins/01.retry-failed.ts` の巡回。60秒間隔で `failed` を拾って再キックする。初回の巡回は `running` を `failed` へ倒す（`reaping`）ので、その1回が起動を伴わずに数えられていないか
- `server/api/strokes/[id]/invoke-agent.get.ts` の busy ガード（409）。多重起動を止めるが、回数の扱いがどうなっているか

**切り分けの順序**: まず「3回目は走ったのか」を確定させる。`claude` の子プロセスが起きたかどうかは、サーバーログの起動時刻・`state.json` の推移・プロセスの観測で見る。走っていたなら生出力の取りこぼし（`debug/logging` の話）で、走っていないなら数え方の話である。

## 影響

**総待ち時間が資料より短くなる。** 起こし直しが規定より1回少ないところで終端に達するので、`maxRetries` を増やしても効きが1つぶん薄い。ユーザーには回復の機会が1回少なく見える。

## 前提

- 打ち切りの長さの算出（`timeoutMs + timeoutStepMs × retries`）は同じ実測で正しく動いている。`adr0016-sub-add-timeout-to-config` が入れたものではない
- 資料（起動の総回数は「上限 + 1」）とコードのどちらを正とするかは、この change で決める
