<script setup lang="ts">
/**
 * 決着の後に次を選ばせるモーダル（specs/project/generation「決着したら、知らせてから次を選ばせる」）。
 *
 * **知らせる面が引いた後に出る。** あちらは自ら消えるが、こちらは**ユーザーが選ぶまで閉じない**。
 * 決着は「見た」だけでは終わらず、次を選ぶところまでが1つの出来事だからである。
 *
 * | | 問い | 選択肢 |
 * |---|---|---|
 * | 成功 | ステアリングの結果をレビューするか | する / しない |
 * | 失敗 | どうするか | やり直す / 破棄する |
 *
 * 画面遷移はしない。プロジェクト一覧の上で完結する。
 */
const props = defineProps<{
  /** 対象のプロジェクト名。null の間は出ない */
  name: string | null;
  /** 決着の中身 */
  outcome: 'done' | 'failed';
  /** 成功で「する」を選べるか。`projectId` が取れないときは選ばせない */
  canReview: boolean;
  /** 選択の処理中。二重に押させない */
  busy: boolean;
  /** 選んだ操作が通らなかったときの一言。**モーダルは閉じない**——選び直せるようにする */
  error?: string | null;
}>();

const emit = defineEmits<{
  review: [];
  dismiss: [];
  retry: [];
  discard: [];
}>();
</script>

<template>
  <div v-if="props.name !== null" class="sb-choice-backdrop">
    <div
      class="sb-choice"
      role="dialog"
      aria-modal="true"
      :aria-label="props.outcome === 'done' ? '作成の完了' : '作成の失敗'"
      data-testid="project-creation-choice"
      :data-outcome="props.outcome"
    >
      <template v-if="props.outcome === 'done'">
        <p class="sb-choice-title">ステアリングの結果をレビューしますか？</p>
        <p class="sb-choice-note">
          <!--
            承認依頼が1件も無いまま完成することがある。完成の記録は steering が文書を出し
            終えたことを根拠にしており、承認依頼の有無を見ていない（add-activated-phase）。
            「開いた状態で表示します」と断言すると、その経路で嘘になる
            （`projects/index.vue` の `review()` は対象が無ければ承認の一覧へ落とす）。
          -->
          {{ props.canReview ? '承認画面へ移ります。対象があれば開いた状態で表示します。' : '承認画面を開けません。' }}
        </p>
        <p v-if="props.error" class="sb-choice-error" data-testid="project-creation-error">
          {{ props.error }}
        </p>
        <div class="sb-choice-actions">
          <button
            type="button"
            class="sb-choice-primary"
            :disabled="!props.canReview || props.busy"
            data-testid="project-creation-review"
            @click="emit('review')"
          >
            する
          </button>
          <button
            type="button"
            class="sb-choice-secondary"
            :disabled="props.busy"
            data-testid="project-creation-dismiss"
            @click="emit('dismiss')"
          >
            しない
          </button>
        </div>
      </template>

      <template v-else>
        <p class="sb-choice-title">プロジェクト {{ props.name }} をどうしますか？</p>
        <p class="sb-choice-note">やり直すと、もう一度ステアリングを起こします。</p>
        <p v-if="props.error" class="sb-choice-error" data-testid="project-creation-error">
          {{ props.error }}
        </p>
        <div class="sb-choice-actions">
          <button
            type="button"
            class="sb-choice-primary"
            :disabled="props.busy"
            data-testid="project-creation-retry"
            @click="emit('retry')"
          >
            やり直す
          </button>
          <button
            type="button"
            class="sb-choice-danger"
            :disabled="props.busy"
            data-testid="project-creation-discard"
            @click="emit('discard')"
          >
            破棄する
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
