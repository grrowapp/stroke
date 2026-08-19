<script setup lang="ts">
// 本文へのコメントを付ける / 直すモーダル。選んだ箇所を引用として見せ、
// 本文上で目立たせる色を5色から選ばせる。
import type { HighlightColor } from '#shared/types'
import { defaultHighlightColor, highlightColors } from '~/composables/useAnnotations'

const props = defineProps<{
  selectedText: string
  initialComment?: string
  initialColor?: HighlightColor
  isEditing?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ save: [comment: string, color: HighlightColor] }>()

const body = ref('')
const color = ref<HighlightColor>(defaultHighlightColor)

watch(open, (v) => {
  if (!v) return
  body.value = props.initialComment ?? ''
  color.value = props.initialColor ?? defaultHighlightColor
})

function save(): void {
  if (!body.value.trim()) return
  emit('save', body.value, color.value)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="isEditing ? 'コメントを編集' : 'この箇所にコメント'">
    <template #body>
      <p class="mb-2 text-xs font-medium tracking-wide text-muted">選んだ箇所</p>
      <pre
        class="mb-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-3 font-mono text-xs"
        :style="{ backgroundColor: color.bg, borderColor: color.border }"
      >{{ selectedText }}</pre>

      <p class="mb-2 text-xs font-medium tracking-wide text-muted">ハイライトの色</p>
      <div class="mb-4 flex gap-2">
        <button
          v-for="c in highlightColors"
          :key="c.name"
          type="button"
          class="h-7 w-7 rounded-full border-2 transition"
          :style="{ backgroundColor: c.bg, borderColor: color.name === c.name ? c.border : 'transparent' }"
          :aria-label="c.name"
          @click="color = c"
        />
      </div>

      <UTextarea v-model="body" :rows="4" class="w-full" placeholder="どう直してほしいか" autofocus />
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="open = false">やめる</UButton>
      <UButton :disabled="!body.trim()" @click="save">{{ isEditing ? '更新' : '付ける' }}</UButton>
    </template>
  </UModal>
</template>
