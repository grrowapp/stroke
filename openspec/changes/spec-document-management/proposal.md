## Why

現在の仕様書画面が映しているのは本家 spec-workflow の feature 単位の文書（requirements / design / tasks）で、その帰結は tasks、つまり実装作業である。システムを**ドキュメントとして**記述し続ける本来の意味での仕様書には tasks は無く、いまの stroke-board にはその置き場も管理の場も無い。仕様書画面が feature に改名された後、空いた「仕様書」の名を、この本来のドキュメント管理に充てる。

**前提**: 現在の仕様書画面の feature への改名は表示名としては済んでいる（ナビ・上層の一覧とも「Feature」表記）。ただし URL パスとページのディレクトリ名は `specs` のまま残っている。

## What Changes

- 下層に**仕様書管理画面**を新設する。管理対象はプロジェクト配下の `docs/` に置かれた Markdown 文書（承認時に生成される `docs/proposal.md` もここに含まれる）。
- 文書の**閲覧・編集**に加え、**削除**までできるようにする。文書の**作成**は本 change に含めない（別 change `create-spec-document` で扱う）。
- 下層の操作制限（読む + 承認応答 + 既存文書の編集・保存）を広げる。文書の削除は本家の状態を変えるものではなく、プロジェクト配下のファイル操作である。
- 文書の実体を一覧・読み書き・削除するサーバ API を追加する。
- 管理対象は本家（spec-workflow-mcp）から受け取るデータではなく、プロジェクト配下の実ファイルである。本家データの加工・再構成（ADR 0005）には当たらない。

## Capabilities

### New Capabilities

- `spec-documents`: プロジェクト配下 `docs/` の仕様書文書の管理。一覧・閲覧・編集・削除の振る舞いと、その画面・API の境界を定める。

### Modified Capabilities

- `project-workspace`: 下層の画面構成（仕様書 / ステアリング / タスク / 承認の4画面）に仕様書管理画面を位置づけ直す。「下層で状態を変えられるのは承認への応答（と文書の編集・保存）だけ」の要件に、`docs/` 配下の文書の削除を加える。
- `document-editing`: 「編集できる文書は6本に限る」の要件を、プロジェクト配下 `docs/` の仕様書文書にも開く。

## Impact

- **URL の衝突**: feature 画面が URL パス `specs` を占めたままである。新設する仕様書管理画面の URL をどう切るか（`specs` を feature から明け渡させるか、別のパスを使うか）は design で決める。
- 画面: `app/pages/projects/[projectId]/` 配下に新画面、`app/layouts/workspace.vue` のナビゲーションに項目追加。
- サーバ: `docs/` 配下の一覧・取得・保存・削除の API を `server/` に追加。作成の API は `create-spec-document` 側で扱う。
- 削除はデータを失う操作であり、確認の挟み方は design で扱う。
