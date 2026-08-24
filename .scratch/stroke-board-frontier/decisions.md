# stroke-board-frontier — 決定事項

`stroke-board` の MVP。別走のため `frontier` を付けている。最終的に `stroke-board` へマージされる。

`/grill-with-docs` セッションで確定した内容。`/to-spec` の入力。

用語は `CONTEXT.md`、`claude -p` の起動条件は `docs/adr/0001-claude-p-invocation.md` を参照。

## プロダクト

- 流れは 概要 → ストローク（質疑応答）→ proposal → 差し戻し → 承認 → プロジェクト生成。
- 「把握完了」の判定は自作しない。`grilling` の終了条件（フロンティアが空 = 設計ツリーの全枝を訪問済み）をそのまま使う。
- proposal は OpenSpec の proposal 形式に従う（`## Why` / `## What Changes` / `## Capabilities` / `## Impact`）。形式のみ流用する。
- 差し戻しへの対応方法は AI が指摘内容を読んで判断する。「全文を書き直す」「一部だけ直す」といったモードを設計時に固定しない。プロンプトに追加の指示を入れない。
- 単一ユーザー。認証は作らない。

## 画面

- 画面1: ストローク。概要入力、質疑応答の履歴、入力欄。
- 画面2: proposal 確認。Markdown プレビュー、承認、差し戻し。
- 2画面は自由に行き来できる。

## 生成物

- 承認時に `/opt/projects/<name>/` を作る。作るのは**トップのディレクトリのみ**で、`.spec-workflow/` の内部構造は作らない（後に spec-workflow がプロジェクトルートとして受け取る）。
- proposal は `/opt/projects/<name>/docs/proposal.md` に置く。
- `<name>` は AI が kebab-case で提案し、ユーザーが承認画面で確定する。既存名との衝突を確認する。
- 承認後のセッションディレクトリのクリーニングは MVP に入れない。

## 技術

- Nuxt 4 + Nuxt UI + Tailwind CSS。
- パッケージマネージャは yarn（実行環境に v4.17.0 あり）。
- AI は `claude -p` を起動して呼ぶ。`grilling` と `domain-modeling` を模倣せず、実際のスキルとして走らせる。
- 起動フラグは設定値として外出しする。`--setting-sources project` が必須である理由を含め、詳細は ADR 0001。
- 実行環境のパスは `stroke-board` を使う。`frontier` はドキュメント上で本 MVP を識別するための呼称であり、実行時のディレクトリ名には持ち込まない。
- `claude -p` が失敗したらサーバ側でリトライする。ユーザーには見せない。リトライしても進めない場合のみエラーを表示する。
- **リトライは単純な再送にしない。** 失敗した往復もセッション履歴に記録されるため（下記）、同じ入力を送り直すと二重に入る。リトライ時は入力を送り直さず、続きを促す形にする。

### セッションディレクトリ

`claude -p` の cwd。セッションごとの使い捨てで、AI が書く生成物も自動的にここへ落ちる。

```
/var/lib/stroke-board/sessions/<uuid>/
├── state.json      本アプリが書く（phase / projectName）
├── proposal.md     最新の proposal。差し戻しのたび上書き
└── CONTEXT.md      domain-modeling が書く
```

`/var/lib` は実行ユーザー `vagrant` では書き込み不可（実測）。`/var/lib/stroke-board/` の作成と所有権付与は、アプリの外で行う配置作業として残る。

### 状態

- 保存するのは `state.json` 1つ。会話履歴は `claude -p` が `--resume` で保持するため二重に持たない。
- `phase` は `stroking` / `proposed` / `approved`。
- uuid はディレクトリ名なので `state.json` に持たない。

### `claude -p` の呼び出しメモ

- ~~`--allowedTools` のような可変長フラグは位置引数の prompt を飲み込む。**prompt は stdin から渡す。**~~
  **覆った（2026-08-18）**: `--` を置けば option の解釈が打ち切られ、可変長フラグの後ろでも位置引数として届く。入力経路を2本持たないため stdin をやめ、`--` の後ろの位置引数1本にした。詳細は `docs/adr/0001-claude-p-invocation.md`。
- セッションの継続は `--session-id <uuid>` で自前採番し、以降 `--resume <uuid>`。
- `--output-format json` の `type:"result"` の `result` フィールドが応答本文。コストも同じ JSON に含まれる。
- `--add-dir` からは、そのディレクトリの `CLAUDE.md` は既定で読み込まれない（`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` を立てた場合のみ）。

## 保留

- `--allowedTools` の中身は MVP では決めない。

## 確認済みの挙動

**失敗した往復もセッション履歴に記録される。**

実測（Claude Code 2.1.233）：`ALPHA` を送って `READY` を得た後、`BETA` を含む入力を送信して6秒で強制終了させた（終了コード 124、出力は `Execution error`）。その後 `--resume` で「これまでに覚えるよう言われた語」を尋ねると `ALPHA, BETA` が返った。プロセスが応答を返す前に落ちても、入力は履歴に入っている。

したがってリトライを単純な再送にすると、ユーザーが1回書いた差し戻しが会話上は2回入る。リトライは入力を送り直さず、続きを促す形にすること。
