## Why

Claude Code の `settings.json` は現状、テキストエディタでの手編集が前提になっている。キーごとに許される構造（`permissions` の配列、`hooks` のオブジェクト、`model` の文字列指定など）が異なるにもかかわらず、それを踏まえた編集手段がない。手編集は構文エラーや、キーの意味を踏まえない誤った追記を招きやすい。`setai` は、キー単位でその構造を理解したサブコマンドを提供し、`settings.json` を安全に編集できるようにする。

## What Changes

- 新規: `setai` CLI を追加する。`settings.json` の各キーに対応するサブコマンドを持ち、読み込み・編集・書き込みの責務はサブコマンドが単独で持つ
- 新規: `setai` の操作をメニュー形式で選んで実行できる TUI を追加する。CLI と同じサブコマンドの実装を呼び出す、CLI 操作の別の入り口
- 新規（副産物）: スキーマに依存しない汎用 JSON 編集 CLI を追加する。`setai` から見て、キー固有の知識を持たない下位ツール
- 新規（副産物）: Go プログラムから呼び出せる JSON 編集ライブラリを追加する。上記2つの CLI はどちらもこのライブラリの上に実装される

## Capabilities

### New Capabilities
- `tools/json-edit-lib`: 任意の JSON データに対し、スキーマに依存しない値の取得・設定・削除を提供する Go ライブラリ
- `tools/json-edit-cli`: 上記ライブラリを使った、任意の JSON ファイルを対象にする汎用 CLI
- `tools/setai-cli`: Claude Code の `settings.json` を対象に、キーごとのサブコマンドで編集する CLI。メインコマンドはルーティングと共通の前処理・後処理のみを担い、個々のキーの知識を持たない
- `tools/setai-tui`: `setai-cli` のサブコマンド操作をメニュー形式で選択・実行できる対話型 TUI

### Modified Capabilities
（なし。新規プロダクトであり、既存 capability の要求を変更しない）

## Impact

- 影響コード: なし。既存の stroke-board アプリケーションコードには変更が及ばない。新規の Go モジュール・CLI・TUI として追加する
- 新規依存: Go ツールチェーン、TUI 用ライブラリ（選定は design.md の Open Questions を参照）
- 対象システム: Claude Code の `settings.json`（読み取り・書き込みの対象）。stroke-board 自体の設定（`NUXT_*` 環境変数など、ADR-0003/0004 の対象）とは別物であり、それらの決定には触れない
