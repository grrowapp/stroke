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
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
---

# fix-rename-during-running-session

改名が走行中の flontier の claude を置き去りにする欠陥。**サーバ側は直っているが、画面が
409 busy を握りつぶしているため、ユーザーから見た症状は消えていない。** 規定
（`openspec/specs/`）も追従していない。

## 起票時の症状（2026-08-31）

承認によるディレクトリ改名が、走っている claude を見ていなかった。busy ガードは sessionId
キー、改名後の steering はプロジェクト名キーで、同じ物理ディレクトリに対して2つの claude
が別々の枠で同時に走れた。`rename(2)` は inode を保つので旧 claude は改名先で生き続けるが、
自分を名乗る id は旧 sessionId のままなので以後のツール呼び出しが全部 `session_not_found`
になり、`invocation` もどこにも残らなかった。

`yarn check:stroke` は承認の手前で実行の終わりを待って避けていたが、実 UI に避ける仕掛けが
無かった。

## 起票時からの乖離

1. **改名の主体が U10 承認 → U14 昇格へ移った。** 承認が3段（U10 判断の記録 / U14 昇格 /
   U13 起動）に分割された（`8df64ca6`）。改名するのは U14 だけ

2. **サーバ側は解消済み。** `c086907e`（2026-09-01）で busy ガードのキーを作業場所の実体
   （`stat` の `dev`/`ino`）へ変え、改名する段が `beginRun` で占有する形にした。テストあり
   （`running.test.ts`、`promote.post.test.ts`）

3. **画面が 409 busy を握りつぶしている（違反。ADR 0021）。**
   `app/composables/useProposalReview.ts` の `promote()` は `name-conflict` しか分岐せず、
   `busy` は汎用の「プロジェクトを作れませんでした」に落ちる。契約の「待てば通る」が届かない。
   起票時の「実 UI に避ける仕掛けが無い」は、断る側だけ直って伝える側が直っていない

4. **`beginRun` の 409 文言が改名の場面に合わない。** 「新しい起動は受け付けない」は起動を
   断る文言

5. **占有の解放位置の根拠が呼び出し順と合わない。** 「解放を後にすると自分の占有で U13 が
   409 になる」とあるが、U13 は 204 の後に叩かれ、204 は A8 引き渡しの後に返る。解放を
   早めた結果、枠が空きで `invocation` が `idle` の窓がある（今は実害なし）

6. **docs は既に規定しているが specs が追従していない。** `docs/specs/api/sessions/promote.md`
   「実行中は受理しない」／`docs/specs/api/contract.md`「約束」に対し、`api/session/promote`
   と `api/session/invoke-agent` の specs に該当の規定が無い

7. **artifact が消えている。** `ea943b7e` で design.md・tasks.md・旧 specs delta
   （`api/session/approve` 宛て）を削除。`running.test.ts` が「design.md D2」を参照したまま
   宙に浮いている

## 現時点での対応内容

- 規定: `api/session/promote`・`api/session/invoke-agent` へ docs の規定を写す
- 規定: `stroke/frontier` へ、承認画面が昇格の 409 busy を「待てば通る」として示すことを足す
- 変更: `useProposalReview.ts` の `promote()` に `busy` 分岐。`beginRun` の文言
- 見直し: 占有の解放位置（design で決め、docs の promote 資料の根拠の文を直す）
- 作り直し: design.md・tasks.md
- 起票済み: `docs/adr/0021-no-one-swallows-a-response.md`（応答の握りつぶしは違反）

## 畳む方向

specs delta と画面の修正を入れ、実装が規定と一致することを確認して archive する。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
同 change の範囲外として記録していたが、範囲外の扱いは不正だとユーザーが指摘（2026-09-01）
して起票した。

対応する change: `fix-rename-during-running-session`
