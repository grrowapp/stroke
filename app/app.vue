<script setup lang="ts">
import { useHead } from '#imports';

import NotificationToaster from '~/components/shared/NotificationToaster.vue';

useHead({ title: 'stroke-board', htmlAttrs: { lang: 'ja' } });
</script>

<template>
  <!-- トーストは本家と同じ右上（specs/notification-toast）。@nuxt/ui の既定は右下 -->
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!--
      上層でも下層でも出る。画面遷移で消えない位置に置く。
      要素は出さないが、`useBoardSocket`（createSharedComposable）の購読をここで
      保ち続けるので、外すと接続が切れる（design.md 決定1）
    -->
    <NotificationToaster />
  </UApp>
</template>
