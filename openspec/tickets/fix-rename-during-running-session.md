---
origin: user
date: 2026-09-08
change: fix-rename-during-running-session
order: -6.0
triage:
  - bug
status: Doing
tags:
  - proposal
  - specs
  - design
  - tasks
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
  - pre5/972b5d16-a8c6-4953-9fa9-f1ed4273b60d
---

# fix-rename-during-running-session

改名が走行中の flontier の claude を置き去りにする欠陥。**根本原因は責務境界**——proposal を
提出する endpoint（A7）が phase の切り替えと配信まで持っているため、claude の実行が終わる前に
承認できる局面が立つ（ユーザー指摘 2026-09-09）。実行の決着は claude のプロセスを制御する
invokeAi の責務であり、endpoint は記録だけを行う。あわせて **409 busy という応答を契約から
無くす**（ユーザー指示 2026-09-09）。

## 起票時の症状（2026-08-31）

承認によるディレクトリ改名が、走っている claude を見ていなかった。busy ガードは sessionId
キー、改名後の steering はプロジェクト名キーで、同じ物理ディレクトリに対して2つの claude
が別々の lock で同時に走れた。`rename(2)` は inode を保つので旧 claude は改名先で生き続けるが、
自分を名乗る id は旧 sessionId のままなので以後のツール呼び出しが全部 `session_not_found`
になり、`invocation` もどこにも残らなかった。

## 起票時からの乖離

1. **改名の主体が U10 承認 → U14 昇格へ移った**（`8df64ca6`）
2. **サーバ側の busy ガードは入っている**（`c086907e`、2026-09-01）。キーは作業場所の実体
   （`stat` の `dev`/`ino`）。しかしこれは承認できる局面が実行中に立つことを前提に後ろで
   受け止めているだけで、入口を塞いでいない
3. **根本原因は A7 の責務**。A7 は「残す → phase を `proposed` に → W2 配信」を実行中に行う。
   phase `proposed` が立った瞬間に承認できるが、claude はまだ終了処理中
4. **画面が 409 busy を握りつぶしている（ADR 0022）**。`promote()` は `name-conflict` しか
   分岐しない
5. **busy という応答が「待って出し直す」責務を呼び手に負わせている**（`pendingRun`・
   二重キック）
6. **docs は busy を規定しているが、その前提（実行中に承認できる局面が立つ）ごと変える**
7. **artifact が消えていた**（`ea943b7e`）→ design.md を作り直して Decision 2 を復元

## 現時点での対応内容

- **根本: 提出の endpoint（A5・A7）は記録だけ。実行の決着（phase の切り替え・W1/W2 配信）は
  invokeAi が完了時に行う**（steering の完成の記録 U15 と同型）
- 画面2 の承認は phase `proposed` で（現状どおり）。phase は決着でしか立たないので、実行中に
  承認は存在しない
- **409 busy を契約から消す。** U13 は冪等（実行中なら要求は満たされている）。U14・U11・P1 に
  実行中の要求が届く経路は無い
- 規定: `agent/invocation`・`api/stroke/question`・`api/stroke/proposal`・`api/session/ws`・
  `stroke/frontier`・`api/session/invoke-agent`・`api/session/promote`・`api/session/delete`・
  `api/project/delete`
- `ui` は作らない（design Decision 7）
- 登録済み（2026-09-09 承認）: `docs/adr/0022-no-one-swallows-a-response.md`
- 提案中（承認待ち）: docs 8件（`contract.md` A5/A7/W1/W2/約束/U13、
  `sessions/{invoke-agent,promote,delete}.md`、`projects/delete.md`、`activate.md`、
  `architecture/question-flow.md`）。design.md「docs・ADR への反映」。承認後に docs を直し、
  tasks へ

## 他の change との関係

- `replace-polling-with-push`: 同じ `useWaitingRetry` に触る。本 change は `pendingRun`・
  `BUSY_RETRIES` の削除だけ。順序はユーザー判断
- `api/stroke/proposal`・`submission` の spec は「正として扱わない」注記あり（ADR 0019）。本
  change の規定は endpoint の path を問わない

## 畳む方向

specs delta と実装を入れ、「proposal の提出 → 決着前は画面2 が開かない → 決着 → 承認 → 改名の
時点で実行が無い」を E2E で固定し、docs を承認を経て直して archive する。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
同 change の範囲外として記録していたが、範囲外の扱いは不正だとユーザーが指摘（2026-09-01）
して起票した。

対応する change: `fix-rename-during-running-session`
