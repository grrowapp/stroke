<script setup lang="ts">
/** 下層 — ステアリング文書の本文。URL でこの1本を直接指せる */
import { computed, createError, definePageMeta, useRoute } from '#imports';

import DocumentView from '~/components/workspace/DocumentView.vue';
import { useProjectId, useSteeringDocument } from '~/composables/useProjectApi';
import { isSteeringName } from '~/composables/useSteeringDocuments';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const name = computed(() => String(route.params.name ?? ''));

if (!isSteeringName(name.value)) {
  // ステアリングは product / tech / structure の3本だけ
  throw createError({ statusCode: 404, statusMessage: 'unknown-steering-document' });
}

const { data } = await useSteeringDocument(projectId, name);
</script>

<template>
  <section>
    <h1 class="sb-page-title font-mono">{{ name }}.md</h1>
    <DocumentView
      :content="data?.content"
      missing="このステアリング文書はまだ作られていません。"
    />
  </section>
</template>
