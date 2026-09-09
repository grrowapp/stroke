---
origin: user
date: 2026-09-08
change: fix-rename-during-running-session
order: -6.0
triage:
  - bug
status: Planning
tags:
  - proposal
  - specs
  - design
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
---

# fix-rename-during-running-session

改名が走行中の flontier の claude を置き去りにする欠陥。**サーバのガード（inode キー・U14 の
409 busy）は入っているが、「承認できる状態なのに AI が走っている」状態そのものが画面に存在
する。** 直すのはこの状態の存在であり、あわせて **409 busy という応答を契約から無くす**
（ユーザー指示 2026-09-09）。

## 起票時の症状（2026-08-31）

承認によるディレクトリ改名が、走っている claude を見ていなかった。busy ガードは sessionId
キー、改名後の steering はプロジェクト名キーで、同じ物理ディレクトリに対して2つの claude
が別々の lock で同時に走れた。`rename(2)` は inode を保つので旧 claude は改名先で生き続けるが、
自分を名乗る id は旧 sessionId のままなので以後のツール呼び出しが全部 `session_not_found`
になり、`invocation` もどこにも残らなかった。

## 起票時からの乖離

1. **改名の主体が U10 承認 → U14 昇格へ移った**（`8df64ca6`）
2. **サーバ側のガードは解消済み**（`c086907e`、2026-09-01）。キーは作業場所の実体
   （`stat` の `dev`/`ino`）。テストあり
3. **画面2 が「AI が動いている」と知るのは自分が起動した実行だけ。** proposal が届いた直後・
   差し戻し中のリロード・巡回の再起動・別タブ、いずれも承認ボタンが有効なまま押せる
4. **画面が 409 busy を握りつぶしている（ADR 0022）。** `promote()` は `name-conflict` しか
   分岐しない
5. **busy という応答が、呼び手に「待って出し直す」責務を負わせている。** `useWaitingRetry` の
   `pendingRun`・巡回と画面の二重キック・承認画面の握りつぶしは、いずれもその責務の
   取りこぼし
6. **`invocation` の変化が画面へ push されていない**
7. **docs は規定しているが specs が追従していない**
8. **artifact が消えていた**（`ea943b7e`）→ design.md を作り直して D2 を復元

## 現時点での対応内容

- **設計の本体 1: 承認・削除の操作はサーバの `invocation` が `idle` のときにだけ存在する。**
  `invocation` の変化を W1・W2 に種別として載せて push する
- **設計の本体 2: 409 busy を無くす。** 実行と両立しない操作（起動・昇格・削除）が実行中に
  届いたら、断らず予約して 202 で受理し、実行の終わりにサーバが行う。予約は対象ごと・
  種類ごとに1件。単位は作業場所の物理ディレクトリ
- 承認後の steering の起動は巡回だけが行う（画面の `kickSteering` を外す）。U14 は引き渡し
  直後に巡回を1回走らせる
- 規定: `stroke/frontier`・`api/session/ws`・`api/session/invoke-agent`・`api/session/promote`・
  `api/session/delete`・`api/project/delete`（後2つは busy の Requirement を REMOVED）
- `ui` は作らない（design D7）
- 登録済み（2026-09-09 承認）: `docs/adr/0022-no-one-swallows-a-response.md`
- 提案中（承認待ち）: docs 7件（`contract.md`「約束」の 409 busy → 202 予約・W1/W2・U13、
  `sessions/{invoke-agent,promote,delete}.md`、`projects/delete.md`、`activate.md`）。
  design.md「docs・ADR への反映」。承認後に docs を直し、tasks へ

## 他の change との関係

- `replace-polling-with-push`: W3 は本 change の `invocation` 種別に吸収される。ポーリング撤去
  はあちらの本題として残す。`pendingRun` を消すのは本 change。あちらの proposal の改訂が要る

## 畳む方向

specs delta と実装を入れ、「proposal 到着 → `running` のまま承認なし → `idle` → 承認あり」と
「実行中の起動・昇格・削除は 202 で予約され、実行の終わりに行われる」を E2E で固定し、docs を
承認を経て直して archive する。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
同 change の範囲外として記録していたが、範囲外の扱いは不正だとユーザーが指摘（2026-09-01）
して起票した。

対応する change: `fix-rename-during-running-session`
