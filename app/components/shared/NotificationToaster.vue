<script setup lang="ts">
/**
 * 通知トースト。本家 spec-workflow-mcp と同じ形にする（specs/notification-toast）。
 *
 * 右上固定・縦積み・5秒で自動消滅・× で手動消滅・1行テキスト・押しても何も起きない。
 * 対象を開く導線は通知一覧に一本化してあるので、ここからは進ませない。
 * 音は鳴らさない（design.md 決定13）。
 *
 * 描画は @nuxt/ui が持つ。`app.vue` の `<UApp :toaster>` が `UToaster` を出し、ここは
 * `onNotification` → トーストの変換だけを持つ（design.md 決定8）。tone → 本家の色クラスの
 * 対応と `toast.add()` の組み立ては `useUpstreamToast` に在る——承認への応答の結果も同じ
 * 見た目で出すため、そちらへ抜き出した（change `update-ui-approval-review`）。
 *
 * **この component を `app.vue` 直下から外さないこと。** `useBoardSocket` は
 * `createSharedComposable`（参照カウント式）で、ここの常駐購読が消えると接続ごと
 * 捨てられる（design.md 決定1）。markup を持たなくなっても置き場としては残る。
 */
import { useBoardSocket } from '~/composables/useBoardSocket';
import { useUpstreamToast } from '~/composables/useUpstreamToast';

const { show } = useUpstreamToast();
const { onNotification } = useBoardSocket();

onNotification((notification) => {
  // 題は `projectName: 件名`、× のラベルは件名だけ（toast.spec が見る形）
  show(`${notification.projectName}: ${notification.title}`, notification.tone, notification.title);
});
</script>

<template>
  <!--
    描画は `app.vue` の `<UApp :toaster>` が持つ。ここは常駐して購読を保つためだけに置く
    （design.md 決定1）。要素を出さないことがこの component の正しい姿。
  -->
</template>
