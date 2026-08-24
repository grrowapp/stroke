## 1. 現状の確認（図に載せる名前を実在するものに限るため）

- [x] 1.1 本家の仕様書画面の経路を洗い出し、モジュール・関数・エンドポイントを行番号付きで控える（`SpecsPage.tsx` / `SpecViewerPage.tsx` / `multi-server.ts` の specs 系ルート / `dashboard/parser.ts` / `watcher.ts`）。控えた名前が 2.2.7 のソースに実在することを `grep` で確認する
- [x] 1.2 stroke-board の仕様書画面の経路を同じ粒度で控える（`specs/index.vue` / `[specName]/index.vue` / `[document].vue` / `useProjectApi.ts` / `server/api/**/specs/**` / `upstream-proxy.ts` / `rest.ts` / `schema.ts`）。同じく `grep` で実在を確認する
- [x] 1.3 WS 経路を両側で控える（本家: `SpecWatcher` → `broadcastToProject('spec-update')`、stroke-board: `UpstreamSocket` → `UpstreamMonitor` → `board.ts` → `useBoardSocket`）。控えた名前が実在することを確認する

## 2. 現状の資料

- [x] 2.1 `docs/spec-screen-flow.md` を作り、冒頭に対象範囲（仕様書の3画面）と基準（本家 2.2.7 / ADR-0004）を書く
- [x] 2.2 本家の現状シーケンス図（REST + WS）を Mermaid で書く。1.1 と 1.3 で控えた名前だけを使う
- [x] 2.3 stroke-board の現状シーケンス図（REST + WS）を Mermaid で書く。1.2 と 1.3 で控えた名前だけを使う
- [x] 2.4 両図に登場する名前が実在することを確認する（各シンボルを `grep` して0件が無いこと）

## 3. 提案の資料

- [x] 3.1 `docs/artifact-extension-plan.md` を作り、冒頭で「未決定の検討資料」であることと、決まっていない3点（定義の中身 / 置き場所 / 画面での並べ方）を明示する
- [x] 3.2 2.3 の図をベースに、拡張 artifact の層を挟んだシーケンス図を Mermaid で書く。既存のどの呼び出しが変わらないかが読み取れる形にする
- [x] 3.3 未決定の箇所を図中で `?` として残し、決めるべき問いを箇条書きで併記する
- [x] 3.4 本家 API から取れないもの（未知ファイルの本文）と、そのため FS 直読みになる箇所を図上で区別して示し、`read-only.test.ts` の制約（書き込み禁止・読み取りは対象外）を注記する

## 4. 仕上げ

- [x] 4.1 `docs/structure-design.md` から2つの資料への参照を1行ずつ張る（内容は複製しない）
- [x] 4.2 Mermaid が構文として通ることを確認する（`beautiful-mermaid` などでレンダリングし、エラーが出ないこと）
- [x] 4.3 コードに差分が無いことを `git status` で確認する（変更は `docs/` と `openspec/` のみ）
