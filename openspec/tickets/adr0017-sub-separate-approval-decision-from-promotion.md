---
status: needs-triage
change: adr0017-sub-separate-approval-decision-from-promotion
tags:
  - enhancement
---

# adr0017-sub-separate-approval-decision-from-promotion

`POST /api/strokes/:id/approve` が1回の呼び出しで行っている3つを、別々に扱えるようにする。

いまこの endpoint は次を続けて実行する。

1. 承認の判断を確定する（`phase: 'approved'`）
2. プロジェクトへ昇格させる（セッションディレクトリを `/opt/projects/<name>/` へ改名）
3. steering のエージェント（`claude -p /write-steering-v2`）を起動する

**やること。** この3つを別々の段として扱えるようにし、次の3つを成り立たせる。

- **承認を確定した後、昇格の前に取り消せる余地を作る。** いま承認は1押しで確定し、その瞬間に改名とエージェントの起動まで進むため、押し間違いが戻せない。`adr0017-sub-update-ui-approval-review` が承認と即時却下を同じ並びに置くので、隣り合うぶん押し間違いの危険が増える
- **失敗した段だけをやり直せるようにする。** いまは後始末を1つの関数が抱えている（改名が失敗したら `phase` を書き戻す、steering のキックが届かなければ `invocation` を `failed` に倒す）。どの段で失敗したかによって戻す先が変わるのに、その分岐が endpoint の中に埋まっている
- **昇格と steering の起動を切り離す。** いま起動が失敗しても昇格は残るので、`failed` を拾って起こし直す巡回が要る

**変えないこと。** `CONTEXT.md` の「承認はプロジェクト生成の唯一の引き金」は変えない。引き金であることと、同じ操作の中で全部を走らせることは別である。

**触る範囲。** `POST /api/strokes/:id/approve` の実装と、その後始末を抱えている範囲。

**依存。** `adr0017-sub-update-ui-approval-review` が承認と即時却下を隣に置くため、両者の順序を決めてから着手する。
