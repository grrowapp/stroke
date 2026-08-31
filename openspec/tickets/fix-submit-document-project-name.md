---
status: needs-triage
tags:
  - bug
---

# fix-submit-document-project-name

MCP ツール `submit-document` に **projectName を渡す口が無い**。そのため MCP 経由で提出した proposal には名前が付かず、**人が承認する画面で名前欄が空のまま「作る」が押せない**。

## 事実

実測 2026-08-30。`yarn check:stroke --approve` を回したところ、道具がこう告げた。

```
proposal が名前を出していない。check-stroke-20260830-163107 で進める
```

A7（proposal の提出）の契約は `{ proposal, projectName? }` を受ける（`docs/specs/api/contract.md`）。画面は `ProposalMessage.projectName` を承認モーダルの名前欄の初期値に入れる。しかし MCP ツール側の `inputSchema` にはその口が無い。

```
server/mcp/tools/submit-document.ts
  type:     'flontier' | 'steering'
  document: 文書の本文そのもの
  name:     type が steering のときの文書名（product / tech / structure）
  ← projectName に相当する項目が無い
```

エージェントは MCP ツール以外の経路で提出しない決まりなので（ADR-0016）、**MCP 経由の提出では projectName が常に null になる**。

## 何が塞がるか

- **人が承認できない。** 名前欄が空だと `approveBlocked` が解けず「作る」が押せない。承認はプロジェクト生成の唯一の引き金なので、そこで流れが止まる
- **`check:stroke` の名前衝突の検証が踏めない。** 道具は名前が空のとき `fallbackProjectName()`（`check-stroke-<日時>`）で迂回する。日時が入るので2回続けて回しても衝突せず、`adr0016-sub-add-stroke-check-approval-option` の 4.6（サフィックスによる再試行）が自然には確かめられない

## 求めるもの

`submit-document` の `type: 'flontier'` のときに projectName を受け、A7 へ渡す。

- 契約（A7）は既に受ける形なので、変えるのはツール側だけで足りるはず
- kebab-case かどうかの判定は受け口が持つ（`project.ts` の `isKebabCase`）。ツールは形だけを渡す
- `type: 'steering'` のときは対象が既にプロジェクトなので projectName は要らない。`name`（文書名）と混同しないこと

## 前提

- 承認まで到達した先で steering が 404 で弾かれる件は別（[[fix-approved-project-not-listed]]）。こちらは承認そのものに入る手前の話である
- 道具の迂回（`fallbackProjectName`）は検証を進めるための手当てであって、成果物の欠陥を隠すためのものではない。この change が入れば迂回は不要になる
