<script setup lang="ts">
/**
 * ユーザー管理（`/admin/users`・`access/user-management`）。
 *
 * 利用者（メールアドレス）ごとの行で、見せるプロジェクトを選ぶ。同じ画面で、管理者に指名する
 * メールアドレスと、token の無い接続を管理者として通す接続元ネットワーク・ホスト名を編集する。
 * 保存すると `access.json` を置き換え、その後のリクエストから判定に使われる。
 *
 * 管理者でなければこの URL は 404 になる（`app/middleware/access.global.ts`）。
 */
import { computed, ref, useFetch, watch } from '#imports';

import type { AccessSettingsDto, AdminEntriesDto } from '#shared/access';
import type { ProjectDirectoryResponse } from '#shared/types';

const { data: settings, refresh } = await useFetch<AccessSettingsDto>('/api/access');
const { data: directory } = await useFetch<ProjectDirectoryResponse>('/api/projects');

/** 選べるプロジェクト。プロジェクト一覧に現れるもの */
const projectNames = computed(() =>
  directory.value?.directory.status === 'ok' ? directory.value.directory.projects.map((p) => p.name) : [],
);

/** 編集中の写し。保存するまでサーバーの登録は変えない */
const users = ref<Record<string, string[]>>({});
const admins = ref<AdminEntriesDto>({ emails: [], networks: [], hosts: [] });

watch(
  settings,
  (value) => {
    if (!value) return;
    users.value = structuredClone(value.users);
    admins.value = structuredClone(value.admins);
  },
  { immediate: true },
);

const emails = computed(() => Object.keys(users.value).sort());

const newUser = ref('');
const saving = ref(false);
const message = ref<string | null>(null);
const failed = ref(false);

function addUser(): void {
  const email = newUser.value.trim().toLowerCase();
  if (!email || email in users.value) return;
  users.value = { ...users.value, [email]: [] };
  newUser.value = '';
}

function removeUser(email: string): void {
  const { [email]: _removed, ...rest } = users.value;
  users.value = rest;
}

function toggleProject(email: string, project: string, on: boolean): void {
  const current = users.value[email] ?? [];
  users.value = {
    ...users.value,
    [email]: on ? [...current, project] : current.filter((name) => name !== project),
  };
}

/** 管理者の登録の3つの欄。見出しと入力の例だけが違う */
const adminFields: { key: keyof AdminEntriesDto; label: string; placeholder: string }[] = [
  { key: 'emails', label: '管理者に指名するメールアドレス', placeholder: 'lead@example.com' },
  { key: 'networks', label: '管理者として通す接続元ネットワーク（token が無い接続）', placeholder: '192.168.1.0/24' },
  { key: 'hosts', label: '管理者として通すホスト名（token が無い接続）', placeholder: 'xxx.grrow.app' },
];

const newAdmin = ref<Record<keyof AdminEntriesDto, string>>({ emails: '', networks: '', hosts: '' });

function addAdmin(key: keyof AdminEntriesDto): void {
  const value = newAdmin.value[key].trim();
  if (!value || admins.value[key].includes(value)) return;
  admins.value = { ...admins.value, [key]: [...admins.value[key], value] };
  newAdmin.value[key] = '';
}

function removeAdmin(key: keyof AdminEntriesDto, value: string): void {
  admins.value = { ...admins.value, [key]: admins.value[key].filter((entry) => entry !== value) };
}

async function save(): Promise<void> {
  saving.value = true;
  message.value = null;
  try {
    await $fetch('/api/access', { method: 'PUT', body: { users: users.value, admins: admins.value } });
    await refresh();
    failed.value = false;
    message.value = '保存した。';
  } catch (error) {
    failed.value = true;
    message.value = `保存できなかった: ${(error as { data?: { message?: string } }).data?.message ?? String(error)}`;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section data-testid="user-management">
    <div class="mb-3 flex items-center">
      <h1 class="sb-page-title mb-0">ユーザー管理</h1>
      <div class="ml-auto flex items-center gap-2">
        <span
          v-if="message"
          class="text-[12px]"
          :class="failed ? 'text-error' : 'text-[var(--text-secondary)]'"
          data-testid="access-save-message"
        >
          {{ message }}
        </span>
        <button
          type="button"
          class="sb-btn sb-btn-primary"
          :disabled="saving"
          data-testid="access-save"
          @click="save"
        >
          保存
        </button>
      </div>
    </div>

    <h2 class="sb-page-title mb-3 text-base">利用者</h2>

    <form class="mb-3 flex gap-2" @submit.prevent="addUser">
      <UInput v-model="newUser" type="email" placeholder="guest@example.com" data-testid="user-new-email" />
      <button type="submit" class="sb-btn" data-testid="user-add">追加</button>
    </form>

    <p v-if="emails.length === 0" class="sb-placeholder mb-8" data-testid="users-empty">
      登録された利用者はいない。
    </p>

    <table v-else class="sb-table mb-8" data-testid="users-table">
      <thead>
        <tr>
          <th scope="col" class="w-64">メールアドレス</th>
          <th scope="col">見せるプロジェクト</th>
          <th scope="col" class="w-20" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="email in emails" :key="email" data-testid="user-row" :data-email="email">
          <td>{{ email }}</td>
          <td>
            <span v-if="projectNames.length === 0" class="text-[var(--text-muted)]">—</span>
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <UCheckbox
                v-for="project in projectNames"
                :key="project"
                :label="project"
                :model-value="users[email]?.includes(project) ?? false"
                :data-project="project"
                data-testid="user-project"
                @update:model-value="(on: boolean | 'indeterminate') => toggleProject(email, project, on === true)"
              />
            </div>
          </td>
          <td>
            <button type="button" class="sb-btn" data-testid="user-remove" @click="removeUser(email)">削除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <h2 class="sb-page-title mb-3 text-base">管理者</h2>

    <div v-for="field in adminFields" :key="field.key" class="mb-6" :data-testid="`admin-${field.key}`">
      <h3 class="mb-2 text-[12px] text-[var(--text-secondary)]">{{ field.label }}</h3>
      <form class="mb-2 flex gap-2" @submit.prevent="addAdmin(field.key)">
        <UInput v-model="newAdmin[field.key]" :placeholder="field.placeholder" data-testid="admin-new" />
        <button type="submit" class="sb-btn" data-testid="admin-add">追加</button>
      </form>
      <div class="flex flex-wrap gap-2">
        <span v-if="admins[field.key].length === 0" class="text-[var(--text-muted)]">—</span>
        <span
          v-for="entry in admins[field.key]"
          :key="entry"
          class="sb-chip inline-flex items-center gap-1.5"
          data-testid="admin-entry"
        >
          {{ entry }}
          <button
            type="button"
            :aria-label="`${entry} を外す`"
            data-testid="admin-remove"
            @click="removeAdmin(field.key, entry)"
          >
            ×
          </button>
        </span>
      </div>
    </div>
  </section>
</template>
