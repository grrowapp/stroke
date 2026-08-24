# composable 一覧

`app/composables/` にある4つの composable のリファレンス。

- 置き場所の規約は `openspec/changes/restructure-app-directories/specs/app-structure/spec.md`
- 層の積み方と全体の構造は `docs/structure-design.md`
- 記述は実装から抽出した事実に限る

**auto-import は使わない。** `nuxt.config.ts` が `imports: { autoImport: false }` を設定しているため、すべて `~/composables/<階層>/<名前>` の明示 import で参照する。

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
