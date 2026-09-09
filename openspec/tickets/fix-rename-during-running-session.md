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

改名が走行中の flontier の claude を置き去りにする欠陥。**サーバの防波堤（inode キー・U14 の
409 busy）は入っているが、「承認できる状態なのに AI が走っている」状態そのものが画面に存在
する。** 直すのはこの状態の存在であり、409 の見せ方ではない（ユーザー指示 2026-09-09）。

## 起票時の症状（2026-08-31）

承認によるディレクトリ改名が、走っている claude を見ていなかった。busy ガードは sessionId
キー、改名後の steering はプロジェクト名キーで、同じ物理ディレクトリに対して2つの claude
が別々の枠で同時に走れた。`rename(2)` は inode を保つので旧 claude は改名先で生き続けるが、
自分を名乗る id は旧 sessionId のままなので以後のツール呼び出しが全部 `session_not_found`
になり、`invocation` もどこにも残らなかった。

## 起票時からの乖離

1. **改名の主体が U10 承認 → U14 昇格へ移った**（`8df64ca6`）。改名するのは U14 だけ

2. **サーバ側の防波堤は解消済み**（`c086907e`、2026-09-01）。キーを作業場所の実体
   （`stat` の `dev`/`ino`）へ変え、U14 が `beginRun` で占有する。テストあり

3. **画面2 が「AI が動いている」と知るのは自分が起こした実行だけ。** proposal が届いた直後・
   差し戻し中のリロード・巡回の起こし直し・別タブ、いずれも承認ボタンが有効なまま押せる。
   これが症状の入口で、防波堤は塞いでいない

4. **画面が 409 busy を握りつぶしている**（ADR 0021）。`useProposalReview.ts` の `promote()`
   は `name-conflict` しか分岐しない

5. **占有の解放位置の根拠が呼び出し順と合わない。** U13 は 204 の後に叩かれ、204 は A8 の後。
   解放を早めた結果、枠が空きで `invocation` が `idle` の窓がある

6. **`invocation` の変化が画面へ push されていない。** W1 は問い、W2 は proposal だけ。
   `useWaitingRetry` が待機中だけ U2 を3秒おきに読む

7. **docs は規定しているが specs が追従していない**（`docs/specs/api/sessions/promote.md`、
   `contract.md`「約束」）

8. **artifact が消えていた**（`ea943b7e`）。`running.test.ts` が「design.md D2」を参照したまま
   宙に浮いていた → design.md を作り直して D2 を復元

## 現時点での対応内容

- **設計の本体: 承認の操作はサーバの `invocation` が `idle` のときにだけ存在する。** 画面の
  行動からは導かない。これで 3 の4場面が消える
- **`invocation` の変化をセッション向けの WS（W1・W2）に種別として載せて push する。**
  `ws/delivery` により口は増やさない。接続時は現在分を配信
- 規定: `api/session/promote`（防波堤。占有は起動の段への引き渡しまで）・
  `api/session/invoke-agent`（単位 = 物理ディレクトリ）・`api/session/ws`（`invocation` の
  種別）・`stroke/frontier`（承認の操作は `idle` のときだけ。失敗理由を握りつぶさない）
- 変更: U14 の占有解放を A8 の後ろへ。`beginRun` の文言は断る側が持つ
- `ui` は作らない（既存の待機の器で足りる。design D7）
- 起票済み: `docs/adr/0021-no-one-swallows-a-response.md`

## 他の change との関係

- `replace-polling-with-push`: W3（失敗の配信）は本 change の `invocation` 種別に吸収される。
  ポーリング撤去はあちらの本題として残す。あちらの proposal の改訂が要る（ユーザー判断）

## 畳む方向

specs delta と実装を入れ、「proposal 到着 → `running` のまま承認なし → `idle` → 承認あり」を
E2E で固定し、docs（`contract.md` W1/W2・`promote.md` の占有の区間）を承認を経て直して
archive する。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
同 change の範囲外として記録していたが、範囲外の扱いは不正だとユーザーが指摘（2026-09-01）
して起票した。

対応する change: `fix-rename-during-running-session`
