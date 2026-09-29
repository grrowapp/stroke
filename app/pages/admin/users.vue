<script setup lang="ts">
// ユーザー管理（`docs/specs/architecture/screen-flow.md`）。管理者でなければ 404
// （`app/middleware/access.global.ts`）。画面の実体は `components/page/User/List/Container.vue`。

definePageMeta({ layout: 'portal' })
useHead({ title: 'ユーザー管理 — stroke-board' })
</script>

<template>
  <Suspense>
    <PageUserListContainer />
  </Suspense>
</template>
