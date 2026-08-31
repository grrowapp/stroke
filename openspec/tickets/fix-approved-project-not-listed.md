---
status: needs-triage
tags:
  - bug
---

# fix-approved-project-not-listed

承認で作ったプロジェクトが**本家 spec-workflow の一覧に載らない**。そのため steering の MCP ツールが対象を見つけられず、承認後の工程が1つも進まない。

## 事実

実測 2026-08-30。`yarn check:stroke --approve` で承認まで通し、プロジェクト `check-stroke-20260830-163107` を作った。`state.json` は正しい。

```json
{ "phase": "approved", "projectName": "check-stroke-20260830-163107",
  "invocation": "idle", "retries": 0, "runId": "dbd9d469-b673-483a-98fc-6a614ed58ef8" }
```

`.spec-workflow/` のひな型も出来ている。

```
/opt/projects/check-stroke-20260830-163107/.spec-workflow/
├── approvals
├── archive
├── specs
└── steering     ← 空のまま
```

steering の実行を起こしたところ、**MCP ツールは呼ばれた**（生出力 `.stroke-check/debug-log/dbd9d469-….json`）。

```
9  mcp__stroke-board__get-steering
9  mcp__stroke-board__submit-document
```

しかし**6回すべてが 404 で弾かれた**。

```
CALL   mcp__stroke-board__get-steering {'name': 'product'}
RESULT {"status":404,"errorCode":"upstream_error","error":"対象のプロジェクトが本家の一覧に無い。"}

CALL   mcp__stroke-board__submit-document {'type': 'steering', 'name': 'product', 'document': '# プロダクト概要…'}
RESULT {"status":404,"errorCode":"upstream_error","error":"対象のプロジェクトが本家の一覧に無い。"}
```

claude は product / tech / structure の3本を**書き上げて提出しようとしている**。成果物側の欠陥ではない。

## なぜ起きるか（仮説）

承認（U10）は `projectShareRoot` の下でディレクトリを改名するだけで、**本家へ登録する手当てを持たない**。ポータルの一覧は「`projectShareRoot` の直下1階層を走査し `.spec-workflow/` を持つものを拾う」（`docs/specs/core/settings-reference.md`）が、**本家 spec-workflow の一覧はそれとは別の経路**で、そちらに載っていない。

切り分けるべきは次の3つ。

1. 本家が一覧をどこから作るのか（`SPEC_WORKFLOW_HOME` = `/opt/projects/.spec-workflow-mcp` のグローバル状態か、走査か）
2. 載るために何が要るのか（登録の呼び出しか、特定のファイルか）
3. 承認の時点でそれを行うのか、steering の起動時に行うのか

## 影響

**`provide-operations-via-mcp` の 5.2 を塞いでいる本体である。** 同 change は `get-steering` と `submit-document(type: steering)` の成功経路を待っているが、この 404 がある限り通らない。

`adr0016-sub-add-stroke-check-approval-option` の 4.2 / 4.3 はこの事実の観測までで閉じており、修正はこちらへ委ねる。

## 前提

- **500 とは別の症状である。** flontier で見えていた 500（`fix-steering-tool-stage-error` が扱うはずだった）ではない。当該 change は change にも ticket にも実在しない（走査 2026-08-30）
- ツールが呼ばれるところまでは通っている。`steeringPrompt` がスキル（`write-steering-v2`）に依存していて弾かれる件は別（[[fix-missing-write-steering-skill]]）。検証では prompt を一時的に差し替えて到達させた
