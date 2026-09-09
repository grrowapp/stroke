---
origin: user
date: 2026-09-09
change: update-invoke-agent-responsibility-boundary
status: Wait-for-archive
tags:
  - proposal
  - specs
  - design
  - tasks
  - update-invoke-agent-responsibility-boundary/a04d91b2-fbab-4863-92d4-b9784e170ec7
---

# update-invoke-agent-responsibility-boundary

MCP ツールと invoke-agent の責務境界を切り直す（ユーザー指示 2026-09-09）。起票時の名前は
`update-project-creation-trigger-to-approval-submission` で、範囲の拡大に伴い改名した。

## 起票時の状態

- steering 工程の作業判定（`didWork`）の材料を MCP ツール `submit-document` が作っている。
  本家 PUT の 2xx を見て起動 token をメモリの `Set` に記録し（`submission-signal.ts`）、
  invokeAi はプロセス終了後にそれを読む
- 完成の条件は「steering 文書の提出が1本以上受理された」。承認依頼が1件も無いまま完了が
  決着する経路が `project/generation` に「別途定める」として残っている
- MCP ツール共通の契約と invoke-agent の責務範囲を定めた docs が無い。invoke-agent の設計
  記述は `api/contract.md`・`api/sessions/invoke-agent.md`・`api/sessions/activate.md`・
  `architecture/session-workflow.md`・`plan/portal-stroke-exit.md` に散っている
- 本家 REST に承認依頼を作る route は無い（2.2.5 実測）。作成は本家 MCP の `approvals`
  ツールだけ

## 畳む方向

1. docs へ `mcp/contract.md`・`architecture/invoke-agent.md` を書き出す。MCP ツールは工程の
   中でだけ存在し、代行以外の固定の処理を受け持たない。`submit-document` は登録の代行のみ。
   claude プロセスの起動・判定・token は invoke-agent の責務
2. 散っている invoke-agent の設計記述を `architecture/invoke-agent.md` へ集約統合する
3. docs の定義に沿って実装する。steering の `didWork` は本家 REST への問い合わせ（3本の
   文書と3件の承認依頼）にし、`submit-document` から記録を外す。承認依頼の手段として本家
   MCP を配線し直し、承認依頼のツール `approvals` を許可する。docs の「第三者の MCP を
   配線しない」は記述ごと撤廃する（ユーザー決定 2026-09-09。狭めて残す案は却下）

## 経緯

- 2026-09-09: 「proposal 後に claude に approval の提出を必須とし、approval の提出がプロジェクト
  作成成功のトリガーとなる形に」で起票
- 同日: steering の提出が `submit-document` → 本家 PUT の代行であること、phase の書き換えは
  invokeAi が U15 を叩いて行うこと、判定の材料がメモリの `Set` であることを確認
- 同日: ユーザー指示で範囲を責務境界の切り直しへ拡大。「invoke-ai が指定の endpoint を確認して
  phase を変えるのが正しい設計」「token セットは常に invoke-ai の責務」

対応する change: `update-invoke-agent-responsibility-boundary`
