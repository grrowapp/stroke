<script setup lang="ts">
import { useHead } from '#imports';

import NotificationToaster from '~/components/notification/NotificationToaster.vue';

useHead({ title: 'stroke-board', htmlAttrs: { lang: 'ja' } });
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- 上層でも下層でも出る。画面遷移で消えない位置に置く -->
    <NotificationToaster />
  </UApp>
</template>
