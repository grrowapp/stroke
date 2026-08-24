## Why

`modularize-agent-question` は問いの往復を composable として切り出す change だが、呼び出し側から見た形——何を渡し、何が返り、画面に何を書くのか——は design.md の決定文にしかない。着地点の絵が無いまま実装に入ると、出来上がってから認識のずれが見つかる。

切り出す側の資料を先に置き、そこで認識を合わせてから実装に入る。

## What Changes

- `docs/stroke-modules.md` を追加する。`modularize-agent-question` で切り出す stroke のモジュールについてのリファレンス
- 載せるのは切り出す2つだけ。`useAgentQuestion`（往復）と `AgentQuestionModal`（面）。引数・返り値・設置の手順・呼び出し例を書く
- 既存の composable は載せない。実装の作業手順として tasks に名前が出ることはあっても、この資料が扱う対象ではない
- まだ実装されていないため、資料の冒頭に **予定**（`modularize-agent-question` の着地点）であることを明記する。実装が入った時点で印を外す
- 書くのは**使い方**に限る。振る舞いの規定（オーバーレイで開く・回答するまで閉じない・並び・送り直せる）は `openspec/specs/agent-question` が本体で、資料からは参照を張るだけにする
- `CLAUDE.md` の Docs 一覧に1行足す

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。この change は資料だけを足し、振る舞いを変えない。スキーマに `apply-tasks-flow`（proposal → design → tasks、`skip_specs: true`）を使う。

## Impact

- `docs/stroke-modules.md` — 新規
- `CLAUDE.md` — Docs 一覧に1行
- `openspec/changes/modularize-agent-question/tasks.md` — 実装時に予定の印を外すタスクを足す
- `app/` 以下のコードは変更しない
- 順序: この change を先に片付け、資料の内容で認識を合わせてから `modularize-agent-question` の実装に入る。実装の途中で着地点が変わったら、資料を直してから進む
