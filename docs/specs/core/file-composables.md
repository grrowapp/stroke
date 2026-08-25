# composable 一覧

`app/composables/` の現状の実態と、規範（`docs/specs/core/system-structure.md` の区切り）への対応。

## 規範への対応 — 全9本

規範は**関心単位の `useXxx` を平置き**（境界のディレクトリ shared / workspace を作らない）。現在の9本:

| 関心 | composable | 整理の方向 |
| --- | --- | --- |
| 通知の受信 | `useBoardSocket` | vueuse の `createSharedComposable` で1本に共有。そのまま |
| 時刻表示 | `useRelativeTime` | vueuse の `formatTimeAgo` の包み。そのまま |
| プロジェクトの読み書き | `useProjectApi` | プロジェクト単位画面の唯一の口。そのまま |
| ステアリングの読み書き | `useSteeringDocuments` | `useProjectApi` と同じ関心の口として並べる |
| 問いの往復 | `useAgentQuestion` | 回答送信・AI 起動（契約 U7 / U13）。そのまま |
| セッションの WS 購読 | `useSessionChannel` | W1 / W2 の唯一の受け口。購読先のパスと届く型を引数で受け、呼び出し側が直接呼ぶ |
| proposal のレビュー | `useProposalReview` | 39 プロパティに肥大し `Modals.vue` と密結合。分割は**保留** — markdown コンポーネント集約の確定後、`flatten-composables` の design で決める（分割案はここで固定しない） |
| 注釈 | `useAnnotations` | 色定義5件をコンポーネントが逆向き import している。**色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ**（検討） |
| 待機とリトライ | `useWaitingRetry` | timer は vueuse の `useIntervalFn` に委譲済み。そのまま |

### 移行後パスの写像

平置きへ移すのはポータル側の4本のみ。ストローク側の5本は既に直下にあり、移動しない。

| 移行前 | 移行後 |
| --- | --- |
| `composables/shared/useBoardSocket.ts` | `composables/useBoardSocket.ts` |
| `composables/shared/useRelativeTime.ts` | `composables/useRelativeTime.ts` |
| `composables/workspace/useProjectApi.ts` | `composables/useProjectApi.ts` |
| `composables/workspace/useSteeringDocuments.ts` | `composables/useSteeringDocuments.ts` |

平置き後も**明示 import を維持する**（auto-import は使わない。`nuxt.config` の `autoImport: false` 前提）。

移動の実施は `docs/specs/plan/structure-migration.md`。

---

以下は統合前の棚卸しの記録。2系統が同居している。

- **ポータル側** — `shared/` と `workspace/` の4本（階層で分ける規約。以下「ポータル側」）
- **ストローク側** — 直下に平置きの5本（棚卸しは「ストローク側」の章）

---

# ポータル側


`app/composables/` にある4つの composable のリファレンス。

- 置き場所の規約は `openspec/changes/restructure-app-directories/specs/app-structure/spec.md`
- 層の積み方と全体の構造は `docs/specs/core/system-structure.md`
- 記述は実装から抽出した事実に限る

**ポータル側は明示 import で参照する**（`~/composables/<階層>/<名前>`）。auto-import の廃止はポータル側の規約だが、ストローク側のコードがまだ依存しているため `nuxt.config.ts` では当面有効のまま（統一は `align-coding-conventions`）。

---

## shared/ — 階層をまたぐ

### useBoardSocket.ts

stroke-board のサーバーから通知を受ける。85行。

```ts
interface BoardSocket {
  notifications: Readonly<Ref<Notification[]>>;
  upstreamConnected: Readonly<Ref<boolean>>;
  onNotification: (handler: (notification: Notification) => void) => void;
}

export const useBoardSocket = createSharedComposable((): BoardSocket => { ... });
```

| 返り値 | 用途 |
| --- | --- |
| `notifications` | 通知の一覧。読み取り専用 |
| `upstreamConnected` | 本家への接続状態。ヘッダーの dot に出す |
| `onNotification` | 新しく発生した通知のハンドラ。トーストの発火に使う |

**`onNotification` に初回スナップショットは流れない。** 画面を開いた瞬間に既存の通知が全部トーストで出てしまうのを避けるため。`snapshot` は `notifications` を差し替えるだけで `notified.trigger` を呼ばない。

中身は vueuse の3つで組んである（`replace-handrolled-with-libraries`）。

| 手 | 何に使っているか |
| --- | --- |
| `useWebSocket` | 接続と再接続（`autoReconnect: { delay: 2_000 }`）。生の `WebSocket` と自前のタイマーは持たない |
| `createEventHook` | `onNotification` の配信。ハンドラの `Set` も `onScopeDispose` での解除も持たない（scope の破棄に任せる） |
| `createSharedComposable` | 接続をアプリ全体で1本に保つ。モジュールスコープの `shared` 変数は無い |

#### 接続は1本だけ

`createSharedComposable` は**参照カウント式**で、購読している scope が全て消えると state ごと捨て、次の呼び出しで作り直す。

**`app.vue` 直下の `NotificationToaster` が常駐して購読を持ち続けること**が、その「全て消える」を起こさない前提。あれを外すとレイアウト切替の瞬間に購読が0になり、接続が切れる。`app.vue` と `NotificationToaster.vue` の両方にその旨のコメントがある。

`createGlobalState` は採っていない。**モジュールスコープに state を置くため、SSR でリクエストを跨いで共有されてしまう**（`openspec/changes/replace-handrolled-with-libraries/design.md` 決定1）。

#### SSR では接続しない

URL を `computed` で組み、`typeof window === 'undefined'` なら空文字を返す。`useWebSocket` は空の URL では繋がない。

#### 繋ぐ先

**stroke-board のサーバー（`server/routes/ws.ts`）だけ。本家 WebSocket には繋がない**（`specs/upstream-connection`）。ブラウザから本家へ直接触らせないという境界による。

**参照元**（8）— `components/shared/NotificationToaster.vue`（`onNotification`）、`layouts/portal.vue`、`layouts/workspace.vue`、`pages/index.vue`、`pages/projects/index.vue`、`pages/projects/[projectId]/approvals/[approvalId].vue`、`pages/projects/[projectId]/specs/[specName]/[document].vue`、`pages/projects/[projectId]/steering/[name].vue`

※ 下層3ページは `upstreamConnected` だけを取る。`app.vue` と `DocumentEditor.vue` は呼ばずにコメントで触れているだけ。

### useRelativeTime.ts

一覧の「最終更新」列に出す相対時刻。47行。**4つの中で最小。**

```ts
export function formatRelativeTime(iso: string, now = Date.now()): string
```

`now` を引数で受けるためテストで時刻を固定できる。

`use` で始まるが Vue のリアクティブな状態を持たない純関数。ファイル名の慣習に合わせてある。

#### 中身は vueuse の `formatTimeAgo`

刻みと日付の差の計算は自前で持たない（`replace-handrolled-with-libraries`）。ただし**既定のままだと出力が変わる**ため、3つを明示している。

| 指定 | 既定 | ここでの指定 | 理由 |
| --- | --- | --- | --- |
| `units` | minute の上限 46 分・hour の上限 20 時間。週・月・年まで刻む | 60 分 / 24 時間で切り、`day` を最大単位にする | 46 分で「1時間前」、20 時間で「1日前」になるのを避ける。週・月・年は出さない |
| `rounding` | `'round'` | `'floor'` | 現行が切り捨てだった。`1分59秒` は「1分前」 |
| `messages` | 未来は「〜後」 | `future: () => 'たった今'`、`invalid: '—'` | 現行は負の経過時間を「たった今」に畳んでいた |

`showSecond` は既定（false）のまま。1分未満は「たった今」に畳まれるので、`second` の単位定義は刻みの下限を置くためだけにある。

**テスト**（`useRelativeTime.test.ts`、64行）— 上の3点を出力で固定する。既定に戻ると落ちるケース（46分・20時間・`1分59秒`）を明示的に置いてある。

**参照元**（5）— 上層2ページ（`index.vue`、`projects/index.vue`）と下層3ページ（`specs/index.vue`、`steering/index.vue`、`tasks/index.vue`）

上層・下層の両方から使われるため `shared/` にある。

---

## workspace/ — 下層専用

### useProjectApi.ts

**下層の画面が本家の情報を取るための唯一の口。** 192行。11 の関数を export する（※2026-08-24 実測。旧記述は 82行・8関数）。

```ts
export function useProjectId()                                        // route から projectId
export function useProjectInfo(projectId)      → ProjectInfoDto
export function useSpecs(projectId)            → SpecSummaryDto[]
export function useSpecDocuments(projectId, specName)  → SpecDocumentsDto
export function useTaskProgress(projectId, specName)   → TaskProgressDto
export function useSteeringDocument(projectId, name)   → DocumentContentDto
export function usePendingApprovals(projectId) → ApprovalDto[]
export function useApprovalContent(projectId, approvalId) → DocumentContentDto

// 保存（取得と違い、押したときに1回だけ走る）
export function saveSpecDocument(projectId, specName, document, content) → Promise<string | null>
export function saveSteeringDocument(projectId, name, content)           → Promise<string | null>

// 承認依頼の filePath から保存先の文書を導く。編集を許していない文書なら null（読むだけ）
export function saveTargetOf(filePath) → { save(projectId, content) } | null
```

#### 保存だけ `$fetch` を直に使う

`useFetch` は URL に紐づいて追従するもので、押したときに送る用途に合わない。保存は `$fetch` を直に呼ぶ。

**失敗は理由の文字列で返す。** 成功なら `null`。真偽値に潰すと、本家が止まっているのか送った内容が悪いのかが画面から分からなくなる。サーバーが返す `statusMessage` を、画面に出せる言葉へ `reasonOf` が写す。

| `statusMessage` | 画面に出る言葉 |
| --- | --- |
| `upstream-not-configured` | 本家ダッシュボードの URL が設定されていません。 |
| `upstream-unreachable` | 本家に繋がりません。本家が動いているか確かめてください。 |
| `upstream-not-found` | この文書が本家に見つかりません。… |
| `unknown-spec-document` / `unknown-steering-document` | この文書は編集できません。 |
| `invalid-body` | 送る内容の形が正しくありません。 |

`useProjectId()` を除く7つは `useFetch` をそのまま返すため、`data` / `error` / `pending` / `refresh` が使える。

引数は `MaybeRefOrGetter<string>` を取る。ルートパラメータの変化に追従させるため、URL は関数で組み立てている。

```ts
function base(projectId) { return `/api/projects/${toValue(projectId)}`; }
```

#### ここに集約している理由

画面ごとに `useFetch` の URL を書くと、**エンドポイントの形が画面の数だけ散る**。ここに集めておけば、本家の形が変わったときに直す場所が1つで済む。

叩く先は `server/api/projects/**` で、その先は `control/upstream-proxy.ts` を経由して本家へ届く。ブラウザから本家へは触らない。

**参照元**（9）— 下層の9ページ

### useSteeringDocuments.ts

ステアリング文書の有無を組み立てる。50行（※2026-08-24 実測。旧記述は 41行）。

```ts
export const STEERING_DOCUMENTS = [
  { name: 'product',   label: 'product.md' },
  { name: 'tech',      label: 'tech.md' },
  { name: 'structure', label: 'structure.md' },
] as const;

export type SteeringName = (typeof STEERING_DOCUMENTS)[number]['name'];

export interface SteeringEntry {
  name: SteeringName;
  label: string;
  exists: boolean;
}

export function useSteeringEntries(info: Ref<SteeringPresence | null | undefined>)
export function isSteeringName(value: string): value is SteeringName
```

#### 3本固定である理由

本家のステアリングは**常に product / tech / structure の3本**で、一覧 API が無い。そのため有無を `info` の `steering.documents` から組み立てる。

一覧画面と本文画面の両方が同じ組み立てを必要とするため、ここに置いている。

`isSteeringName` は型ガード。URL のパラメータが3本のいずれかであるかを判定し、**知らない文書名を開かせない**ために使う。

**参照元**（2）— `steering/index.vue`、`steering/[name].vue`

---

## 配置の判断

| composable | 参照元 | 判定 |
| --- | --- | --- |
| `useBoardSocket` | 上層2 + 下層3 + 両レイアウト + Toaster | 階層をまたぐ → `shared/` |
| `useRelativeTime` | 上層2 + 下層3 | 階層をまたぐ → `shared/` |
| `useProjectApi` | 下層9ページのみ | 下層専用 → `workspace/` |
| `useSteeringDocuments` | 下層 steering 2ページのみ | 下層専用 → `workspace/` |

置き場所は**実際に参照しているファイルの範囲**で決まる。役割や名前では決めない。参照範囲が変わったら移す。

---

## 2つの経路

composable は2系統に分かれる。合流しない。

```
通知（受信）                        読み取り（要求）
────────────                      ──────────────
本家 WebSocket                     下層ページ
  ▼                                  ▼
server/utils/upstream/socket        composables/workspace/useProjectApi
  ▼                                  ▼
server/utils/control/**             server/api/projects/**
  ▼                                  ▼
server/routes/ws.ts                 control/upstream-proxy.ts
  ▼                                  ▼
composables/shared/useBoardSocket   upstream/rest.ts
  ▼                                  ▼
Toaster / 通知一覧                   本家 REST
```

`useBoardSocket` は**押し出される**もの（サーバーから届く）、`useProjectApi` は**引き取る**もの（画面から要求する）。前者は全画面で1本を共有し、後者は画面ごとに呼ぶ。

---

# ストローク側（棚卸し）

`app/composables/` 直下に平置き。現状の実態を書き出したもの。

**これは棚卸しであって規則ではない。** 今こうなっている、という記録にすぎない。どう切り直すべきかは決めていない。置き場の規則は `docs/specs/core/system-structure.md`。

## 一覧

| ファイル | 何をするか | 何に触るか | 誰が使うか |
|---|---|---|---|
| `useSessionChannel.ts` | セッションの WS チャンネルを1つ購読し、最後の1件を持つ | WebSocket（`useWebSocket`） | 画面1、`useAgentQuestion`（W1）、`useProposalReview`（W2） |
| `useWaitingRetry.ts` | 送信後の待機と失敗の判定 | HTTP（`GET /api/strokes/<id>` を `useIntervalFn` でポーリング） | 画面1、`useAgentQuestion`、`useProposalReview` |
| `useAnnotations.ts` | 差し戻しコメントを積み、4層のペイロードに組む | なし（純粋な状態と変換） | `useProposalReview`、`CommentModal` |
| `useAgentQuestion.ts` | 問いの往復（W1 購読・回答送信・AI 起動要求・待機）を1つにまとめる | `useSessionChannel`・`useWaitingRetry` + HTTP | `useProposalReview`（※2026-08-24 追記。棚卸しから漏れていた） |
| `useProposalReview.ts` | 画面2の状態と往復の全部 | 上の各本 + HTTP | 画面2、`Modals.vue` |

## 個別

### `useSessionChannel.ts`（31行）

```
useSessionChannel<T>(sessionId, channel) → Ref<T | null>
```

`ws://<host>/api/strokes/<id>/ws/<channel>` に `useWebSocket`（vueuse、`autoReconnect: true`）で繋ぎ、届いた1件で上書きする。**最後の1件しか持たない。** 接続時にもサーバー側から現在分が1件届く。

URL は `computed` で組み、`typeof window === 'undefined'` なら空文字を返す（`useWebSocket` は空の URL では繋がない）。

W1 と W2 の**唯一の違いは購読先のパスと届く型**だったので、それを引数に出して1本にした（`replace-handrolled-with-libraries` design 決定2）。

**ラッパは置かない。呼び出し側が直接呼ぶ。**

| 呼ぶ側 | 呼び出し | 契約 |
|---|---|---|
| `pages/strokes/[sessionId]/index.vue` | `useSessionChannel<Question>(sessionId, 'question')` | W1 |
| `useAgentQuestion.ts` | `useSessionChannel<Question>(sessionId, 'question')` | W1 |
| `useProposalReview.ts` | `useSessionChannel<ProposalMessage>(sessionId, 'proposal')` | W2 |

かつては `useQuestionChannel` / `useProposalChannel` という8行のラッパ2本を挟んでいた。中身は**返り値に名前を付け直すだけ**で、購読先と型は `'question'` / `<Question>` という**ただの引数**だったため、判定の本体（`docs/specs/plan/composables-library-replacement.md` の「2本 → 1本」）に合わせて消した。W1 / W2 という契約の名前は、このファイルの冒頭コメントと呼び出し行のコメントで保つ。

呼び出し3箇所とも `useSessionChannel` を**明示 import していない**（ストローク側は auto-import）。

### `useWaitingRetry.ts`（49行）

```
useWaitingRetry(sessionId) → { waiting, failed, startWaiting, stopWaiting }
```

待機中だけ3秒おきに `GET /api/strokes/<id>` を読み、`invocation` が `failed` / `idle` になったら止まる。**通常は W1 / W2 の配信が先に届くので、これは保険。**

timer は vueuse の `useIntervalFn(fn, 3000, { immediate: false })` に委ねている。`resume()` は張り直しのたびに前の timer を捨てるので手で clear する必要がなく、scope が壊れたときの停止も内蔵している。

**SSR ガードは残っている。** `startWaiting()` の中で `import.meta.server` なら `resume()` せずに返す。`useIntervalFn` は client 限定のガードを持たず、SSR で `setInterval` を張ると Nuxt が例外にするため（実測: reload 直後の SSR で `invocation: running` を踏んで判明、とコメントにある）。

回復（再送）はしない。呼び出し側の役割。

### `useAnnotations.ts`（178行）

```
useAnnotations() → { comments, addSelection, addGeneral, update, remove, clear,
                     summary, nextSteps, buildPayload }
```

**外に触らない。** コメントの配列を持ち、AI へ渡す4層のペイロード（`response` / `comments` / `annotations` / `nextSteps`）に組む。

ハイライト5色の定義（`highlightColors`）を持っていて、`CommentModal.vue` が直接 import している。**composable が色の定義も兼ねている。**

注釈は生テキストへの文字オフセット（`startOffset` / `endOffset`）と引用文字列で持つ。

### `useAgentQuestion.ts`（132行）

※2026-08-24 追記。棚卸しから漏れていた。

```
useAgentQuestion(sessionId) → { question, waiting, failed, error, answered, send }
```

W1 の購読（`useSessionChannel`）・回答の送信（U7）・AI の起動要求（U13）・待機（`useWaitingRetry`）を1つに束ねる。状態は全て返り値として出し、外から渡す口は持たない。面（`AgentQuestion`）はこれに依存せず props と emit だけで繋がる。使い方は `docs/specs/reference/stroke-modules.md`。

`replace-handrolled-with-libraries` での変更はコメント1語のみ（面の名前が `AgentQuestionModal` → `AgentQuestion` に変わったことへの追随）。中身は触っていない。

**送信先の `base` が `/api/${sessionId}` になっている**（`useProposalReview` と画面1は `/api/strokes/${sessionId}`）。これは別 change `fix-agent-question-api-path` の対象で、ここでは現状の記録として残す。

### `useProposalReview.ts`（412行）

```
useProposalReview(sessionId, { phase, strokes }) → 39 個のプロパティ
```

（※2026-08-24 実測。旧記述は 410行・46 プロパティ）

**突出して大きい。** 他の4本を束ね（W1 の `useSessionChannel` は `useAgentQuestion` 越し、W2 は自分で直接呼ぶ）、画面2の状態と往復を丸ごと持つ。返すものは自分でコメントを付けて6群に区切ってある。

```
本文と局面   phase / strokes / proposal / projectName /
             awaitingFollowup / followupQuestion / followupWaiting
コメント     comments
表示         viewMode / notice / busy / sendingBack
モーダル     commentModalOpen / pending / editingId / editing / editingGeneral /
             generalModalOpen / generalDraft / deleteId / alertTitle /
             alertMessage / approveOpen / conflictName / approveBlocked
問い返し     followupOpen / answered
操作         onSelect / editComment / saveComment / openGeneral / closeGeneral /
             saveGeneral / confirmDelete / sendBack / openFollowup /
             answerFollowup / openApprove / approve
```

内部に持っているもの。

- **HTTP エラーの解体**（`statusOf` / `reasonOf` / `messageOf`）。`$fetch` が投げる `FetchError` から statusCode・409 の理由・メッセージを取り出す3関数
- **送信〜決着の追跡**（`pendingAction` と `watch`）。差し戻しと問い返しの2種類の送信が同じ待機機構を共有していて、決着時にどちらの後始末をするかを `pendingAction` で分岐している
- **モーダル4種の開閉状態**（コメント / 全体コメント / 承認 / 問い返し）と、確認・警告
- **プロジェクト名の下書き**。ユーザーが書いたら proposal 更新で消さない

## 気づいたこと

- ~~**`useQuestionChannel` と `useProposalChannel` が構造的に同じ。** WS の URL 組み立ても重複~~ → **解消済み**（`replace-handrolled-with-libraries`）。2本を消して `useSessionChannel` 1本に畳み、呼び出し側が購読先と型を渡す。URL の組み立ては `useSessionChannel` の1箇所だけ
- **`useProposalReview` が 412 行で、他の6本の合計（406行）より大きい。** 状態・モーダル・HTTP エラー解体・送信の決着追跡が1箇所に集まっている（※チャンネルの集約で内訳は変わったが、合計 406行 は変わっていない）
- **色の定義が composable にある。** `useAnnotations.ts` の `highlightColors` を `CommentModal.vue` が直接 import している
- **画面1側には composable が無い。** `app/pages/strokes/[sessionId]/index.vue` は `useSessionChannel` と `useWaitingRetry` を直接呼び、送信（`answer()` の中の U7 → U13 の2連発）も自前で書いている。画面2だけが `useProposalReview`（と `useAgentQuestion`）にまとまっている。`replace-handrolled-with-libraries` はここを変えていない
- **`useAgentQuestion` だけ API の base が `/api/<id>` で、他は `/api/strokes/<id>`。** 別 change `fix-agent-question-api-path` の対象
