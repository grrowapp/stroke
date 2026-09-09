# composables 一覧

| composable | 説明 |
| --- | --- |
| `useBoardSocket.ts` | stroke-board サーバの WebSocket から通知を受ける（全画面で1接続を共有） |
| `useRelativeTime.ts` | ISO 時刻を相対時刻の文字列にする純関数 |
| `useProjectApi.ts` | 本家の情報の取得・保存 API 呼び出し11関数を集約する |
| `useSteeringDocuments.ts` | ステアリング3文書（product / tech / structure）の有無を組み立てる |
| `useQuestionChannel.ts` | W1 を購読し、今の1問を持つ |
| `useProposalChannel.ts` | W2 を購読し、proposal と名前候補を持つ |
| `useWaitingRetry.ts` | 送信後の待機と失敗を `GET /api/strokes/<id>` のポーリングで判定する |
| `useAnnotations.ts` | 差し戻しコメントを積み、AI へ渡す4層のペイロードに組む |
| `useAgentQuestion.ts` | 問いの往復（W1 購読・回答送信・AI 起動要求・待機）を1つに束ねる |
| `useProposalReview.ts` | 画面2（proposal レビュー）の状態と往復の全部を持つ |

置き場: ポータル側は `app/composables/shared/`（`useBoardSocket` / `useRelativeTime`）と `app/composables/workspace/`（`useProjectApi` / `useSteeringDocuments`）、ストローク側の6本は `app/composables/` 直下。

## 各 composable の使い方

### `useBoardSocket`

```ts
// app/pages/index.vue の <script setup> — 一覧の表示と接続状態
import { useBoardSocket } from '~/composables/shared/useBoardSocket';

const { notifications, upstreamConnected } = useBoardSocket(); // 引数なし
// notifications.value     → Notification[]（接続時のスナップショット + 新着。新しい順）
// upstreamConnected.value → true / false（本家ダッシュボードと繋がっているか）
```

```ts
// app/components/shared/NotificationToaster.vue の <script setup> — 新着だけトーストで出す
import { ref } from 'vue';
import { useBoardSocket } from '~/composables/shared/useBoardSocket';
import type { Notification } from '#shared/types';

const toasts = ref<Notification[]>([]);
const { onNotification } = useBoardSocket(); // 上と同じ1接続が返る

onNotification((notification) => {
  // 新着通知が来るたび呼ばれる。初回スナップショットの分では呼ばれない
  toasts.value = [...toasts.value, notification];
});
```

何度どこで呼んでも同じ1接続を共有する（SSR では接続せず、ブラウザに渡ってから張る）。切断時は2秒後に自動で張り直す。

### `useRelativeTime`

```ts
// app/pages/projects/index.vue の <script setup> — 一覧の「最終更新」列
import { formatRelativeTime } from '~/composables/shared/useRelativeTime';

// 以下は「今」が 2026-08-24T12:00:00Z のときの結果
formatRelativeTime('2026-08-24T11:59:30Z'); // → "たった今"（60秒未満）
formatRelativeTime('2026-08-24T09:00:00Z'); // → "3時間前"
formatRelativeTime('2026-08-20T12:00:00Z'); // → "4日前"
formatRelativeTime('not-a-date');           // → "—"（パース不能）

// 第2引数で基準時刻（ms）を固定できる。省略時は Date.now()
formatRelativeTime('2026-08-24T11:30:00Z', Date.parse('2026-08-24T12:00:00Z')); // → "30分前"
```

```vue
<!-- template では値の有無だけ画面側が始末する -->
<span>{{ project.lastModified === null ? '—' : formatRelativeTime(project.lastModified) }}</span>
```

Vue に依存しない純関数。リアクティブには追従しない（描画時点の値で固定される）。

### `useProjectApi`

取得系（`useFetch` を返し、引数は `MaybeRefOrGetter<string>`。URL が変われば取り直す）:

```ts
// app/pages/projects/[projectId]/steering/index.vue の <script setup>
import { useProjectId, useProjectInfo } from '~/composables/workspace/useProjectApi';

const projectId = useProjectId(); // URL /projects/[projectId]/... の値を computed で返す
const { data: info } = await useProjectInfo(projectId); // GET /api/projects/<id>/info
// info.value → ProjectInfoDto。steering.documents（3文書の有無）などが入る
// 例: info.value.steering.documents → { product: true, tech: true, structure: false }
```

保存系（`$fetch` で1回だけ送る。返り値は成功で `null`、失敗で理由の文字列）:

```ts
// app/pages/projects/[projectId]/approvals/[approvalId].vue の <script setup>
import { saveTargetOf } from '~/composables/workspace/useProjectApi';

const target = saveTargetOf('.spec-workflow/specs/file-composables/requirements.md');
// → { save } を返す（specs 配下の requirements / design / tasks に一致したため）
// 一致しない・編集を許さない文書名なら null → 読むだけの表示にする

const reason = await target?.save('my-project', '# 書き直した本文');
// → 成功で null。失敗で "本家に繋がりません。本家が動いているか確かめてください。" のような
//   画面にそのまま出せる文字列
```

取得系は他に `useSpecs` / `useSpecDocuments` / `useTaskProgress` / `useSteeringDocument` / `usePendingApprovals` / `useApprovalContent`、保存系は `saveSpecDocument(projectId, specName, document, content)` / `saveSteeringDocument(projectId, name, content)`。

### `useSteeringDocuments`

```ts
// app/pages/projects/[projectId]/steering/index.vue の <script setup> — 3文書の一覧を組む
import { useProjectId, useProjectInfo } from '~/composables/workspace/useProjectApi';
import { useSteeringEntries } from '~/composables/workspace/useSteeringDocuments';

const projectId = useProjectId();
const { data: info } = await useProjectInfo(projectId);

const entries = useSteeringEntries(info); // info を渡す。読み直しに追従する computed
// entries.value → 常にこの3件固定（exists だけが info で変わる）:
// [ { name: 'product',   label: 'Product',   file: 'product.md',   exists: true  },
//   { name: 'tech',      label: 'Technical', file: 'tech.md',      exists: true  },
//   { name: 'structure', label: 'Structure', file: 'structure.md', exists: false } ]
```

定数 `STEERING_DOCUMENTS`（上の3件の元）と型ガード `isSteeringName('tech') // → true` も export される。本文画面（`steering/[name].vue`）が URL の name の検証に使う。

### `useQuestionChannel`

```ts
// app/pages/strokes/[sessionId]/index.vue の <script setup> — 画面1が今の1問を描く
import { watch } from 'vue'
import { useQuestionChannel } from '~/composables/useQuestionChannel'

const { question } = useQuestionChannel(sessionId) // sessionId は URL の [sessionId]（uuid 文字列）
// question.value → Question | null。W1 /api/strokes/<id>/ws/question の配信で更新される
// 例: { header: '保存先', detail: '…', question: 'どこに保存しますか？', options: [{ label: 'ローカル', … }] }
// 接続直後にも現在の1問が1件届き、以後は最後に届いた1件で上書きされる

watch(question, (q) => {
  if (q) waitingRetry.stopWaiting() // 新しい問いが届いた = AI の応答が決着した合図
})
```

購読だけを持つ。回答の送信まで要るなら `useAgentQuestion` を使う。

### `useProposalChannel`

```ts
// app/composables/useProposalReview.ts — 画面2の本文と名前候補の源
import { computed } from 'vue'
import { useProposalChannel } from '~/composables/useProposalChannel'

const { message } = useProposalChannel(sessionId)
// message.value → ProposalMessage | null。W2 /api/strokes/<id>/ws/proposal の配信で更新される
// 例: { proposal: '# 提案\n\n…（Markdown 全文）', projectName: 'stroke-board' }

const proposal = computed(() => message.value?.proposal ?? '')       // 画面に出す本文
const projectName = computed(() => message.value?.projectName ?? '') // 承認時の名前の初期値
```

最後に届いた1件で上書きされる。差し戻し後に出し直された proposal も同じ経路で届く。

### `useWaitingRetry`

```ts
// app/pages/strokes/[sessionId]/index.vue の <script setup> — 回答送信後の待機
import { watch } from 'vue'
import { useWaitingRetry } from '~/composables/useWaitingRetry'

const waitingRetry = useWaitingRetry(sessionId) // → { waiting, failed, startWaiting, stopWaiting }

await $fetch(`/api/strokes/${sessionId}/invoke-agent`) // AI の起動を要求してから
waitingRetry.startWaiting() // waiting.value = true。3秒おきに GET /api/strokes/<id> を読む
// → invocation が 'failed' なら failed.value = true で止まる。'idle' なら waiting だけ下りる

watch(question, (q) => {
  if (q) waitingRetry.stopWaiting() // 通常は W1 / W2 の配信が先に届き、呼び出し側が止める
})
```

ポーリングは保険で、SSR 中は張らない。`failed` からの回復（同じ入力の再送）はここでは行わず、呼び出し側の役割。

### `useAnnotations`

```ts
// app/composables/useProposalReview.ts — 画面2の差し戻しコメントを積んで送る
import { useAnnotations, defaultHighlightColor } from '~/composables/useAnnotations'

const a = useAnnotations()

a.addSelection('この前提は古い', '保存先は SQLite とする', 120, 135, defaultHighlightColor)
// → comments.value に type: 'selection' の1件が積まれる（引用と文字オフセット 120〜135 付き）
a.addGeneral('全体として、対象読者が書かれていない')
// → type: 'general' の1件が積まれる。空文字・空白だけなら何も積まれない

await $fetch(`/api/strokes/${sessionId}/send-back`, { method: 'POST', body: a.buildPayload() })
// buildPayload() → { response, comments, annotations, nextSteps } の4層 SendBackPayload を送る瞬間に組む
a.clear() // 送れたら積んだコメントを空にする
```

ほかに `update(id, comment, color?)` / `remove(id)`、要約の `summary` / `nextSteps`、定数 `highlightColors`（5色）も export される。

### `useAgentQuestion`

```ts
// app/composables/useProposalReview.ts — 画面2の問い返し（followup）の往復
import { watch } from 'vue'
import { useAgentQuestion } from '~/composables/useAgentQuestion'

const agentQuestion = useAgentQuestion(sessionId)
// → { question, waiting, failed, error, answered, send }。W1 の購読も待機もこの中にある

await agentQuestion.send({ kind: 'option', value: 'ローカルに保存' }) // 選択肢で回答する場合
// → 回答 POST が受理されると answered.value が +1 し、続けて AI の起動を要求して waiting が立つ
// → 失敗しても throw しない。理由は error.value に { title, message } で出る

watch(agentQuestion.error, (reason) => {
  if (reason) warn(reason.title, reason.message) // 例: title = '答えを送れませんでした'
})
```

回答は `{ kind: 'option' | 'free', value: string }`。待機の決着は W1 の次の配信（`question` の更新）で付き、失敗時は同じ問いが残るので送り直せる。状態はすべて返り値で出し、外から渡す口は持たない。

### `useProposalReview`

```ts
// app/pages/strokes/[sessionId]/proposal.vue の <script setup> — 画面2の唯一の呼び出し元
import { useProposalReview } from '~/composables/useProposalReview'

const { data: status } = await useFetch<{ phase: Phase; invocation: Invocation }>(`/api/strokes/${sessionId}`)
const { data: strokesData } = await useFetch<{ strokes: Stroke[] }>(`/api/strokes/${sessionId}/strokes`)

const review = useProposalReview(sessionId, {
  phase: status.value?.phase ?? 'proposed',  // リロード時に U2 で読んだ初期値
  strokes: strokesData.value?.strokes ?? [], // 同じく U3 で読んだ初期値
})
// review.proposal.value → W2 から届いた Markdown 全文。review.phase.value → 'proposed' など

await review.sendBack() // コメント0件なら警告モーダルを出して送らない。送れたら決着まで review.busy が立つ
```

画面2専用。内部で `useAnnotations` / `useProposalChannel` / `useAgentQuestion` / `useWaitingRetry` を束ね、決着ごとに strokes を読み直す。ページは `review` の値と操作（`viewMode` / `approve()` など）を表示に繋ぐだけ。
