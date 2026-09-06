## Context

症状と原因、対処しない決定は proposal.md を参照。ここには、将来同じ症状を見た者のために、調べた事実だけを残す。

### 実測（すべて再現手順つきで確認）

| 対象 | 当てたもの | 結果 |
|---|---|---|
| ビルド済みサーバー | 異常切断7通り × 最大50接続 | 停止しない |
| dev | 実ブラウザのリロード・遷移・タブを閉じる ×10 | 停止しない |
| dev | kill -9 → 再起動（タブ3枚が再接続中） | 停止しない |
| dev | `terminate()` による強制 RST ×20 | **停止する** |
| dev | 通知チャネル `/ws` へ同じ強制 RST | **停止する** |

`/ws` のハンドラは `open` が同期で送信も try/catch 済みなのに止まる。停止はアプリのハンドラの作りによらない。`question.ts` / `proposal.ts` / `ws-channels.ts` は原因ではない。

### 上流の作り（`@nuxt/cli` 3.37.0、`dist/dev-*.mjs`）

- 親が待ち受けを持ち、子を `fork` して要求を渡す。子の `close` は `errorCode` が非 0 のときだけ親を `process.exit` させる
- 子は `process.once("unhandledRejection")` で親へ `nuxt:internal:dev:rejection` を送り、直後に `process.exit()`（code 0）する。親はこの IPC を受けると `restartWithFork` で子を起こし直す作りだが、実際には戻らない。送信直後の exit で IPC が届いていないと読める（未実測）

### 試した対処と、やめた理由

1. **詰め物（実装済みだった、develop `00f206eb`）**: `hooks.listen` で `process.emit` を差し替え、接続リセット系の rejection だけ上流のリスナへ配らない。動いたが、リスナの登録順と `process.emit` の戻り値の意味という上流の内部に依存し、効いているかを検めるために `WS_GUARD_OFF` という環境変数まで要った
2. **監督（設計のみ）**: `yarn dev` に監督を置き、配下の `nuxt dev` の終了・無応答で起こし直す。上流に依存しないが、dev 限定・RST 限定の症状に対して大きい
3. **対処しない（採用）**: 起きたら `yarn dev` を起こし直す

### 独立して残る観察

`package.json` の `dev` は `--port 3100`、`nuxt.config.ts` の `devServer.port` は 3599 で、待ち受けの正が2つある。`scripts/session.ts` と `scripts/stroke-check.ts` は後者を読む。この change の範囲外だが、直すなら `devServer.port` に一本化するのが筋。

## Goals / Non-Goals

**Goals:** 詰め物と確認コマンドを撤去し、リポジトリを対処前の状態に戻す。

**Non-Goals:** 症状の防止・復帰・上流への修正の提出。

## Decisions

対処しない。理由は proposal.md。

## Risks / Trade-offs

- **dev が RST で止まる状態に戻る** → 起きたら `yarn dev` を起こし直す。起動時の後始末（`bootstrap/system/cleanup-agent-process`）と画面の張り直し（`ws/delivery`）があるので、起こし直しで状態は壊れない
