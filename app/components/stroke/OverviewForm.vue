<script setup lang="ts">
// 概要の入力欄。ストロークの起点。
// 空のまま投稿してもセッションは作らせず、入力が必要である旨だけ出す。
const emit = defineEmits<{ submit: [overview: string] }>()

const overview = ref('')
const notice = ref('')
const selectedFile = ref<File | null>(null)

const ACCEPTED_EXTENSIONS = ['.txt', '.md']

async function onFileChange(file: File | null) {
  if (!file) return

  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  )
  if (!hasAcceptedExtension) {
    notice.value = '.txt または .md のファイルのみ読み込めます。'
    selectedFile.value = null
    return
  }

  overview.value = await file.text()
  notice.value = ''
}

watch(selectedFile, onFileChange)

function submit() {
  const value = overview.value.trim()
  if (!value) {
    notice.value = '概要を入力してください。'
    return
  }
  notice.value = ''
  emit('submit', value)
}
</script>

<template>
  <div>
    <p class="mb-3 text-xs tracking-widest text-muted uppercase">概要</p>
    <h1 class="mb-6 text-2xl leading-snug font-semibold">作りたいシステムを書く</h1>

    <UTextarea
      v-model="overview"
      :rows="6"
      class="w-full"
      placeholder="どんなシステムを作りたいか、いまの言葉で書く"
    />

    <UFileUpload
      v-model="selectedFile"
      accept=".txt,.md"
      label="ローカルファイルから読み込む"
      description=".txt / .md ファイルを選択すると、内容で概要欄を置き換えます"
      class="mt-4"
    />

    <p v-if="notice" class="mt-2 text-sm text-error">{{ notice }}</p>

    <UButton class="mt-6" size="lg" @click="submit">投稿</UButton>
  </div>
</template>
