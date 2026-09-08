<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — 使い捨て。決まったら丸ごと消す。本番ルートではない。
 *
 * change `show-pending-project-in-list` の tasks 8.x。
 *
 * 生成中の行の地を、オフラインの行の色を起点に RGB と透過のスライダーで詰める。
 * 一覧は本物（`GET /api/projects`）で、生成中と失敗の行は実物が無ければダミーを足す。
 *
 * 祝いの案は `?variant=a|b|c` で切り替える（下部のバー、または ← →）。
 */
import { computed, definePageMeta, useFetch, useHead, useRoute } from '#imports';
import { ref } from 'vue';

import { formatRelativeTime } from '~/composables/useRelativeTime';
import type { ProjectCreationOutcome, ProjectDirectoryResponse, ProjectSummary } from '#shared/types';

definePageMeta({ layout: 'portal' });
useHead({ title: 'PROTOTYPE 一覧 — stroke-board' });

const VARIANTS = [
  { key: 'a', name: '中央に浮く帯 / 失敗は静かに落とす' },
  { key: 'b', name: '一覧の頭に差し込む帯 / 失敗は赤い柱' },
  { key: 'c', name: '上端のリボン＋行が光る / 失敗は警告色＋理由' },
] as const;

const route = useRoute();
const variant = computed(() => String(route.query.variant ?? 'a'));

const { data } = await useFetch<ProjectDirectoryResponse>('/api/projects', {
  key: 'prototype-projects',
});

const directory = computed(() => data.value?.directory);
const real = computed<ProjectSummary[]>(() =>
  directory.value?.status === 'ok' ? directory.value.projects : [],
);

function fake(name: string, creation: ProjectCreationOutcome): ProjectSummary {
  return {
    name,
    workflowRootPath: `/opt/projects/${name}`,
    connection: 'disconnected',
    creation: creation === 'failed' ? 'in-progress' : creation,
    projectId: null,
    pid: null,
    lastModified: null,
    pendingApprovals: null,
  };
}

const projects = computed<ProjectSummary[]>(() => {
  const missing: ProjectSummary[] = [];
  if (!real.value.some((p) => p.creation === 'in-progress')) {
    missing.push(fake('pt-generating', 'in-progress'));
  }
  missing.push(fake('pt-broken', 'failed'));
  return [...real.value, ...missing];
});

/**
 * 起点は**今のオフラインの行の色**（実測）。
 * `--surface-panel` #1e293b を 0.45 で `--surface-base` #0f172a に敷いた合成が #161f32。
 */
const r = ref(22);
const g = ref(31);
const b = ref(50);
const alpha = ref(1);
/** 中身の濃さ。オフラインは 0.45 なので、それより薄い 0.32 を初期値にする */
const ink = ref(1);
/** ピントの外し具合。0 だと輪郭が立ったままで「薄いだけ」になる */
const blur = ref(0);

const OFFLINE = { r: 22, g: 31, b: 50 };

/** アクティブの灯り方。形は基本形のまま、光らせ方だけが違う */
const LAMPS = [
  { key: 1, name: '今の案 — にじみ2枚 ＋ 上の照り ＋ 文字の発光' },
  { key: 2, name: 'にじみだけ — 照りも文字の発光も無し' },
  { key: 3, name: '照りだけ — ガラスの艶。外へ光を漏らさない' },
  { key: 4, name: '内側から光る — 中心が明るく、縁へ落ちる' },
  { key: 5, name: '縁だけ光る — 面は暗いまま（ネオン管）' },
  { key: 6, name: '塗りつぶし — ランプではなく「点いている」札' },
] as const;

/** オフラインの行の上に重ねる白の濃さ。0 が素のオフライン */
const VEILS = [0, 0.02, 0.04, 0.06, 0.09, 0.12, 0.16, 0.22, 0.3] as const;

const tuned = computed(() => `rgba(${r.value}, ${g.value}, ${b.value}, ${alpha.value})`);
const tunedHex = computed(
  () =>
    '#' +
    [r.value, g.value, b.value].map((v) => v.toString(16).padStart(2, '0')).join(''),
);
const rowStyle = computed(() => ({
  '--pt-bg': tuned.value,
  '--pt-ink': String(ink.value),
  '--pt-blur': `${blur.value}px`,
}));

function reset(): void {
  r.value = OFFLINE.r;
  g.value = OFFLINE.g;
  b.value = OFFLINE.b;
  alpha.value = 1;
  ink.value = 1;
  blur.value = 0;
}

/** 未接続の見え方。「消えているランプ」に寄せた3案 ＋ 今までの無彩色 */
const QUIETS = [
  { key: 'pt-chip-knob', name: 'スライダーで調整' },
  { key: 'pt-chip-cool', name: '青みのガラス' },
  { key: 'pt-chip-ghost', name: '緑をわずかに残したガラス（消えたランプ）' },
  { key: 'pt-chip-clear', name: 'さらに透かす（面をほぼ抜く）' },
  { key: 'pt-chip-dark', name: '無彩色（今までの OFF っぽいやつ）' },
] as const;
const quiet = ref<string>('pt-chip-knob');

/** 未接続チップのツマミ */
const hue = ref(200);
const fill = ref(12);
const edge = ref(30);
const txt = ref(90);
/** チップの幅。揃えるか、文言ぶんの自然幅か */
const width = ref<string>('76');

const celebrating = ref<string | null>(null);
const flashing = ref<string | null>(null);

function fire(): void {
  const target = projects.value.find((p) => p.creation === 'in-progress')?.name ?? 'pt-generating';
  celebrating.value = target;
  if (variant.value === 'c') {
    flashing.value = target;
    setTimeout(() => (flashing.value = null), 1_800);
  }
}

function rowClass(project: ProjectSummary): string {
  if (project.name === 'pt-broken') return `pt-fail-${variant.value}`;
  if (project.creation === 'in-progress') return 'pt-tuned';
  // 未接続の行は 45% を行ごとに掛けない。掛けるとチップの色まで潰れる
  return project.connection === 'active' ? 'sb-row-hit' : 'sb-row-off-ink';
}

/**
 * チップの見え方。形は全状態で共通。
 *
 * **灯るのはアクティブだけ。** 灯り＝生きている、という読みにする。生成中・失敗・未接続は
 * 同じガラスのまま消えていて、色だけが違う。灯りを配ると、まだ何もしていない失敗が
 * 一覧でいちばん強く光ることになる。
 */
function chipClass(project: ProjectSummary): string[] {
  if (project.name === 'pt-broken') return ['pt-chip-failed', 'pt-chip-dark'];
  // 生成中のチップは未接続と同じ作りにする。中にローダーが入るだけ
  if (project.creation === 'in-progress') return ['pt-chip-offline', quiet.value];
  if (project.connection === 'active') return ['pt-chip-active', 'pt-chip-lit'];
  // 未接続だけはガラスを外す。8行並んでも浮かないように
  return ['pt-chip-offline', quiet.value];
}

function stateLabel(project: ProjectSummary): string {
  if (project.name === 'pt-broken') return '作成に失敗';
  if (project.creation === 'in-progress') return '生成中';
  return project.connection === 'active' ? 'アクティブ' : '未接続';
}
</script>

<template>
  <section>
    <PrototypeRowStyles :variant="variant" />
    <PrototypeCelebrationA v-if="variant === 'a'" :name="celebrating" @done="celebrating = null" />
    <PrototypeCelebrationB v-if="variant === 'b'" :name="celebrating" @done="celebrating = null" />
    <PrototypeCelebrationC v-if="variant === 'c'" :name="celebrating" @done="celebrating = null" />

    <div class="pt-panel">
      <strong>生成中の行の地</strong>
      <label>R<input v-model.number="r" type="range" min="0" max="255" /><output>{{ r }}</output></label>
      <label>G<input v-model.number="g" type="range" min="0" max="255" /><output>{{ g }}</output></label>
      <label>B<input v-model.number="b" type="range" min="0" max="255" /><output>{{ b }}</output></label>
      <label>
        透過<input v-model.number="alpha" type="range" min="0" max="1" step="0.01" />
        <output>{{ alpha.toFixed(2) }}</output>
      </label>
      <label>
        文字<input v-model.number="ink" type="range" min="0" max="1" step="0.01" />
        <output>{{ ink.toFixed(2) }}</output>
      </label>
      <label>
        ボケ<input v-model.number="blur" type="range" min="0" max="6" step="0.1" />
        <output>{{ blur.toFixed(2) }}px</output>
      </label>
      <span class="pt-swatch-chip" :style="{ background: tuned }" />
      <code>{{ tunedHex }} / {{ tuned }}</code>
      <button type="button" @click="reset">オフラインに戻す</button>
      <label>
        未接続
        <select v-model="quiet">
          <option v-for="q in QUIETS" :key="q.key" :value="q.key">{{ q.name }}</option>
        </select>
      </label>
      <label>
        幅
        <select v-model="width">
          <option value="76">揃える（76px）</option>
          <option value="0">自然幅（文言ぶん）</option>
        </select>
      </label>
    </div>
    <div class="pt-panel">
      <strong>未接続チップ</strong>
      <label>色相<input v-model.number="hue" type="range" min="0" max="360" /><output>{{ hue }}</output></label>
      <label>面<input v-model.number="fill" type="range" min="0" max="40" /><output>{{ fill }}</output></label>
      <label>枠<input v-model.number="edge" type="range" min="0" max="80" /><output>{{ edge }}</output></label>
      <label>文字<input v-model.number="txt" type="range" min="0" max="100" /><output>{{ txt }}</output></label>
      <span class="pt-lab-label">「未接続」を「スライダーで調整」にしたときだけ効きます</span>
    </div>
    <p class="pt-lab-label mb-3 block">
      起点はオフラインの行の実測値 <code>#161f32</code> = rgb(22, 31, 50)。文字はオフライン（0.45）より薄い 0.32。
      下の一覧の <strong>生成中の行</strong>に即反映します。上下の未接続の行と見比べてください。
    </p>

    <div class="mb-3 flex items-center">
      <h1 class="sb-page-title mb-0">プロジェクト</h1>
      <div class="ml-auto flex gap-2">
        <button type="button" class="sb-btn" @click="fire">完了を起こす 🎉</button>
      </div>
    </div>

    <table
      class="sb-table"
      :style="{
        '--pt-chip-w': `${width}px`,
        '--pt-hue': String(hue),
        '--pt-fill': String(fill),
        '--pt-edge': String(edge),
        '--pt-txt': String(txt),
      }"
    >
      <thead>
        <tr>
          <th scope="col">プロジェクト</th>
          <th scope="col" class="w-56">状態</th>
          <th scope="col" class="w-32">未処理の通知</th>
          <th scope="col" class="w-28">最終更新</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="project in projects"
          :key="project.workflowRootPath"
          :class="[rowClass(project), flashing === project.name ? 'pt-row-flash' : '']"
          :style="project.creation === 'in-progress' ? rowStyle : undefined"
          :data-name="project.name"
          :data-creation="project.creation"
        >
          <td>
            <span class="inline-flex items-center gap-1.5">
              <!-- 生成中はフォルダアイコンを外す。インデントは他の行と揃える -->
              <span v-if="project.creation === 'in-progress'" class="pt-indent" />
              <UIcon v-else name="sb:folder" class="size-3.5 shrink-0" />
              {{ project.name }}
            </span>
          </td>
          <td>
            <span class="inline-flex items-center gap-1.5">
              <!--
                4状態とも同じガラスの形。灯っているかどうかだけが違う。
                スピナーはチップの**中**に入れる。外に置くとその行のチップだけ右へ
                押し出されて、左端が揃わない。
              -->
              <span class="sb-chip pt-chip-flex pt-chip-glass" :class="chipClass(project)">
                <span
                  v-if="project.creation === 'in-progress'"
                  class="sb-spinner pt-spinner-in-chip"
                  aria-hidden="true"
                />
                {{ stateLabel(project) }}
              </span>
              <span v-if="project.pid !== null" class="text-[12px] text-[var(--text-secondary)]">
                PID {{ project.pid }}
              </span>
            </span>
          </td>
          <td>
            <span v-if="(project.pendingApprovals ?? 0) > 0" class="sb-badge">
              {{ project.pendingApprovals }}
            </span>
            <span v-else class="text-[var(--text-muted)]">—</span>
          </td>
          <td class="text-[12px] text-[var(--text-secondary)]">
            {{ project.lastModified === null ? '—' : formatRelativeTime(project.lastModified) }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- アクティブの灯り方だけを並べる。形は基本形のまま -->
    <h2 class="sb-page-title mt-8 mb-1 text-[15px]">アクティブの灯り方</h2>
    <p class="pt-lab-label mb-2 block">
      大きさ・角丸・余白・枠は基本形のまま。光らせ方だけが違う。右に未接続を並べてある。
    </p>
    <table class="sb-table">
      <tbody>
        <tr v-for="lamp in LAMPS" :key="lamp.key">
          <td class="w-56">
            <span
              class="sb-chip pt-chip-flex pt-chip-glass pt-chip-active"
              :class="lamp.key === 1 ? 'pt-chip-lit' : `pt-lamp-${lamp.key}`"
            >
              アクティブ
            </span>
          </td>
          <td class="w-56">
            <span class="sb-chip pt-chip-flex pt-chip-glass pt-chip-offline pt-chip-dark">
              未接続
            </span>
          </td>
          <td class="text-[12px] text-[var(--text-secondary)]">{{ lamp.key }}. {{ lamp.name }}</td>
        </tr>
      </tbody>
    </table>

    <!-- オフラインの行に白を透過で1枚かぶせる。段階を並べる -->
    <h2 class="sb-page-title mt-8 mb-1 text-[15px]">オフラインの行 ＋ 白を1枚（透過）</h2>
    <p class="pt-lab-label mb-2 block">
      地を作り替えず、オフラインの行の上に白を重ねている。文字にも一緒にかかる。
      先頭が 0（＝素のオフライン）。
    </p>
    <table class="sb-table">
      <tbody>
        <tr
          v-for="v in VEILS"
          :key="v"
          class="pt-veil"
          :style="{ '--pt-veil': String(v) }"
          :data-veil="v"
        >
          <td>
            <span class="inline-flex items-center gap-1.5">
              <UIcon name="sb:folder" class="size-3.5 shrink-0" />new-app
            </span>
          </td>
          <td class="w-56">
            <span class="inline-flex items-center gap-1.5">
              <span class="sb-spinner" aria-hidden="true" />
              <span class="sb-chip">生成中</span>
            </span>
          </td>
          <td class="w-32"><span class="text-[var(--text-muted)]">—</span></td>
          <td class="w-28 text-[12px] text-[var(--text-secondary)]">白 {{ v }}</td>
        </tr>
      </tbody>
    </table>

    <PrototypeVariantSwitcher :variants="VARIANTS" />
  </section>
</template>
