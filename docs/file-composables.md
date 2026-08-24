# composable 一覧

`app/composables/` には2系統が同居している。

- **ポータル側** — `shared/` と `workspace/` の4本（階層で分ける規約。以下「ポータル側」）
- **ストローク側** — 直下に平置きの6本（棚卸しは「ストローク側」の章。配置の切り直しは統合後の課題）

---

# ポータル側


`app/composables/` にある4つの composable のリファレンス。

- 置き場所の規約は `openspec/changes/restructure-app-directories/specs/app-structure/spec.md`
- 層の積み方と全体の構造は `docs/structure-design.md`
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

**下層の画面が本家の情報を取るための唯一の口。** 82行。8つの関数を export する。

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

ステアリング文書の有無を組み立てる。41行。

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

**これは棚卸しであって規則ではない。** 今こうなっている、という記録にすぎない。どう切り直すべきかは決めていない。置き場の規則は `docs/structure.md`。

## 一覧

| ファイル | 何をするか | 何に触るか | 誰が使うか |
|---|---|---|---|
| `useQuestionChannel.ts` | W1 を購読し、今の1問を持つ | WebSocket | 画面1、`useProposalReview` |
| `useProposalChannel.ts` | W2 を購読し、proposal と名前候補を持つ | WebSocket | `useProposalReview` |
| `useWaitingRetry.ts` | 送信後の待機と失敗の判定 | HTTP（`GET /api/<id>` をポーリング） | 画面1、`useProposalReview` |
| `useAnnotations.ts` | 差し戻しコメントを積み、4層のペイロードに組む | なし（純粋な状態と変換） | `useProposalReview`、`CommentModal` |
| `useProposalReview.ts` | 画面2の状態と往復の全部 | 上の4本 + HTTP | 画面2、`Modals.vue` |

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

待機中だけ3秒おきに `GET /api/<id>` を読み、`invocation` が `failed` / `idle` になったら止まる。**通常は W1 / W2 の配信が先に届くので、これは保険。**

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

### `useProposalReview.ts`（410行）

```
useProposalReview(sessionId, { phase, strokes }) → 46 個のプロパティ
```

**突出して大きい。** 他の4本を全部束ね、画面2の状態と往復を丸ごと持つ。返すものは自分でコメントを付けて6群に区切ってある。

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
- **`useProposalReview` が 410 行で、他の4本の合計（274行）より大きい。** 状態・モーダル・HTTP エラー解体・送信の決着追跡が1箇所に集まっている
- **色の定義が composable にある。** `useAnnotations.ts` の `highlightColors` を `CommentModal.vue` が直接 import している
- **画面1側には composable が無い。** `app/pages/strokes/[sessionId]/index.vue` は `useQuestionChannel` と `useWaitingRetry` を直接呼び、送信も自前で書いている。画面2だけが `useProposalReview` にまとまっている
