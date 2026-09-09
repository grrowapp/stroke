# claude -p の実測

`claude -p` をソースではなく実機で叩いて確かめた事実。規定そのものは
`../../../openspec/specs/agent/invocation/spec.md` と
`../../adr/0001-claude-p-invocation.md` にある。ここに置くのは**その規定がなぜそう
決まったか**で、挙動が変わったときに再検証を始める起点になる。

`upstream-observations.md`（本家 spec-workflow-mcp）と同じ役目の文書である。

出所は `.scratch/stroke-board-frontier/decisions.md`。MVP 当時の決定メモで、
プロダクト・画面・生成物の記述は docs と specs へ確定済み（かつ保存先の記述は現行と
食い違っていた）ため落とし、**どこにも無かった実測だけ**をここへ移した。

## 失敗した往復もセッション履歴に記録される

**測ったバージョン: Claude Code 2.1.233**（2026-08-18 時点）

手順と結果:

1. `ALPHA` を送って `READY` を得る
2. `BETA` を含む入力を送信し、6秒で強制終了させる — 終了コード 124、出力は `Execution error`
3. `--resume` で「これまでに覚えるよう言われた語」を尋ねる → **`ALPHA, BETA` が返る**

プロセスが応答を返す前に落ちても、入力は履歴に入っている。

したがってリトライを単純な再送にすると、ユーザーが1回書いた差し戻しが会話上は2回入る。
これが `openspec/specs/agent/invocation/spec.md`「Requirement: リトライで入力を再送しない」
の根拠である。**バージョンが上がってこの挙動が変わったら、その Requirement を見直す。**

## `--add-dir` の先の CLAUDE.md は既定で読まれない

`--add-dir` で足したディレクトリの `CLAUDE.md` は、既定では読み込まれない。
読ませるには `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` を立てる。

## 可変長フラグと位置引数

`--allowedTools` のような可変長フラグは、後続の位置引数（prompt）を飲み込む。

当初は stdin から prompt を渡す形にしていたが、**2026-08-18 に覆った**——`--` を置けば
option の解釈が打ち切られ、可変長フラグの後ろでも位置引数として届く。入力経路を2本
持たないため stdin をやめ、`--` の後ろの位置引数1本にした。決定は
`../../adr/0001-claude-p-invocation.md`。

## セッションの継続

- 自前で uuid を採番して `--session-id <uuid>` で始め、以降は `--resume <uuid>`
- `--output-format json` の `type:"result"` の `result` フィールドが応答本文。コストも同じ JSON に含まれる

## 保存先の権限

`/var/lib` は実行ユーザー `vagrant` では書き込めない（実測）。
`DEFAULT_SESSIONS_ROOT`（`../../adr/0003-settings-precedence.md`）を既定のまま使うなら、
`/var/lib/stroke-board/` の作成と所有権付与はアプリの外で行う配置作業として残る。
