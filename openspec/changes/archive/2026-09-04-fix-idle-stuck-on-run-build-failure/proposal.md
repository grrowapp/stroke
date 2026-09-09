## Why

**構造の穴**。今日再現する不具合ではない。塞がっていないことが問題である。

`buildRun` が同期 throw すると、`kick` は token を消して reject を返すが、**`invocation` を誰も `failed` にしない**。U13 は 200 を返してしまうので呼び出し側の `.catch` も走らず、巡回は `failed` しか拾わない。**セッションは `idle` のまま永久に止まり、サーバーログ1行しか残らない。**

**起票時に書いた2点は、ソースで確かめたら成り立たなかった**（specs 作成時 2026-09-01）。

- 「設定が読めないと止まる」— U13 は `beginRun` の手前で `missingPrerequisites()` を呼び、`readStrokeConfig()` の失敗を捕まえて **503 を返す**（`server/utils/readiness.ts:13-19`、`server/api/strokes/[id]/invoke-agent.get.ts`）。この経路は前提チェックに先回りされている
- 「`mcpConfigFor` が `readServerConfig()` を読むので条件が1つ増えた」— `readServerConfig()` に `throw` する枝は無い（`server/utils/config.ts` に `throw` が1つも無い）。未設定は既定値へ落ちるだけである

**それでも塞ぐ理由**は、`readServerConfig()` が**前提チェックの網の外にある読み出し**だからである。`buildRun` の同期処理（`withMcpToolsAllowed` / `exposedToolsHeaderValue` / `submissionCount` / `issueConnectionToken`）は現在どれも throw しないが、1つでも throw するようになった日に、セッションは黙って永久に止まる。今日は当たっていないだけで、当たったときに何も残らない形が残っている。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。

## What Changes

- 変更: 実行を組み立てられずに終わった場合も、実行の失敗として記録する。巡回が拾えるようにする
- 変更: 起動を要求した側が、組み立ての失敗を結果として受け取れるようにする。今は 200 が返るので気付けない。**新しいステータスは足さない**——既存の 503（環境か設定を直すまで通らない）がこの状況そのものである
- 変更: この失敗も起こし直しの回数に数える。**数えないと `idle` の詰まりが無限ループに置き換わる**（巡回が `failed` を拾う → 同じ理由で組み立てが失敗 → また `failed`。上限判定は組み立ての後ろにあるので一度も通らない）

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: 起動の前段で失敗した実行も失敗として記録されることを規定に加える
- `api/session/invoke-agent`: 組み立てに失敗したときの応答を規定に加える

## Impact

- `server/utils/stroke/invoke.ts` — `kick` / `buildRun` の失敗経路
- `server/api/strokes/[id]/invoke-agent.get.ts`（U13）— 応答
- `docs/specs/api/contract.md` — U13 の 503 の説明を広げる（整合反映。design で提案し、ユーザー承認を得てから）
- 成功経路と、すでに `failed` を書いている経路は変えない。`invocation` の書き手は `invokeAi` のまま保つ（変えると「書き込むのは invokeAi だけ」を持つ4箇所に及ぶ）
