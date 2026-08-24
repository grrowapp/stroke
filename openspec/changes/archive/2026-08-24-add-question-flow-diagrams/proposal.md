## Why

問いの往復が、文章と表だけで書かれている。`docs/api-contract.md` は endpoint の一覧、`docs/stroke-modules.md` は画面側の使い方で、どちらも「誰がいつ何を送り、状態がどう動くか」を1枚で見せていない。

その結果、`state.json` の `currentQuestion` が「答え待ちの問い」と「再送のために覚えている問い」の2つの意味を持っていることに、実装が一巡するまで気付けなかった。接続時配信が答え済みの問いを流す経路も、追うのに時間がかかった。

図があれば、同じ見落としは起きにくい。

## What Changes

- 問いの往復を図で表す資料を足す
- 載せる図は3枚
  - **並び**: 概要 → ストローク → proposal → 差し戻し → 問い返し → 承認 の順で、誰（ユーザー・画面・サーバ・エージェント）が何を送るか
  - **状態**: `state.json` が持つもの（`phase` / `currentQuestion` / `invocation`）と、`strokes.json` に積まれる行が、どの受理で、どう変わるか。今の1問を持つ側と、済んだ往復を積む側の役割の違いを出す
  - **配信**: W1・W2 の2経路（接続時配信と提出時配信）が、それぞれいつ何を流すか
- 図は Mermaid で書き、Markdown に直接埋める（別ファイルの画像にしない）
- あわせて `docs/schema.md` を足す。図に出てくる入れ物（`state.json` / `strokes.json` / W1・W2 が流すもの / 各 endpoint の body）が、それぞれどんな形かを1枚にする
- schema には**検証の規定**（話題タグ12字・詳細説明300字・問い本文20字・選択肢の説明50字・選択肢1〜5件・推奨は多くとも1つ）を載せる。これらは今コードにしか無く、型からは読み取れない
- 既存の文章は書き換えない。図も schema も、既存の記述を置き換えるものではなく、同じことを別の見え方で示すもの

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。資料だけを足し、振る舞いを変えない。

## Impact

- `docs/` — 新規2ファイル（`question-flow.md` と `schema.md`）
- `CLAUDE.md` — Docs 一覧に2行
- `docs/api-contract.md` / `docs/stroke-modules.md` — 参照の1行を足すかは、図が出来てから判断する
- コードは変更しない
