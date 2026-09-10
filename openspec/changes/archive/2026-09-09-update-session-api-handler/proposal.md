# update-session-api-handler

## Why

ユーザーの決定（2026-09-08）で、**api は REST コール受付のインターフェースであり、handler を持つ**。`server/api/**` の各ファイルは HTTP 固有の準備（パラメータ・本文の読み取りと検証、id の解決）と後始末（status・本文の返し方、エラーの HTTP 化）だけを受け持ち、実処理は `server/handler/` に置く。共通化した実処理は handler の名で統一する（`core` / `service` / `util` と呼び分けない）。先例は `docs/specs/api/projects/delete.md`「実装の共有」で、削除の実行は既に `server/handler/delete.ts` に1本ある。

セッションの endpoint はその形になっていない。U14（promote）は 213 行のうち大半が占有・衝突確認・改名・`state.json` の書き込み・配信・A8 への引き渡しで、U13（invoke-agent）・U15（activate）・U10（approve）・U7（answer）・U11（delete）も同じく実処理を api ファイルの中に持つ。実処理が api に居ると、同じ処理を別の口から呼べず、テストは endpoint を通してしか書けない。

さらに `server/utils/stroke/session-core.ts` が「endpoint と CLI が共有する実処理」を `*Core` の名で持っており、handler と役割が同じものが2つの名前で並んでいる。同じ実体の重複も残っている——「消す実行」が `deleteSessionCore` と `handler/delete.ts` の `removeTarget` に2つ、「在るかの判定」が `sessionExistsCore` と `targetExists` に2つ、`isSafeSegment` が `session-core.ts` と `handler/delete.ts` に2つ、`DeleteError` を HTTP へ写す `toHttp` が U11 と P1 に2つある。

親 change は `fix-server-api-layout`。Gitea issue [#15](http://192.168.1.202/gitea/grrowapp/stroke/issues/15) の範囲を 1 本の子 change にしたもの。A 系と WS route は #18、プロジェクトの endpoint は #19 が同じ物差しで行う。

## What Changes

- **変更**: `server/api/sessions/**` の 12 本（U1・U2・U3・U7・U9・U10 POST/DELETE・U11・U12・U13・U14・U15）を「読む → handler を呼ぶ → 返す」の形にする。URL・入出力・受理の条件・応答は変えない
- **追加**: `server/handler/` に endpoint ごとの handler を置く——`promote.ts`・`activate.ts`・`approve.ts`・`answer.ts`・`invoke-agent.ts`、および endpoint と CLI が共有する `session.ts`（作成・列挙・削除・原子的な書き込み）
- **削除**: `server/utils/stroke/session-core.ts`。中身は `server/handler/session.ts`（実処理）と `server/utils/stroke/paths.ts`（`SESSION_FILES`・`isSafeSegment`）へ分け、重複していた `deleteSessionCore` / `sessionExistsCore` / `removeSessionDir` は `server/handler/delete.ts` の `removeTarget` / `targetExists` に寄せる。`*Core` の名は残さない
- **変更**: `toHttp`（`DeleteError` → HTTP）を api 側の共有の後始末として `server/utils/stroke/conflict.ts` に1つ出す。U11 が使い、#19 で P1 が同じものを使う
- **変更**: CLI（`yarn session` = `scripts/session.ts`）と検証の道具（`scripts/stroke-check.ts`）の呼び口を handler へ向け直す。CLI の使い方・出力・終了コードは変えない
- **変更**: テストを寄せ替える。実処理のテストは `test/server/handler/<name>.test.ts`、api のテストは準備／後始末（404 / 409 / 503 / 204 の返し方と handler の呼び出し）だけ。二重に持たない
- **追加**: 切り出しの物差しを capability に新設する（`server/api-handler`）。#18・#19 もこれで判定する
- **変更**: `docs/specs/structure/system-structure.md`・`server-structure.md` を追随させる（design.md「関連 docs の書き換え案」。ユーザー承認済み 2026-09-09）

**呼び手から見える差は無い。** URL・Method・入出力・status・エラーの本文と `data.reason` は移動の前後で同じである。

- 触らないもの: `docs/specs/api/overview.md`・`server.md`・`sessions/*.md`・`projects/delete.md`（基準）、`server/api/strokes/**`・`server/routes/api/**`（#18）、`server/api/projects/**`（#19）、`docs/specs/plan/*`・`docs/adr/*`（当時の記録）
- `server/utils/` の関心単位の切り直しはしない。`session-core.ts` の解体で移す先が要るものだけを、既にその関心を持つファイル（`paths.ts`・`conflict.ts`）へ入れる

## Capabilities

### New Capabilities

- `server/api-handler`: `server/api/` の handler ファイルが薄い層になっているかの物差し。api が持ってよいもの（入力の読み取りと検証・設定の解決・局面の述語・結果の HTTP 化）と、handler が持つもの（保存先への書き込み・改名・占有・配信・本家 REST・複数段の後始末）を分け、機械的に判定できる形にする。局面の述語は api が持ち handler は持たないこと、同じ実処理を 2 箇所に書かないことも同じ capability が持つ

### Modified Capabilities

なし。`tools/session-cli`（CLI の使い方）・`server/session-management`（endpoint の見え方）の Requirement は変わらない——呼び口の内部が変わるだけである。

## Impact

- **コード**: `server/api/sessions/**`（12 本）・`server/handler/`（`delete.ts` の改訂と 6 本の新設）・`server/utils/stroke/{session-core.ts（削除）,paths.ts,conflict.ts,session-store.ts,session-param.ts,claude.ts}`・`scripts/{session.ts,stroke-check.ts}`
- **テスト**: `test/server/api/sessions/**`（準備／後始末だけに絞る）・`test/server/handler/`（実処理を受け取る）・`test/server/utils/stroke/session-core.test.ts`（handler へ移す）
- **docs**: `docs/specs/structure/system-structure.md`（§1 と §4）・`docs/specs/structure/server-structure.md`（棚卸し）
- **openspec**: capability `server/api-handler` の新設
- **外部**: 画面・エージェント・本家（spec-workflow）から見える URL・挙動は変わらない
