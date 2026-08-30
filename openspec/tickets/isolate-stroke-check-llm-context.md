---
status: ready-for-agent
tags:
  - bug
---

# isolate-stroke-check-llm-context

`yarn check:stroke` が呼ぶ haiku に、stroke-board の作業文脈が混ざる。依頼主として答えていない。

## 事実

道具は2箇所で haiku を呼ぶ（`scripts/stroke-check.ts`）。

- `draftFreeAnswer` — 自由記述の回答を書かせる（`--policy free`）
- `draftSendBack` — 差し戻しの指摘を書かせる（`--send-back`）

どちらも `claude -p --model haiku` を **pre5 の cwd のまま**起動している。そのため `CLAUDE.md` などの設定が読まれ、haiku が「自分は stroke-board の作業中である」と解釈する。

実測 2026-08-29（セッション `d823166d-…`）。

```
Q1 副産物の扱い: 独立成果物にする?
  → stroke-board/pre5の現在の文脈では直接関連していませんが、提示されている問いに対して
    のアドバイスをします。

Q2 直接起動可否: 直接起動も要る?
  → …stroke-board 全体の運用を見て、他の機能からこのサブコマンドを自動実行する必要が
    あるかで決めてください。
```

Q1 は実質無回答である。渡した概要は setai（`settings.json` を編集する CLI）で、stroke-board とは無関係なのに、haiku は自分の置かれた場所を答えの前提にしている。

**回答の質は往復の質を決める。** 依頼主の役を演じきれないと、エージェントが受け取る材料が痩せ、往復の中身が測れない。

## 求めるもの

- haiku を、道具のリポジトリの文脈から切り離して呼ぶ
- 渡すのは問い（見出し・背景・問い・選択肢）と、依頼主としての役だけにする
- 差し戻しの指摘についても同じ。読ませるのは着地した proposal の本文だけにする

## 前提

- ここで claude を直接呼ぶこと自体は、検証の原則「操作はブラウザのみ」に反しない。その原則は stroke の工程を動かす claude（`invoke.ts` が spawn する側）にかかる。haiku は工程の外に居る人間の代役である
- モデルは haiku のまま（ユーザー指示 2026-08-29）
- `--policy free` の回答が定型文だった問題は解消済み（同日、haiku 生成に置き換え）。往復は1回から6回に増えた。残るのは中身の質である
