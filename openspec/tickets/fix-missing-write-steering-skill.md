---
status: needs-triage
tags:
  - bug
---

# fix-missing-write-steering-skill

承認後の steering の起動が、**存在しないスキルを呼んでいる**。claude は未知のコマンドとして弾き、何もせず正常終了する。設定の正はそのスキルが在る前提で書かれている。

## 事実

実測 2026-08-30。承認まで通したプロジェクトで steering の実行が起きたが、成果物は1つも出来なかった。生出力（`.stroke-check/debug-log/dbd9d469-….json` の1件目）の最終結果はこれである。

```json
{ "subtype": "success", "is_error": false,
  "result": "Unknown command: /write-steering-v2" }
```

**MCP ツールの呼び出しは0件。** `get-steering` も `submit-document` も呼ばれていない。プロセスは正常終了し、`invocation` は `idle` になる。失敗として記録されないので、巡回も拾わない。

渡している定型は `runtimeConfig.claude.steeringPrompt`。

```
/write-steering-v2

スキルの指示に従って steering 文書を作成する。
```

**このスキルが存在しない。** worktree の `.claude/` の中身は `settings.json` だけで、`.claude/skills/` というディレクトリが無い。

## 資料との食い違い

`docs/specs/core/settings-reference.md` の `claude.steeringPrompt` はこう書いている。

> 起動するスキル `write-steering-v2` はこのリポジトリの `.claude/skills/` に在り、`--add-dir` 経由でロードされる（ADR 0001）。`write-steering`（v2 でない方）は対話インタビュー（`grill`）を含み、無人実行では進まないため使わない。

**設定の正が、実在しないものを前提にしている。** ADR-0004 の「資料と食い違うコードは誤り」はコード側を直す規定だが、ここは資料の側が実体を欠いている。

## 求めるもの

どちらを採るかを決める。

1. **スキルを置く** — `.claude/skills/write-steering-v2/` を用意する。資料の記述はそのままでよい。`--add-dir` にリポジトリのルートを渡す仕掛け（ADR 0001）はすでに在る
2. **スキルに依らない定型にする** — `steeringPrompt` を、MCP ツールを直接指す指示へ変える。設定の変更なので ADR-0004 の手続き（change → 承認 → 資料 → コード）が要る

検証では 2 の形（`get-steering` で現状を見て `submit-document` で type=steering を3本提出する、という指示）を**一時的に**入れて通した。ツールは実際に呼ばれ、claude は3本とも書き上げた。**定型を変えれば動く**ことは確かめてある。

## 前提

- **これだけでは steering は着地しない。** ツールに到達した先で、6回すべてが `404 対象のプロジェクトが本家の一覧に無い` で弾かれる（[[fix-approved-project-not-listed]]）。こちらは「ツールに到達すらしない」層の問題である
- 定型を変える場合、`settings-reference.md` の当該記述（スキルの在り処）も一緒に直す。ADR-0004 によりユーザー承認が要る
