## Why

仕様書の artifact を3本（requirements / design / tasks）から増やせるようにしたい、という検討が出ている。方式の候補は「本家が知らないファイルを名前衝突なく同居させ、stroke-board 側に一層挟んで扱う」併存方式である。

ただし現時点の判断材料はソースを読んだだけの机上の結論しかなく、**どこに何を挟むのかが図として存在しない**。この状態で実装に入ると踏み外す。まず現状の流れを可視化し、その上に基盤を置いた図を作る。

このチェンジが作るのは**資料だけ**である。方式の採否も、拡張 artifact の定義そのものも、ここでは決めない。

## What Changes

- `docs/` に、仕様書の画面に限定したシーケンス図を書き起こす
  - 現状 — 本家（spec-workflow-mcp 2.2.7）の仕様書画面の流れ
  - 現状 — stroke-board の仕様書画面の流れ
  - 提案 — stroke-board 側に拡張 artifact の基盤を挟んだ形
- 図は実装の語（モジュール名・関数名・エンドポイント）で書く。「取得する」ではなく `UpstreamRestClient.getSpecDocuments()` と書く粒度

## Capabilities

### New Capabilities

なし。資料のみで、動作は変わらない。

### Modified Capabilities

なし。

## Impact

- 追加: `docs/spec-screen-flow.md`（現状・事実）、`docs/artifact-extension-plan.md`（提案・未決定）
- コードの変更なし。`app/` `server/` には触れない
- 既存の `docs/structure-design.md` は層の積み方を持つ資料で、こちらは仕様書画面1本の流れを持つ。重複させず、structure-design.md からは参照だけ張る
