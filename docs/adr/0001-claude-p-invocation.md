# `claude -p` の起動フラグは設定値として外出しする

`grilling` と `domain-modeling` を模倣せず、`claude -p` から実際のスキルとして走らせる。起動フラグはコードに直書きせず**設定値として外に出し、再ビルドなしで調整できる**ようにする。既定値は次のとおり。

```
--setting-sources project
--add-dir  /home/vagrant/work/stroke-board/mvp
```

`--add-dir` は MVP の間このパスを使う。`grilling` と `domain-modeling` を含む `.claude/skills/` を持つのがここだから。

## Considered Options

開発者個人の設定（`~/.claude/CLAUDE.md`）をエンドユーザーのセッションに持ち込まないことが要件だった。`--setting-sources` から `user` を外すことでこれを満たす。

`project` を残すことが必須である。Agent SDK のドキュメントに次の記述がある。

> Skills are discovered through the `user` and `project` setting sources. If you set `settingSources`/`setting_sources` explicitly and omit those sources, **skills are not loaded**

> If you set `settingSources` explicitly, **include `'user'` or `'project'` to keep skill discovery**

`--setting-sources ""` は `user` と同時に `project` も落とすため、`--add-dir` で渡したスキルごと消える。`project` を指定した構成で `grilling` のロードと、個人設定の非適用（呼び名の問い合わせに `NONE`）を同時に確認した。

## 入力は `--` の後ろに位置引数として渡す

当初は prompt を stdin から渡していた。`--allowedTools` が値を複数取るフラグで、後ろに置いた位置引数を飲み込むためである。しかしこれは入力の受け口を stdin と位置引数の2本に分ける形になり、届かなかったときにどちらの経路の問題かが切り分けられない。

`--` を置けば option の解釈がそこで打ち切られ、可変長フラグの後ろでも位置引数として届く。stdin を使う理由がなくなるため、入力経路を位置引数の1本にする。

```
claude -p --output-format json --setting-sources project --add-dir <repo> \
  --model <model> --resume <uuid> --allowedTools "Read Bash Edit" -- '<prompt>'
```

**実測（Claude Code 2.1.210 / 2026-08-18）**: 上記のフラグ構成で `--` の後ろに置いた文字列が、欠落もフラグ値への取り違えも無く本文として届くことを `--output-format stream-json` で確認した。フラグを増減しても届き方は変わらない。

`--` を置く位置は全フラグの後ろとする。`--allowedTools` を末尾に付ける制約は不要になる。

## Consequences

- `--setting-sources` に `project` を含めることは**スキル探索の前提条件**。値を絞る場合もここを外してはならない。
- 入力の受け口は位置引数の1本だけとする。stdin へは何も書かない（`stdio` の stdin は `ignore`）。
- フラグを増やすときは `--` より前に置く。`--` の後ろは全て prompt として扱われる。
- `--add-dir` に渡すのは**リポジトリのルート**。`.claude` や `skills` をパスに含めない。渡したディレクトリ配下の `.claude/skills/` が読まれ、公式仕様では live reload が効く。スキルを複製しないため、本体を更新すれば実行中のセッションに反映される。
- `--add-dir` は MVP の間 `/home/vagrant/work/stroke-board/mvp` に固定する。`stroke-board` へマージした後は値が変わるが、フラグを設定値として外出しする本 ADR の中心決定で吸収される。
