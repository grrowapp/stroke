---
status: Planning
change: replace-polling-with-push
tags:
  - proposal
  - specs
  - design
  - tasks
order: -7.0
---

# replace-polling-with-push

ストローク側の待機を、3秒ポーリングから WS の push に寄せる。**push するのは失敗ではなく、実行の記録（`invocation`）の遷移そのものである。** 新しい WS の endpoint は作らない。

> **改訂（2026-09-06、develop `8dfbc360` で再確認）。** 起票時（2026-08-25）と決定時（2026-08-29）の前提のうち、次の3つが崩れている。
>
> 1. `failed` は終端ではない。終端は `error` で、`failed` は巡回が60秒以内に起こし直す対象になった
> 2. ポーリングが観測しているのは失敗だけではない。409（busy）の後に `idle` を見て起動要求を出し直す経路が加わり、**失敗だけ push してもポーリングは消せない**
> 3. WS 配信の規約 `openspec/specs/ws/delivery` が立ち、同じ相手へ届く出来事のために endpoint を増やすことが禁じられた
>
> change の artifact（proposal / design / tasks / spec delta）は 8/25 のままで、第3の endpoint W3 を前提にしている。**本 ticket を正として書き直す。**

## 起票の根拠（2026-08-25 実測、2026-09-06 に現物へ追随）

`app/composables/useWaitingRetry.ts` は、待機中に `useIntervalFn(3000)` で U2（`GET /api/strokes/:id`）を読み直す。冒頭コメントはこれを「保険」と位置づけている。

> 通常は W1 / W2 の配信が先に届いて呼び出し側が stopWaiting() を呼ぶため、ポーリングは保険

**この位置づけは成功パスしか見ていない。** セッションを見ている画面へサーバーが publish するのは2箇所だけである。

| 送信元 | チャンネル | 送るもの |
| --- | --- | --- |
| `server/api/strokes/[id]/question.post.ts:34` | W1 | AI が提出した問い |
| `server/api/strokes/[id]/proposal.post.ts:62` | W2 | AI が提出した proposal |

`invocation` の書き込みは `server/utils/stroke/session-store.ts` の `writeInvocation` 1本を必ず通る（A8 の endpoint も invokeAi の書き込み口も同じ実体）。そこから流れるのは、生成中（`approved`）の対象が `error` に達したときの上層向け `project-creation: failed`（WB）だけで、**セッションの画面へ `invocation` の遷移は一切届かない**。

したがって、成功の決着は W1 / W2 が先に届き、ポーリングは3秒後に同じ結論へ達するだけ。それ以外の決着はポーリングが唯一の検出手段である。「保険」ではなく本体。

## ポーリングが担っているもの（2026-09-06）

`useWaitingRetry` の poll は `invocation` の値で3つに分岐する。どれも W1 / W2 では届かない。

| 観測した値 | 画面がすること | 由来 |
| --- | --- | --- |
| `error` | `errored` を立て、待機を降りる。ユーザーが再実行（`U13?reset=1`）か削除（U11）を選ぶまで止まる | `agent/invocation`「リトライ上限に達したら error に変える」 |
| `failed` | `failed` を立て、待機を降りる。画面は「もう一度送信」を促す | 巡回（`portal/batch`）が拾って起こし直す途中の状態 |
| `idle` | **409 で出せなかった起動要求（`pendingRun`）があれば出し直す。** 無ければ待機を降りる | `adr0016-sub-fix-busy-response-handling`（archive 2026-08-31）。出し直さないと、走っていた claude が終わった後に誰も次を起こさない（実測 2026-08-28: 回答は記録されたのに `idle` のまま4分待って落ちた） |

**3つ目が決定的である。** 失敗に push を1本与えても、`idle` の観測が残る限りポーリングは撤去できない。撤去するなら `invocation` の遷移そのものを届けるしかない。

## 決定（2026-08-29、2026-09-06 改訂）

**`invocation` の遷移を push する。ポーリングは廃止する。**

WS が push なのは、サーバーだけが決着の瞬間を知っていて、ブラウザにそれを察する手段が無いからである。`invocation` が変わる瞬間も同じくサーバーしか知らない。

- **送るのは `invocation` の値**（と、渡されたときの `retries`）。失敗だけを選んで送らない。画面は届いた1件で `error` / `failed` / `idle` の3分岐をそのまま行う
- **publish 元は `writeInvocation` の1箇所。** `invocation` の書き込みが必ずここを通るからで、WB への `project-creation` と同じ場所に置く。呼び出し側それぞれに置くと、書いたのに流れない経路が生まれる
- **新しい endpoint は作らない。** `openspec/specs/ws/delivery`「新しい種類の出来事のために配信の口を増やさない」に従い、既存のセッション向け接続に**メッセージの種別**として載せる。同じ接続に載せれば到達順は publish 順に揃う——旧 design が「実行状態を流さない」理由にした別ソケット間の順序崩れは、口を分けたときにだけ起きる
- **接続時に現在分を1件流す**（同 spec「接続した瞬間に現在分を配信する」）。切断中に変わった分は再接続時にここで揃う。画面1 の初期化にある `failed` / `error` の分岐はこれが担う。`running` を待機として示す分岐は残る——待機は「自分が起動を要求した」画面側の状態で、リロードで失った画面が戻る手掛かりは U2 の1回読みだけである
- **`useWaitingRetry` は消さず、poll の本体だけを購読に入れ替える。** 公開インターフェース（`waiting` / `failed` / `errored` / `startWaiting` / `stopWaiting` / `requestRun` / `retryFromError` / `discard`）と参照3箇所（画面1・`useAgentQuestion`・`useProposalReview`）は変えない
- U2 は「画面を開いたときの1回読み」だけ残す。契約 `docs/specs/api/contract.md` U2 の「回答や差し戻しを送って待っている間だけ、数秒おきに読み直す」は落ちる

### 未決（ユーザー判断）

**どの接続に載せるか、接続を何本にするか。** W1 と W2 は同じ相手へ届く口が2本ある状態で、`ws/delivery` の「画面は同じ相手向けの接続を1本だけ張る」を既に満たしていない（規約より前からある）。`useSessionChannel` は呼ぶたびに接続を開くので、画面2 は今も2本、`useWaitingRetry` の2インスタンスがそれぞれ購読すれば増える。

| 案 | 内容 | 範囲 |
| --- | --- | --- |
| 最小（既定） | W1 に `invocation` を載せ、`useSessionChannel` を (session, channel) 単位で共有して同じ口を2度開かない | 本 change |
| 統合を前置き | W1 / W2 を1本のセッション接続に統合する change を先に切り、本 change はその上に乗る | 別 change + 本 change |

指示が無ければ最小案で artifact を書き直す。

## change の artifact への影響

- **spec delta の宛先が無い。** `specs/ai-invocation/` は `openspec/specs/agent/invocation` に畳まれた。MODIFIED の対象を「実行の記録は invocation の4値で持つ」に移し、「遷移はサーバーからの配信で届く。画面が状態を読むのは開いたときの1回に限る」を足す。`failed` を「リトライが尽きた」と書いた箇所は `error` へ直す
- **design 決定1・2・3・7・8 と tasks 2.x は W3 endpoint 前提。** 上の決定に沿って書き直す。決定6 の「公開インターフェース4つ」は8つに直す
- **参照パスの追随。** `api-contract.md` → `docs/specs/api/contract.md`、WS 一覧は `docs/specs/api/ws/delivery.md`、`file-composables.md` は `docs/specs/structure/`、E2E は `test/e2e/agent-question.spec.ts:458`、unit test `test/app/composables/useWaitingRetry.test.ts`（`pendingRun` の出し直しはここが押さえている）。`markInvocationFailed` は存在しない
- proposal / design が触れている `separate-composable-responsibilities` は active にも archive にも無い。参照を外す

## 追随で直すもの（本題ではないが同じ行を触る）

- `docs/specs/api/contract.md:52` の `server/plugins/02.retry-failed.ts` は現物 `01.retry-failed.ts`
- `docs/specs/api/ws/delivery.md` の W1 / W2 のパスは `/api/sessions/:id/ws/…` だが、route は `server/routes/api/strokes/[id]/ws/` にある。契約（`contract.md`）と揃える
- `docs/specs/structure/file-composables.md:289`・`docs/specs/reference/stroke-modules.md`・`docs/specs/plan/composables-library-replacement.md:197` のポーリング前提の記述。plan は spec-workflow 承認済みなので、追随を入れるかは確認する

## 併せて出ている事実

- AI の実行中、ポーリングは3秒ごとに U2 を叩き続けるが、`running` の間は何もしない
- `useWaitingRetry` は共有 composable ではない。画面2 にはインスタンスが2つある（`useProposalReview.ts:93` の自前と、`useAgentQuestion.ts:58` の中）。待機が重なれば毎3秒で2回叩く。push へ移してもこの2つは畳まない——「差し戻しの待機」と「問い返しの待機」は別の待機で、畳むには1つの状態機械へ統合する設計判断が要る
- `failed` の表示は「もう一度送信してください」だが、`failed` は巡回が60秒以内に起こし直す途中の状態でもある。表示の意味づけは本 change の範囲外

## 関連

- `adr0016-sub-fix-busy-response-handling`（archive 2026-08-31）— `pendingRun` と `requestRun` を入れた。ポーリングに `idle` の観測を担わせたのはこれ
- `show-pending-project-in-list`（archive 2026-08-30）— `openspec/specs/ws/delivery` と `server/utils/ws/registry.ts` を立てた。本 change の配信の形はこれに従う
- `fix-agent-question-api-path` — `useAgentQuestion` の `base` が `/api/${sessionId}` になっている件。触らない
- `docs/specs/architecture/question-flow.md:109` の「リトライが尽きたとき `failed`（`server/utils/ai.ts`）」は状態名もパスも古い。配信の図と併せて追随する
