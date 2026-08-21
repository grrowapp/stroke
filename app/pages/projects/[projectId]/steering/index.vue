<script setup lang="ts">
/** 下層 — ステアリングの一覧。本家は常に3本で、一覧 API は無い */
import { computed, definePageMeta } from '#imports';

import RecordList from '~/components/workspace/RecordList.vue';
import { useProjectId, useProjectInfo } from '~/composables/useProjectApi';
import { useSteeringEntries } from '~/composables/useSteeringDocuments';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data: info } = await useProjectInfo(projectId);
const entries = useSteeringEntries(info);

const items = computed(() =>
  entries.value.map((entry) => ({
    key: entry.name,
    label: entry.label,
    chip: entry.exists ? 'あり' : '未作成',
    // 未作成の文書へはリンクを張らない
    to: entry.exists ? `/projects/${projectId.value}/steering/${entry.name}` : undefined,
  })),
);
</script>

<template>
  <section>
    <h1 class="sb-page-title">ステアリング</h1>
    <RecordList :items="items" testid="steering-list" />
  </section>
</template>
