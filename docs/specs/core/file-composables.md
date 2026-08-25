# composable 一覧

`app/composables/` の現状の実態と、規範（`docs/specs/core/system-structure.md` の区切り）への対応。

## 規範への対応 — 全10本

規範は**関心単位の `useXxx` を平置き**（境界のディレクトリ shared / workspace を作らない）。現在の10本:

| 関心 | composable | 整理の方向 |
| --- | --- | --- |
| 通知の受信 | `useBoardSocket` | シングルトン WS。そのまま |
| 時刻表示 | `useRelativeTime` | そのまま |
| プロジェクトの読み書き | `useProjectApi` | プロジェクト単位画面の唯一の口。そのまま |
| ステアリングの読み書き | `useSteeringDocuments` | `useProjectApi` と同じ関心の口として並べる |
| 問いの往復 | `useAgentQuestion` | 回答送信・AI 起動（契約 U7 / U13）。そのまま |
| 問いの配信 | `useQuestionChannel` | 契約 W1 の受け口 |
| proposal の配信 | `useProposalChannel` | 契約 W2 の受け口 |
| proposal のレビュー | `useProposalReview` | 39 プロパティに肥大し `Modals.vue` と密結合。分割は**保留** — markdown コンポーネント集約の確定後、`flatten-composables` の design で決める（分割案はここで固定しない） |
| 注釈 | `useAnnotations` | 色定義5件をコンポーネントが逆向き import している。**色の実値は CSS へ移し、データ（`Annotation.highlightColor`）は色名のみ持つ**（検討） |
| 待機とリトライ | `useWaitingRetry` | そのまま |

### 移行後パスの写像

平置きへ移すのはポータル側の4本のみ。ストローク側の6本は既に直下にあり、移動しない。

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
- **ストローク側** — 直下に平置きの6本（棚卸しは「ストローク側」の章）

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

export function useBoardSocket(): BoardSocket
```

| 返り値 | 用途 |
| --- | --- |
| `notifications` | 通知の一覧。読み取り専用 |
| `upstreamConnected` | 本家への接続状態。ヘッダーの dot に出す |
| `onNotification` | 新しく発生した通知のハンドラ。トーストの発火に使う |

**`onNotification` に初回スナップショットは流れない。** 画面を開いた瞬間に既存の通知が全部トーストで出てしまうのを避けるため。

#### 接続は1本だけ

モジュールスコープの `shared` に握って使い回す（シングルトン）。上層と下層のどちらにいても通知を受けるため、画面ごとに接続を張らない。

```ts
let shared: BoardSocket | null = null;
export function useBoardSocket(): BoardSocket {
  if (shared !== null) return shared;
  ...
}
```

#### SSR では接続しない

`import.meta.client` を見てブラウザに渡ってから張る。

#### 繋ぐ先

**stroke-board のサーバー（`server/routes/ws.ts`）だけ。本家 WebSocket には繋がない**（`specs/upstream-connection`）。ブラウザから本家へ直接触らせないという境界による。

`onNotification` のハンドラは `onScopeDispose` で自動的に解除される。

**参照元**（5）— `layouts/portal.vue`、`layouts/workspace.vue`、`pages/index.vue`、`pages/projects/index.vue`、`components/shared/NotificationToaster.vue`

### useRelativeTime.ts

一覧の「最終更新」列に出す相対時刻。18行。**4つの中で最小。**

```ts
export function formatRelativeTime(iso: string, now = Date.now()): string
```

`now` を引数で受けるためテストで時刻を固定できる。

`use` で始まるが Vue のリアクティブな状態を持たない純関数。ファイル名の慣習に合わせてある。

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
| `useBoardSocket` | 上層2 + 両レイアウト + Toaster | 階層をまたぐ → `shared/` |
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
| `useQuestionChannel.ts` | W1 を購読し、今の1問を持つ | WebSocket | 画面1、`useProposalReview` |
| `useProposalChannel.ts` | W2 を購読し、proposal と名前候補を持つ | WebSocket | `useProposalReview` |
| `useWaitingRetry.ts` | 送信後の待機と失敗の判定 | HTTP（`GET /api/strokes/<id>` をポーリング） | 画面1、`useProposalReview` |
| `useAnnotations.ts` | 差し戻しコメントを積み、4層のペイロードに組む | なし（純粋な状態と変換） | `useProposalReview`、`CommentModal` |
| `useAgentQuestion.ts` | 問いの往復（W1 購読・回答送信・AI 起動要求・待機）を1つにまとめる | `useQuestionChannel`・`useWaitingRetry` + HTTP | `useProposalReview`（※2026-08-24 追記。棚卸しから漏れていた） |
| `useProposalReview.ts` | 画面2の状態と往復の全部 | 上の各本 + HTTP | 画面2、`Modals.vue` |

## 個別

### `useQuestionChannel.ts`（24行）

```
useQuestionChannel(sessionId) → { question }
```

`ws://<host>/api/<id>/ws/question` に `useWebSocket`（vueuse）で繋ぎ、届いた1件で上書きする。**今の1問しか持たない。** 接続時にもサーバー側から現在分が1件届く。

URL を自前で組み立てている（`window.location` から scheme と host を取る）。

### `useProposalChannel.ts`（24行）

```
useProposalChannel(sessionId) → { message }
```

`useQuestionChannel` と**構造が完全に同じ**。違うのはパス（`/ws/proposal`）と型（`ProposalMessage`）だけ。URL の組み立てロジックも重複している。

### `useWaitingRetry.ts`（48行）

```
useWaitingRetry(sessionId) → { waiting, failed, startWaiting, stopWaiting }
```

待機中だけ3秒おきに `GET /api/strokes/<id>` を読み、`invocation` が `failed` / `idle` になったら止まる。**通常は W1 / W2 の配信が先に届くので、これは保険。**

SSR では `setInterval` を張らない（Nuxt が例外にする、と実測のコメントあり）。

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

W1 の購読（`useQuestionChannel`）・回答の送信（U7）・AI の起動要求（U13）・待機（`useWaitingRetry`）を1つに束ねる。状態は全て返り値として出し、外から渡す口は持たない。面（`AgentQuestionModal`）はこれに依存せず props と emit だけで繋がる。使い方は `docs/specs/reference/stroke-modules.md`。

### `useProposalReview.ts`（412行）

```
useProposalReview(sessionId, { phase, strokes }) → 39 個のプロパティ
```

（※2026-08-24 実測。旧記述は 410行・46 プロパティ）

**突出して大きい。** 他の5本を束ね（`useQuestionChannel` は `useAgentQuestion` 越し）、画面2の状態と往復を丸ごと持つ。返すものは自分でコメントを付けて6群に区切ってある。

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

- **`useQuestionChannel` と `useProposalChannel` が構造的に同じ。** WS の URL 組み立ても重複
- **`useProposalReview` が 412 行で、他の5本の合計（406行）より大きい。** 状態・モーダル・HTTP エラー解体・送信の決着追跡が1箇所に集まっている（※2026-08-24 実測で更新）
- **色の定義が composable にある。** `useAnnotations.ts` の `highlightColors` を `CommentModal.vue` が直接 import している
- **画面1側には composable が無い。** `app/pages/strokes/[sessionId]/index.vue` は `useQuestionChannel` と `useWaitingRetry` を直接呼び、送信も自前で書いている。画面2だけが `useProposalReview` にまとまっている
