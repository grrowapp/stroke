# composable 一覧

`app/composables/` の現状の実態と、規範（`docs/specs/structure/system-structure.md` の区切り）への対応。

**参照元に書いてある `pages/…` は現状の置き場である。** 到達点では `pages/` は Route の対応だけを持ち、ページの実装は `components/page/<PageName>/<PageType>/Container.vue` に集約する（`docs/specs/structure/page-structure.md` / `page-component-structure.md`）。composable を呼ぶのは Container.vue になるので、移行が済んだら参照元を Page Component の名前へ書き換える。

## 規範への対応 — 全11本

規範は**関心単位の `useXxx` を平置き**（境界のディレクトリ shared / workspace を作らない）。現在の11本:

（markdown のモジュール化で `modules/markdown/` へ移った composable は無い。モジュールの `runtime/position/*.ts` は位置の対応を出す関数で、composable ではなく、この棚卸しの対象外。全数は `docs/specs/structure/system-structure.md` §3。）

| 関心 | composable | 整理の方向 |
| --- | --- | --- |
| 通知の受信 | `useBoardSocket` | vueuse の `createSharedComposable` で1本に共有。そのまま |
| 時刻表示 | `useRelativeTime` | vueuse の `formatTimeAgo` の包み。そのまま |
| プロジェクトの読み書き | `useProjectApi` | プロジェクト単位画面の唯一の経路。そのまま |
| ステアリングの読み書き | `useSteeringDocuments` | `useProjectApi` と同じ関心の composable として並べる |
| 問いの往復 | `useAgentQuestion` | 回答送信・AI 起動（契約 U7 / U13）。そのまま |
| セッションの WS 購読 | `useSessionChannel` | W1 / W2 の唯一の購読。購読先のパスと届く型を引数で受け、呼び出し側が直接呼ぶ |
| proposal のレビュー | `useProposalReview` | 39 プロパティに肥大し `Modals.vue` と密結合。うち13はモーダルの状態で、component 側の引き直しと不可分。**分割は未着手**（分割案はここで固定しない） |
| 注釈 | `useAnnotations` | 色定義5件（`highlightColors`）を `CommentModal.vue` が逆向き import している。塗りの実値は CSS の `::highlight()` へ移った（下の `useAnnotationHighlight`）。`highlightColors` は保存形と色見本が使う |
| 注釈の塗り | `useAnnotationHighlight` | CSS Custom Highlight API で本文の DOM を書き換えずに範囲を塗る（264行）。色は**名**でだけ引き、実値は `app/assets/css/main.css` の `::highlight()` が持つ。使うのは `review/AnnotateSource.vue`。そのまま |
| トースト | `useUpstreamToast` | tone → 本家の色クラスの対応と `toast.add()` の組み立て（119行）。`NotificationToaster.vue` から抜き出し、承認への応答の結果も同じ見た目で出す。使うのは `shared/NotificationToaster.vue` / `workspace/ApprovalCard.vue` / `review/ApprovalAnnotator.vue`。そのまま |
| 待機とリトライ | `useWaitingRetry` | timer は vueuse の `useIntervalFn` に委譲済み。そのまま |

### 平置き — 実施済み

`shared/` と `workspace/` を畳み、11本すべてが `app/composables/` 直下にある。

| 移行前 | 移行後 |
| --- | --- |
| `composables/shared/useBoardSocket.ts` | `composables/useBoardSocket.ts` |
| `composables/shared/useRelativeTime.ts` | `composables/useRelativeTime.ts` |
| `composables/workspace/useProjectApi.ts` | `composables/useProjectApi.ts` |
| `composables/workspace/useSteeringDocuments.ts` | `composables/useSteeringDocuments.ts` |

参照元25箇所の import パスも合わせて直した。

明示 import の規約は steering（`.spec-workflow/steering/structure.md` の Import Patterns）が持つ。**この点は未実施** — `nuxt.config.ts` に `imports` の設定が無く、auto-import は既定で有効のまま。ストローク側は明示 import 無しで動いている。

単体テストは `test/app/composables/useRelativeTime.test.ts` にある。

`shared/useRelativeTime.ts` は `useXxx` を1つも export していない（中身は純関数 `formatRelativeTime` のみ）。規範の「関心単位の `useXxx` を平置き」に当てはまらないが、**規範のツリーに純関数の置き場が無い**ため、置き場の新設を含めて平置きと同じ change で決める。

---

以下は統合前の棚卸しの記録。2系統が同居している。

- **ポータル側** — `shared/` と `workspace/` の4本（階層で分ける規約。以下「ポータル側」）
- **ストローク側** — 直下に平置きの5本（棚卸しは「ストローク側」の章）

---

# ポータル側


`app/composables/` にある4つの composable のリファレンス。

- 置き場所の判定の物差しは `openspec/specs/app-structure/spec.md`
- 層の積み方と全体の構造は `docs/specs/structure/system-structure.md`
- 記述は実装から抽出した事実に限る

**ポータル側は明示 import で参照する**（`~/composables/<名前>`）。規約は steering が持つ（Import Patterns）。ストローク側のコードがまだ auto-import に依存しているため `nuxt.config.ts` では当面有効のまま（統一は未実施）。

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

中身は vueuse の3つで組んである（自前の WebSocket・タイマー・ハンドラ管理をライブラリへ置き換えた）。

| 手 | 何に使っているか |
| --- | --- |
| `useWebSocket` | 接続と再接続（`autoReconnect: { delay: 2_000 }`）。生の `WebSocket` と自前のタイマーは持たない |
| `createEventHook` | `onNotification` の配信。ハンドラの `Set` も `onScopeDispose` での解除も持たない（scope の破棄に任せる） |
| `createSharedComposable` | 接続をアプリ全体で1本に保つ。モジュールスコープの `shared` 変数は無い |

#### 接続は1本だけ

`createSharedComposable` は**参照カウント式**で、購読している scope が全て消えると state ごと捨て、次の呼び出しで作り直す。

**`app.vue` 直下の `NotificationToaster` が常駐して購読を持ち続けること**が、その「全て消える」を起こさない前提。あれを外すとレイアウト切替の瞬間に購読が0になり、接続が切れる。`app.vue` と `NotificationToaster.vue` の両方にその旨のコメントがある。

`createGlobalState` は採っていない。**モジュールスコープに state を置くため、SSR でリクエストを跨いで共有されてしまう。**

#### SSR では接続しない

URL を `computed` で組み、`typeof window === 'undefined'` なら空文字を返す。`useWebSocket` は空の URL では繋がない。

#### 繋ぐ先

**stroke-board のサーバー（`server/routes/ws.ts`）だけ。本家 WebSocket には繋がない**（`specs/upstream-connection`）。ブラウザから本家へ直接触らせないという境界による。

**参照元**（8）— `components/shared/NotificationToaster.vue`（`onNotification`）、`components/workspace/WorkspaceShell.vue`（`upstreamConnected`。`layouts/workspace.vue` から移った）、`layouts/portal.vue`、`pages/index.vue`、`pages/projects/index.vue`、`pages/projects/[projectId]/approvals/[approvalId].vue`、`pages/projects/[projectId]/specs/[specName]/[document].vue`、`pages/projects/[projectId]/steering/[name].vue`

※ 下層3ページは `upstreamConnected` だけを取る。`app.vue` と `components/review/ApprovalAnnotator.vue` は呼ばずにコメントで触れているだけ。

### useRelativeTime.ts

一覧の「最終更新」列に出す相対時刻。47行。**4つの中で最小。**

```ts
export function formatRelativeTime(iso: string, now = Date.now()): string
```

`now` を引数で受けるためテストで時刻を固定できる。

`use` で始まるが Vue のリアクティブな状態を持たない純関数。ファイル名の慣習に合わせてある。

#### 中身は `javascript-time-ago`

刻みの判定・日本語の文言・丸め・7日超の絶対日時への切り替えを自前で持たない。**自前で書いてあるのは無効な日付のガード1行だけ。**

| 指定 | 既定 | ここでの指定 | 理由 |
| --- | --- | --- | --- |
| `steps` | `now` / minute / hour / day / week / month / year | 本家の閾値の写し（60秒 / 60分 / 24時間 / **7日**）。最後の step の `format` が絶対日時 | 本家 `formatDistanceToNow` は7日で相対表記を打ち切る。**分岐は書かない**（step の切り替えで表現する） |
| `labels` | `'long'` | `'narrow'` | `long` / `short` / `mini` は `Intl.RelativeTimeFormat` 系で「46 **空白** 分前」になる。`narrow` だけが「46分前」（実測） |
| `round` | `'round'` | `'floor'` | 本家は `Math.floor`。既定だと `1分59秒` が「2分前」になる |

日本語の文言は `javascript-time-ago/locale/ja` から出る。文言の定義を自前で持たない。

vueuse は採っていない。`formatTimeAgo` は文言8種を手で書く必要があり、`formatTimeAgoIntl` は「昨日」「先週」「先月」「昨年」という本家に無い表現を出す（`docs/specs/plan/composables-library-replacement.md` に実測の比較表がある）。

**テスト**（`test/app/composables/useRelativeTime.test.ts`）— 設定を落とすと落ちるケースを明示的に置いてある（46分・23時間59分・`1分59秒`・7日の打ち切り・空白の有無）。

**参照元**（6）— 上層2ページ（`index.vue`、`projects/index.vue`）と下層3ページ（`specs/index.vue`、`steering/index.vue`、`tasks/index.vue`）、使い捨ての `prototype/projects.vue`

---

## workspace/ — 下層専用

### useProjectApi.ts

**下層の画面が本家の情報を取るための唯一の経路。** 192行。11 の関数を export する（※2026-08-24 実測。旧記述は 82行・8関数）。

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

**参照元**（11）— 下層の9ページ、`pages/projects/index.vue`、`components/review/ApprovalAnnotator.vue`（`respondToApproval` / `pendingApprovalsKey`）

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
server/utils/upstream/socket        composables/useProjectApi
  ▼                                  ▼
server/utils/control/**             server/api/projects/**
  ▼                                  ▼
server/routes/ws.ts                 control/upstream-proxy.ts
  ▼                                  ▼
composables/useBoardSocket          upstream/rest.ts
  ▼                                  ▼
Toaster / 通知一覧                   本家 REST
```

`useBoardSocket` は**押し出される**もの（サーバーから届く）、`useProjectApi` は**引き取る**もの（画面から要求する）。前者は全画面で1本を共有し、後者は画面ごとに呼ぶ。

---

# ストローク側（棚卸し）

`app/composables/` 直下に平置き。現状の実態を書き出したもの。

**これは棚卸しであって規則ではない。** 今こうなっている、という記録にすぎない。どう切り直すべきかは決めていない。置き場の規則は `docs/specs/structure/system-structure.md`。

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

W1 と W2 の**唯一の違いは購読先のパスと届く型**だったので、それを引数に出して1本にした。

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

注釈は文字オフセット（`startOffset` / `endOffset`）と引用文字列で持つ。

**基準は、本家から取得した文書の中身そのものである。** 整形して読むために内部で行う作り変え（CRLF を LF へ潰す・先頭の front matter を落とす）の後の文字列を基準にしてはならない。オフセットは本家へ送られて保存され、系の中で唯一それを文書へ当てる実装（本家ダッシュボードの SPA）は、正規化せずに読んだファイルへ当てる。基準がずれた値は「長さの範囲内で、開始が終了より前」という妥当性の判定を通ってしまうため、弾かれずに別の場所を指す。

食い違いを吸収するのは markdown を描く面の内側であり、`useAnnotations` を呼ぶ側が渡す前に文字列を揃える手続きは持たない（`openspec/specs/markdown/module`「面は解析のための正規化を自分で吸収する」）。

### `useAgentQuestion.ts`（132行）

※2026-08-24 追記。棚卸しから漏れていた。

```
useAgentQuestion(sessionId) → { question, waiting, failed, error, answered, send }
```

W1 の購読（`useSessionChannel`）・回答の送信（U7）・AI の起動要求（U13）・待機（`useWaitingRetry`）を1つに束ねる。状態は全て返り値として出し、外から渡す引数は持たない。面（`AgentQuestion`）はこれに依存せず props と emit だけで繋がる。使い方は `docs/specs/reference/stroke-modules.md`。

面の名前が `AgentQuestionModal` → `AgentQuestion` に変わったことへの追随でコメント1語だけ変わった。中身は触っていない。

**送信先の `base` が `/api/${sessionId}` になっている**（`useProposalReview` と画面1は `/api/strokes/${sessionId}`）。契約（`docs/specs/api/contract.md`）の形は `/api/strokes/<id>` なので、これは食い違いである。ここでは現状の記録として残す。

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

- ~~**`useQuestionChannel` と `useProposalChannel` が構造的に同じ。** WS の URL 組み立ても重複~~ → **解消済み**。2本を消して `useSessionChannel` 1本に畳み、呼び出し側が購読先と型を渡す。URL の組み立ては `useSessionChannel` の1箇所だけ
- **`useProposalReview` が 547 行で、ストローク側の他の4本の合計（541行）より大きい**（2026-09-04 実測。「個別」の各節に書いた行数と返り値の内訳は 2026-08-24 時点の記録で、その後の変更を追っていない）。状態・モーダル・HTTP エラー解体・送信の決着追跡が1箇所に集まっている
- **色の定義が composable にある。** `useAnnotations.ts` の `highlightColors` を `CommentModal.vue` が直接 import している。塗りの実値は CSS へ移ったが、色見本と保存形はまだこの定義を使う
- **画面1の実装が `pages/` にある。** `app/pages/strokes/[sessionId]/index.vue` は `useSessionChannel` と `useWaitingRetry` を直接呼び、送信（`answer()` の中の U7 → U13 の2連発）も自前で書いている。画面2だけが `useProposalReview`（と `useAgentQuestion`）にまとまっている。到達点では `pages/` にページ固有のロジックを置かない（`page-structure.md`）ので、この実装は Page Component の Container.vue へ移す対象になる。移行課題は `docs/specs/plan/structure-migration.md`
- **`useAgentQuestion` だけ API の base が `/api/<id>` で、他は `/api/strokes/<id>`。** 契約との食い違い（上の「個別」）
