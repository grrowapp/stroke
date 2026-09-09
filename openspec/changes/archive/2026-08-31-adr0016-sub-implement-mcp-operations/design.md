# adr0016-sub-implement-mcp-operations Design

## Context

- MCP ツール8本は `provide-operations-via-mcp` と案内の2 change で提供済み。ハンドラは対応する endpoint へ `$fetch` を発行し、その応答だけから結果を作る
- ADR-0014 は「検証・状態遷移の正は endpoint 側に置き、MCP 層に第2の実装を作らない」と定める
- 起票時（2026-08-27）の想定は「代行は第一段で、次の段で実処理化する」だった
- 動機と範囲は proposal.md を参照

## Goals / Non-Goals

**Goals:**

- 実処理化を採るかどうかを、根拠を示して決める
- 決めを spec に残し、「続きがある」と読まれる余地を消す

**Non-Goals:**

- コードの変更（結論として何も変えない）
- ツールの契約の変更

## 測ったこと

### 1. 自プロセスへの HTTP 往復は存在しない

起票時の主動機は「自プロセス→自サーバーへの HTTP 往復を外す」だった。**その往復は無い。**

Nitro が `globalThis.$fetch` に入れる fetch は `localFetch` を下敷きにしている（`nitropack/dist/runtime/internal/app.mjs`）。

```js
const localFetch = (input, init) => {
  if (!input.toString().startsWith("/")) {
    return globalThis.fetch(input, init);
  }
  return fetchNodeRequestHandler(nodeHandler, input, init)
    .then((response) => normalizeFetchResponse(response));
};
const $fetch = createFetch({ fetch: localFetch, ... });
globalThis.$fetch = $fetch;
```

先頭が `/` のパス——ツールが使っている `/api/strokes/:id/*` はすべてこれ——は `fetchNodeRequestHandler` へ渡り、**ソケットを開かずにハンドラが直接呼ばれる**。外すべき往復が初めから無い。

本家 dashboard 向けの `ofetch`（`upstreamFetch`）は別プロセス相手なので本物の HTTP だが、これは代行をやめても消えない。

### 2. transport の載せ替えは済んでいる

「stdio から Nitro の Streamable HTTP へ載せ替えるか」も起票時の項目だが、**stdio だったことは一度も無い**。`provide-operations-via-mcp` は最初から `@nuxtjs/mcp-toolkit` の route `/mcp`（Streamable HTTP）で提供している。

### 3. 残るのは ADR-0014 と衝突する部分だけ

往復と transport を差し引くと、実処理化の中身は「ハンドラが endpoint を経由せず内部実装（`session-store.ts` など）を直接呼ぶ」ことだけになる。これは次を失う。

- **busy ガード**（多重起動の抑止）と前提チェック。endpoint が持っている
- **検証の一本化**。endpoint の zod 検証を通らなくなり、同じ検証をツール側に書くことになる。ADR-0014 が禁じている「第2の実装」そのものである
- **`errorCode` の導出元**。いまツールは endpoint の応答（status とメッセージ）から `errorCode` を決めている。直接呼びにすると、失敗の種別をツール側で組み立て直すことになる

得られるのは、関数呼び出し1段ぶんのオーバーヘッドの削減である。**釣り合わない。**

## Decisions

### Decision: 実処理化を採らない。代行を確定した方式とする

上の3点から、置き換えの動機が残っていない。コードは変えず、代行が確定した方式であることを `mcp/server` の Requirement として置く。

「暫定として据え置く」という書き方は不採用——暫定と書けば、次の担当者は解消すべき負債として読む。実際この change の proposal がその形で起票され、10 change のうち1本を占めていた。

change を取り下げる（削除する）案も不採用。**取り下げると判断の記録が残らない**。同じ想定が別の起票として戻ってくる。

### Decision: 契約は1文字も変えない

ツールごとの spec（`mcp/tools/*`）には触らない。変えるのは提供方式についての Requirement 1件だけである。契約に手を入れると、変えない決定なのに差分が出て、読み手が何が変わったのか探すことになる。

## Risks / Trade-offs

- [将来 endpoint が無くなる形の再編が来たら、この Requirement が邪魔になる] → そのときは Requirement を変える change を起こす。**いま無い未来のために暫定と書かない**
- [「MCP ツールが実処理を持つ」ことを期待していた読み手がいる] → ADR-0016 にその期待が書かれている。`adr0016-sub-document-mcp-operations` が ADR の状態行に結論を反映する
- [オーバーヘッドが問題になる規模が来る] → 測ってから判断する。いまは `fetchNodeRequestHandler` の1段で、実測で問題が出ていない

## Migration Plan

1. `openspec/specs/mcp/server` に Requirement を1件足す（代行が確定した方式であること）
2. コードは変えない。テストも変えない
3. `openspec validate --all` が通ることを確かめる

戻すものが無い。
