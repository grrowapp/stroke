# composables ライブラリ代替可否

`app/composables/` の現状の実態と、ライブラリ置換の軸への対応。

軸は **vueuse (@vueuse/core 14.4.0) / @nuxt/ui (4.10.0) / Nuxt 標準機能で代替できるものは置き換える**。あわせて、同型の重複は**1本の composable へ集約する**。

- 棚卸しの本体は `docs/specs/core/file-composables.md`。ここは置換・集約の可否だけを扱う
- 別軸（責務分離 `separate-composable-responsibilities`・平置き `flatten-composables`）はこの評価に持ち込まない
- 記述は実装と node_modules の実物（型定義・dist ソース）から抽出した事実に限る

ここでの「置換」は、**composable の廃止ではなく、内部の自前機構をライブラリ部品で組み直すこと**。公開インターフェースと参照元は変えない。純粋な一対一の差し替えに近いのは `useRelativeTime` のみ。

> **実装後の追記（change `replace-handrolled-with-libraries`）**
>
> 置換3・集約2→1 をすべて実装した。条件付きだった `useBoardSocket` も**条件を満たし、据置に戻したものは無い**。
> 以下の「実装結果」は、この資料が条件・未確定として残した点の検証結果である。判定（置換・集約・据置）は変えていない。

## 残るもの — 据置5本

軸を適用した後も自前実装のまま残る一覧。中身がドメインロジックであり、ライブラリで置き換える対象が無い。

| 関心 | composable | 据置の理由 |
| --- | --- | --- |
| プロジェクトの読み書き | `useProjectApi`（192行） | 既に Nuxt 標準（`useFetch` / `$fetch`）の上。エラー文言変換・パス解釈はドメインロジック |
| ステアリングの読み書き | `useSteeringDocuments`（50行） | 定数と `computed` の組み立てのみ |
| 注釈 | `useAnnotations`（178行） | ドメイン状態と4層ペイロードの組み立て。色定数の件は `flatten-composables` の軸 |
| 問いの往復 | `useAgentQuestion`（132行） | 全体がオーケストレーション。`statusOf` / `messageOf` の重複は責務分離の軸 |
| proposal のレビュー | `useProposalReview`（412行） | この軸単独で完結する置換は無い。モーダル開閉の `useOverlay` 化は component 側と不可分のため `realign-component-composable-boundaries` へ委譲 |

```mermaid
flowchart LR
  subgraph 置換["置換するもの（3本）"]
    A["shared/useBoardSocket（条件付き）"]
    B[shared/useRelativeTime]
    C["useWaitingRetry（timer のみ）"]
  end
  subgraph 集約["集約するもの（2本 → 1本）"]
    H[useQuestionChannel]
    I[useProposalChannel]
  end
  subgraph 据置["残るもの（5本）"]
    D[workspace/useProjectApi]
    E[workspace/useSteeringDocuments]
    F[useAnnotations]
    G[useAgentQuestion]
    J[useProposalReview]
  end
  A -->|useWebSocket + 生存期間の担保| VU[vueuse]
  B -->|formatTimeAgo| VU
  C -->|useIntervalFn| VU
  H --> K["汎用チャンネル 1本（useWebSocket ベース）"]
  I --> K
```

## Nuxt plugin について

今回の10本に、Nuxt plugin（`app/plugins/`）として提供し直すべきものは無い。唯一のアプリ全体シングルトン `useBoardSocket` も、後述の (a)(b) いずれかで composable のままの呼び出し形を保てる（plugin 化は呼び出し形が変わるぶん差分が大きい）。

---

# 集約するもの — 2本 → 1本

## useQuestionChannel.ts / useProposalChannel.ts（各24行）

2本は**構造が完全に同型**。`useWebSocket` + `autoReconnect` で購読し、最後に届いた1件で上書きして保持するだけ。URL 組み立て（scheme/host の判定）も逐語で重複している。

| | `useQuestionChannel`（W1） | `useProposalChannel`（W2） |
| --- | --- | --- |
| 購読先 | `/ws/question` | `/ws/proposal` |
| 届くもの・型 | 今の1問（`Question`） | proposal と名前候補（`ProposalMessage`） |
| 返り値の名前 | `{ question }` | `{ message }` |
| 使う側 | 画面1、`useAgentQuestion` | `useProposalReview` |

違いは「どのチャンネルを聴くか」と「届く中身の型」だけ。**これこそ composable として集約するべき内容**であり、パスと型を引数に取る汎用チャンネル1本（`useWebSocket` ベース、型引数で `Question` / `ProposalMessage` を渡す）に畳む。

- 呼び出し形（薄いラッパ2本を残すか、呼び出し側がパスを渡すか）は実装時の design で確定する
- 挙動は現行と同じ: 最後の1件のみ保持・`autoReconnect`・接続時のサーバ側現在分配信で初期値が入る

**実装結果**（design 決定2）: **呼び出し側がパスを渡す形にした。ラッパは残していない。** 汎用は `app/composables/useSessionChannel.ts`（`sessionId` とチャンネル名を受け、型引数で中身の型を渡す）1本で、参照元3箇所がこれを直接呼ぶ。

| 参照元 | 呼び出し |
| --- | --- |
| `app/pages/strokes/[sessionId]/index.vue` | `useSessionChannel<Question>(sessionId, 'question')` |
| `app/composables/useAgentQuestion.ts` | `useSessionChannel<Question>(sessionId, 'question')` |
| `app/composables/useProposalReview.ts` | `useSessionChannel<ProposalMessage>(sessionId, 'proposal')` |

ラッパを残す案を採らなかった理由: ラッパの中身は**返り値に名前を付け直すことだけ**で、購読先と型は `'question'` / `<Question>` という**ただの引数**だった。8行のファイルを2本置く理由にならない。上の「2本 → 1本」の判定に対しても、3ファイルに増える形は合わない。URL 組み立て（scheme/host 判定）は汎用側の1箇所に集約された。

---

# 置換するもの — 3本

| composable | 判定 | 組み直しの内容 |
| --- | --- | --- |
| `useBoardSocket`（85行） | 置換可（条件付き: 生存期間の担保） | 内部のトランスポート（生 WS・再接続 timer・シングルトン・ハンドラ Set）を `useWebSocket` +（`createGlobalState` または `createSharedComposable`+常駐購読）+ `createEventHook` で組み直す。公開 IF は維持 |
| `useRelativeTime`（18行） | 置換可 | 関数本体を `formatTimeAgo` に差し替え（`messages` で日本語・`invalid`・`rounding`/`units` 指定）。一対一に最も近い |
| `useWaitingRetry`（48行） | 部分置換 | timer 管理のみ `useIntervalFn` に委譲。`waiting` / `failed` とドメイン判定は自前のまま |

## useBoardSocket.ts — 置換可（条件付き: 接続の生存期間の担保）

生 `WebSocket` を自前で張り、`close` 時に `setTimeout` 2秒で再接続する。モジュール変数 `shared`（20行目）によるアプリ全体シングルトン。

```ts
let shared: BoardSocket | null = null;          // アプリ生存中ずっと保持
socket.addEventListener('close', () => {
  setTimeout(() => connect(...), 2_000);        // 無限に張り直す
});
```

組み直し先は vueuse `useWebSocket`。channel 側が既に採用しており、集約後の汎用チャンネルと合わせて **WS の張り方が同じ書き方に揃う**。

### 条件 — シングルトン性は共有化の方式で決まる

`createSharedComposable` は参照カウント式で、**最後の購読 scope が破棄されると state ごと破棄し、次の呼び出しで再生成する**。現行のモジュール変数はアプリ生存中不変であり、設計要件「接続はアプリ全体で1本だけ張り、画面遷移で張り替えない」（design.md 決定7、ファイル冒頭コメント）がある。

参照元は5箇所（`layouts/portal.vue`、`layouts/workspace.vue`、`pages/index.vue`、`pages/projects/index.vue`、`components/shared/NotificationToaster.vue`）に散在するため、レイアウト切替で購読者ゼロ区間が生じると切断・`notifications` 消失が起き得る。**そのままの `createSharedComposable` 単独では要件を満たさない。**

**実装で判明（上の数の訂正）**: 参照元は5箇所ではなく**8箇所**である（`grep -rn "useBoardSocket()" app/` で確認）。上の5箇所に加えて、**下層3ページ**（`pages/projects/[projectId]/approvals/[approvalId].vue`・`pages/projects/[projectId]/specs/[specName]/[document].vue`・`pages/projects/[projectId]/steering/[name].vue`）が `upstreamConnected` を取っている。`grep -rl` はこれにコメントで言及するだけのファイル（`app.vue`・`components/workspace/DocumentEditor.vue`）も拾うので、ファイル数と呼び出し数は一致しない。**散在の度合いが前提より大きい**ぶん、購読者ゼロ区間の懸念は弱まらない。

担保の方式は2案。どちらでも要件は満たせる。方式の確定は実装時の design で行う。

| 案 | 方式 | 生存期間 |
| --- | --- | --- |
| (a) | `createGlobalState` で包む | 破棄されない大域 scope。現行のモジュール変数と同じ |
| (b) | `createSharedComposable` + アプリ常駐の場所（`app.vue` など）で1購読を保持 | 常駐購読が生存を担保 |

**実装結果**（design 決定1）: **案 (b) を採った**。理由は下の「SSR の state」の行そのもので、`createGlobalState` はモジュールスコープに state を置くため **SSR でリクエスト横断の共有が起きる**（現行のモジュール変数と同じ欠陥を引き継ぐ）。案 (b) は per-call で素通しになり、この欠陥が消える。

常駐購読の置き場は `app.vue` 直下の `NotificationToaster`。`useToast` 化しても `onNotification` → `toast.add()` の変換役として残るため、**新しい常駐先を作らずに済んだ**（component は markup を持たなくなり、購読の置き場としてだけ在る）。裏返しに、**この component を `app.vue` 直下から外すと接続が切れる**という依存が生まれている（`useBoardSocket.ts` と `NotificationToaster.vue` の冒頭コメントに明記）。ハンドラ登録の `createEventHook` 化も本体の置換に含めて実施し、`Set` + `onScopeDispose` は消えた。

### 挙動の差分

| 挙動 | 現状 | 組み直し後 | 揃え方 |
| --- | --- | --- | --- |
| 再接続間隔 | 2000ms 固定 | 既定 1000ms | `autoReconnect: { delay: 2000 }` |
| 再試行回数 | 無限 | `retries` 既定 -1 = 無限 | 未指定のままで一致 |
| SSR の state | モジュール変数がリクエスト横断共有 | (a) なら同じ / (b) は素通し（per-call）で解消 | (b) は改善方向の差分として認識 |

`onNotification` のハンドラ登録（Set + `onScopeDispose` 解除）は、同軸の vueuse `createEventHook`（`on` が scope 破棄時の自動解除を持つ）でも組み直せる。本体の置換に含めてよい。

## useRelativeTime.ts — 置換可

純関数 `formatRelativeTime(iso: string)`。「たった今 / N分前 / N時間前 / N日前」の4段。無効値は `'—'`。丸めは `Math.floor`。

置換先は vueuse `formatTimeAgo`（純関数版）。日本語文言は `messages` オプションで注入する。

### 挙動の差分

| 挙動 | 現状 | vueuse 既定 | 揃え方 |
| --- | --- | --- | --- |
| 単位の刻み | 何日経っても「N日前」 | **minute は 46 分・hour は 20 時間で切り替わり**、さらに週・月・年まで刻む | `units` を全段書き下ろす（60 分 / 24 時間で切り、day を最大単位に） |
| 丸め | `Math.floor` | `'round'` | `rounding: 'floor'` |
| 無効日付 | `'—'` | `messages.invalid`（既定 `""`） | **`invalid: '—'` を注入すれば直接維持できる（ラッパ不要）** |
| 未来時刻 | 負の elapsed は常に「たった今」 | 1分超の未来は future 文言 | `messages` の future 側も注入して吸収するか、許容するかは実装時に決める |
| 引数 | ISO 文字列 | `Date` | ISO→`Date` 変換の薄いラッパ（もしくは呼び出し側での変換）は要る |

引数の変換は `'—'` の有無とは無関係の、シグネチャの話。

**実装で判明（刻みの訂正）**: 「`units` で day を最大単位にする」だけでは足りない。vueuse の `DEFAULT_UNITS` は minute の `max` が 2,760,000ms（= **46分**）、hour の `max` が 72,000,000ms（= **20時間**）で、日常表現に寄せた丸めが入っている。最大単位を day にしても、この2段が現行と食い違う（46分が「1時間前」、20時間が「1日前」になる）。**60分 / 24時間で切る指定も要る**。

**実装で判明（本家との差・置換先の見直し）**: 本家 `dashboard_frontend/src/lib/dateUtils.ts` の `formatDistanceToNow` を読むと、刻みは 60秒 / 60分 / 24時間 / **7日** で、**7日を超えたら相対表記をやめて絶対日時**（`formatDate`）に切り替える。上の表は「何日経っても N日前」を現状として置いていたが、それは**本家と違う**。判定の方針は「現行と同一」ではなく「本家と同一」なので、7日の打ち切りに寄せる。

vueuse `formatTimeAgo` はこの打ち切りを `max` + `fullDateFormatter` で持てるが、**日本語の文言8種（`justNow` / `past` / 各単位）を手で書く必要が残る**。`formatTimeAgoIntl`（`Intl.RelativeTimeFormat`）は文言を自前で持たずに済むが、**「昨日」「先週」「先月」「昨年」という本家に無い表現を出し、`insertSpace: false` も効かず空白が残る**（実測）。

**置換先を `javascript-time-ago` に変えた。** 軸のライブラリ（vueuse / @nuxt/ui / Nuxt 標準）に、設定だけで本家に一致するものが無かったため。比較は実測で行った。

| ライブラリ | 46分 | 23時間 | 7日超 | 空白 |
| --- | --- | --- | --- | --- |
| vueuse `formatTimeAgoIntl` | `46 分前` | `23 時間前` | `先週` / `先月` / `昨年` | 入る |
| date-fns `formatDistance` | `約1時間前` | `約23時間前` | `約1か月前` | — |
| dayjs `relativeTime`（既定） | `1時間前` | `1日前` | `1ヶ月前` | 入らない |
| **`javascript-time-ago`**（`labels: 'narrow'` / `round: 'floor'` / 本家の `steps`） | **`46分前`** | **`23時間前`** | **絶対日時** | 入らない |

`javascript-time-ago` は本家の閾値をそのまま `steps` に写せ、7日超の絶対日時への切り替えも最後の step の `format` で表現できる。**自前で書くのは無効な日付のガード1行だけ**になり、閾値の判定・日本語の文言・丸めはすべてライブラリが持つ。

**実装結果**: 公開インターフェース（`formatRelativeTime(iso, now)`）と参照元5ページは変えていない。振る舞いは2点、現行から変わる。

| 挙動 | 変更前 | 変更後 | 理由 |
| --- | --- | --- | --- |
| 7日以上 | `30日前` `400日前` | `7月26日 12:00` `7月21日 12:00` | 本家が7日で打ち切って絶対日時にする |
| 未来時刻 | 「たった今」に畳む（design 決定5） | `5分後` `3日後` | 本家は未来を想定しておらず、畳む根拠が本家側に無い |

1分未満の文言は「たった今」から「今」に変わる（`ja` ロケールの語）。刻み・丸め・空白・打ち切り・無効値は単体テスト `test/app/composables/useRelativeTime.test.ts` に固定した。

## useWaitingRetry.ts — 部分置換（timer 管理のみ委譲）

`setInterval` の手管理（`stopPolling` / `onScopeDispose` / SSR ガード）と、ドメイン判定（`invocation: failed / idle`）が同居している。

置換するのは **timer 管理のみ**。vueuse `useIntervalFn`（`{ immediate: false }`）に委譲する。

| 現状 | useIntervalFn |
| --- | --- |
| `stopPolling()` | `pause()` |
| 張り直し（`stopPolling` してから `setInterval`） | `resume()`（毎回クリアしてから張り直す = 等価） |
| `onScopeDispose(stopPolling)` | scope 破棄時の自動 `pause`（内蔵） |

残すもの: `waiting` / `failed` の状態と U2 ポーリングのドメイン判定は本体の責務のまま。

**SSR ガードは残す。** `resume()` に client 限定ガードは無く、SSR でも `setInterval` を張り得るため、現行の `import.meta.server` early return は温存する。

**実装結果**: 記述どおり。`stopPolling()` → `pause()`、張り直し → `resume()`、`onScopeDispose` の手当ては `useIntervalFn` 内蔵に委ね、`import.meta.server` の early return は `startWaiting()` にそのまま残した。`waiting` / `failed` と `invocation` の判定は自前のまま。
