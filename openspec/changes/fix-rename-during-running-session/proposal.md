## Why

**症状**: 承認を押した時点で flontier の claude がまだ走っていると、その claude 以後のツール呼び出しが全部 `session_not_found` になり、`invocation` はどこにも残らない。

busy ガード（`server/utils/stroke/running.ts`）は sessionId をキーにした `Set` である。`approve.post.ts` は**自分で `beginRun` を取らない**（コードにそう明記してある）。改名後に起こす steering は**プロジェクト名**をキーに取る。つまり**同じ物理ディレクトリに対し、2つの claude が別々のキーで同時に走れる**。

`rename(2)` は inode を保つので、旧 flontier claude の cwd は改名先へ追随して生き続ける。接続表の token も残るが、文脈は `{sessionId: uuid}` のままなので代行先が引けない。終了時の `setInvocation` も uuid で A8 を叩いて 404 になる。

`yarn check:stroke` は `approve` の手前で実行の終わりを待って避けている。**実 UI には避ける仕掛けが無い。**

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。

## What Changes

- 変更: 承認は、対象セッションの flontier の実行が走っている間はディレクトリを改名しない。走っているなら待つか断るかのどちらかを取る
- 変更: busy ガードのキーを、sessionId とプロジェクト名の2系統が同じ物理ディレクトリを別物として扱わない形に揃える

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `api/session/approve`: 承認が走行中の実行と競合しないことを規定に加える
- `api/session/invoke-agent`: 多重起動を防ぐキーが、同じ物理ディレクトリに対する2つの実行を取り逃がさないことを規定に加える

起票時は後者を `agent/invocation` と書いていたが、同 spec に多重起動の要件は無い。「同一対象の多重起動を受け付けない」の SHALL は `api/session/invoke-agent` が持っており、U11・P1 はそれを参照するだけで単位を定義していない（specs 作成時に確認）。

## Impact

- `server/api/strokes/[id]/approve.post.ts` — 改名の前に実行中を見る
- `server/utils/stroke/running.ts` — キーの取り方
- `server/api/sessions/[id]/index.delete.ts`（U11）/ `server/api/projects/[projectId]/index.delete.ts`（P1）— `isRunning` の読み手。キーを変えるとここにも及ぶ
- 画面・MCP ツールの契約は変えない
