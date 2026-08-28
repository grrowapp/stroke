---
status: ready-for-agent
tags:
  - enhancement
---

# add-stroke-check-approval-option

`yarn check:stroke` が proposal で終わるため、steering 工程を一度も通せていない。承認まで進めるかどうかを選べるようにする。

## 事実

`scripts/stroke-check.ts` は proposal に着地したらそこで終える。

```
if (await waitForNext(page, previous) === 'proposal') return { rounds, landed: true, sessionId }
```

承認（「承認して作る」）は押さない。そのため steering 工程に入らず、次の2つが**一度も成功していない**（2026-08-28 時点）。

- `mcp__stroke-board__get-steering`
- `mcp__stroke-board__submit-document`（`type: steering`）

`get-steering` が flontier で 500 になる件（`fix-steering-tool-stage-error`）も、承認後なら通るのかどうかが確かめられていない。

あわせて、検証で作ったセッションが `projectShareRoot` に残り続ける。

## 求めるもの

- 承認まで進めるかどうかをオプションで選べる。既定は proposal で止める（承認はプロジェクトを生成する不可逆な操作のため）
- 承認まで進めた場合、steering 工程の往復も同じ枠組みで追え、着地の判定に含まれる
- 検証で作ったセッションを最後に片付けるかどうかもオプションで選べる

## 前提

- 操作はブラウザのみ。サーバーを直接叩かない（画面側の状態と食い違い、回復できなくなる。実測 2026-08-28）
- 承認するとセッションディレクトリがプロジェクト名へ改名され、`/opt/projects/<name>/` になる。片付けの対象が変わる点に注意
