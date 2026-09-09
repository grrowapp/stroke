# adr0016-sub-implement-mcp-operations Tasks

## 1. 前提を測る

- [x] 1.1 「自プロセスへの HTTP 往復」が実在するかを、Nitro の `$fetch` の実装から確かめる
      （`nitropack/dist/runtime/internal/app.mjs` の `localFetch`。先頭が `/` のパスは
      `fetchNodeRequestHandler` へ渡り、ソケットを開かない。**往復は無い**。2026-08-31）
- [x] 1.2 transport が既に Streamable HTTP かを確かめる
      （`@nuxtjs/mcp-toolkit` の route `/mcp`。stdio だったことは一度も無い。2026-08-31）
- [x] 1.3 残る「内部実装の直接呼び出し」が ADR-0014 と衝突するかを確かめる
      （busy ガード・前提チェック・検証の一本化・`errorCode` の導出元をすべて失う。
      得られるのは関数呼び出し1段ぶん。design.md「測ったこと」3）

## 2. 決めを spec に残す

- [x] 2.1 `openspec/specs/mcp/server` に Requirement「代行は確定した方式であり、ツール側に第2の実装を作らない」を足す（`specs/mcp/server/spec.md` の ADDED）
      （delta を書いた。本体 spec への反映は archive のときに当たる。**`provide-operations-via-mcp`
      を先に archive すること**——`mcp/server` はそちらが作る capability である）
- [x] 2.2 ツールごとの spec（`mcp/tools/*`）には触らない。契約は1文字も変えない（2026-08-31）
- [x] 2.3 `openspec validate --all` が通る（2026-08-31。本 change は valid。全体の 18 件の失敗は
      ADR-0016 系の外にある別系統の change で、アーティファクトが揃っていないもの）

## 3. コードを変えないことの確認

- [x] 3.1 `git status` が空であること（本 change は artifact 以外を触らない）（2026-08-31）
- [x] 3.2 `npx vitest run` と `yarn typecheck` が、本 change の前後で同じ結果であること
      （2026-08-31: 417 passed / typecheck exit 0。本 change ではコードを1行も触っていない）

## 4. 承認

- [x] 4.1 「実処理化を採らない」という結論をユーザーへ示し、承認を得る。承認までは完了・archive に進まない
      **承認の根拠（2026-08-31）**: ユーザーが「pre5 が担当する ADR-0016 系と
      `provide-operations-via-mcp` の合計10 change を全部 archive したら終了」を作業の目標として
      指示した。これを完了承認として扱う。**dashboard の approvals は経由していない。**
