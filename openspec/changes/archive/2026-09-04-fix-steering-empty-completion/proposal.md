## Why

**症状**: steering の実行が1本も文書を書かずに正常終了しても、セッションは終端になる。誰も起こし直さない。

`buildRun` の steering 分岐は `didWork` を渡さない（flontier 分岐は `submittedSince` を渡す）。何も提出せずにプロセスが正常終了すると `invocation` は `idle` になり、巡回は `failed` しか拾わないので**空振りが成功と区別できない**。

`submit-document`（steering）は本家 REST へ行くので、A5・A7 が数えている `notifySubmission` には載らない。steering に `didWork` を持たせるには提出の signal を別に用意する必要がある。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。

## What Changes

- 変更: steering の実行が何も書かずに終わった場合を、書き終えた場合と区別する。区別が付けば巡回が起こし直せる
- 追加: steering の提出を数える signal。`notifySubmission` に載らない経路（本家 REST）で提出されたものを、実行の側が知れるようにする

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: steering の実行にも「何かを成したか」の判定があることを規定に加える
- `mcp/tools/submit`: steering の提出が受理されたとき、それを呼び出し元の起動の作業として記録することを加える（ソースを読んで判明: steering の提出は stroke-board の endpoint を1つも通らないので、ここで記録しなければ signal の出どころが無い）

## Impact

- `server/utils/stroke/invoke.ts` — `buildRun` の steering 分岐
- `server/mcp/tools/submit-document.ts` — steering 提出の signal（どこで数えるかは design で決める）
- `server/utils/stroke/submission-signal.ts` — 起動単位の記録
- `server/utils/mcp/connection-table.ts` — ツールが起動を識別できるようにする
- `server/plugins/01.retry-failed.ts` — 変更なし。ソースを読んだ結果、`failed` を拾う既存の条件のままでよい（design.md「Non-Goals」）
- flontier 側の `submittedSince` は変えない
