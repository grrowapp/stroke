<script setup lang="ts">
/**
 * 上層 — プロジェクト一覧。
 *
 * アクティブが上、未接続が下。未接続は選択できず、キーボードのフォーカスも受けない
 * （specs/project-directory）。
 *
 * 作成は常に押せるただのボタンで、押すとストロークの概要入力へ入る（ADR 0009・0010）。
 * 可否をサーバーに問わない。前提の欠けは概要投稿時の 503 として現れる（既存経路）。
 * 登録は中身が未決のため非活性固定にする。
 *
 * アクティブ / 未接続 / 生成中の区別は、チップの文言と、際立つかどうか（アクティブだけ
 * 灯る）で示す。押せない行は状態の列を残して他の列だけ弱める。いずれも `main.css` が
 * 持ち、ここでは行にクラスを付けるだけ（specs/project/directory）。アイコンと寸法は
 * prototype に合わせる。
 */
import { computed, definePageMeta, navigateTo, ref, refreshNuxtData, useFetch, useHead } from '#imports';

import { useBoardSocket } from '~/composables/useBoardSocket';
import {
  deleteProject,
  fetchPendingApprovals,
  restartSteering,
} from '~/composables/useProjectApi';
import { useRelativeTime } from '~/composables/useRelativeTime';
import { manageAccess } from '#shared/access';
import type { SessionSummary } from '#shared/stroke';
import type { ProjectDirectoryResponse, ProjectSummary } from '#shared/types';

/** 決着の中身。`in-progress` は行が出るだけで決着ではないので、ここには来ない */
type SettledOutcome = 'done' | 'failed';

definePageMeta({ layout: 'portal' });
useHead({ title: 'プロジェクト一覧 — stroke-board' });

/**
 * 一覧の**正はここ1つ**。生成の出来事は WS で届くが、行の中身は運ばれてこない。
 * 届いたら取り直す（design.md D3）。key を固定しているのは、そのためである。
 */
const PROJECTS_KEY = 'projects';

const { data, status } = await useFetch<ProjectDirectoryResponse>('/api/projects', {
  key: PROJECTS_KEY,
});

const directory = computed(() => data.value?.directory);
const projects = computed<ProjectSummary[]>(() =>
  directory.value?.status === 'ok' ? directory.value.projects : [],
);

/**
 * 中断したストローク。
 *
 * **プロジェクトの一覧とは別の母集合である。** 昇格していないセッションはプロジェクトではなく、
 * 走査の母集合にも入らない（specs/project/directory「`.spec-workflow` を持たないディレクトリは
 * 拾わない」）。それでも上層に出すのは、**離れた先から戻れないと「時間を置いて再開する」が
 * 成り立たない**ためである（`docs/specs/architecture/failure.md`「対処の選択肢」）。完全な失敗に
 * 達したセッションは、ここが唯一の戻り道になる。
 */
const STROKES_KEY = 'unfinished-strokes';

const { data: sessionList } = await useFetch<SessionSummary[]>('/api/sessions/unfinished', {
  key: STROKES_KEY,
  default: () => [],
});

/**
 * 昇格前のセッション。昇格した対象はプロジェクトの表に出ているので、ここには来ない
 * （絞るのは endpoint 側。U16）。
 */
const unfinishedStrokes = computed<SessionSummary[]>(() => sessionList.value ?? []);

/** 中断したストロークを開く。行き先は phase が決める（`proposed` 以降は画面2） */
function resumeStroke(session: SessionSummary): void {
  void navigateTo(
    session.phase === 'stroking' ? `/strokes/${session.id}` : `/strokes/${session.id}/proposal`,
  );
}

/** 行に出す状態。`error` は自動では動かないので、そうと分かるように出す */
function strokeStateLabel(session: SessionSummary): string {
  if (session.invocation === 'error') return '失敗（開いて選ぶ）';
  if (session.invocation === 'running') return 'AI が応答中';
  if (session.invocation === 'failed') return 'やり直しています';
  return session.phase === 'proposed' ? 'proposal の確認待ち' : '問いの往復';
}

// 最終更新の相対時刻。mount の後にだけ描く（specs/portal/relative-time）
const relativeTime = useRelativeTime();

/** 作成の入口。ストロークの概要入力へ入る（ADR 0009） */
function startStroke(): void {
  void navigateTo('/strokes');
}

function enter(project: ProjectSummary): void {
  // 生成中の行は `connection` が必ず `disconnected` なので、この1行で
  // まとめて弾かれる。軸を分けた狙いがこれである（design.md D2）
  if (project.connection !== 'active' || project.projectId === null) return;
  // 入場先はプロジェクトの概要。いきなり空の一覧に着くと、繋がっていないのか
  // 中身が無いのかが分からない
  void navigateTo(`/projects/${project.projectId}`);
}

/**
 * 決着の知らせ。
 *
 * **一度に1つしか持たない。** 立て続けに決着したら後のもので置き換える。積むと、面が重なって
 * 「次の操作の邪魔にならない」を満たせなくなる。
 *
 * 流れは 知らせる面 → フェードアウト → 選ばせるモーダル（specs/project/generation）。
 * `noticing` が出ている間は面、引いた後に `choosing` がモーダルを出す。
 */
const noticing = ref<string | null>(null);
const choosing = ref<string | null>(null);
const outcome = ref<SettledOutcome>('done');
const choiceBusy = ref(false);
/** 選んだ操作が失敗したときの一言。モーダルは閉じず、ここに出して選び直させる */
const choiceError = ref<string | null>(null);

function settle(name: string, state: SettledOutcome): void {
  // **選ばせるモーダルが出ている間は割り込ませない。** 「選ぶまで閉じない」（specs/project/
  // generation）を、後から届いた別の決着で破らないため。取り直しは呼び出し側が済ませており、
  // 行の表示はそちらで正しくなる
  if (choosing.value !== null) return;

  outcome.value = state;
  noticing.value = name;
}

/** 知らせる面が引いた。続けてモーダルを出す */
function noticeDone(): void {
  choosing.value = noticing.value;
  noticing.value = null;
}

function closeChoice(): void {
  choosing.value = null;
  choiceBusy.value = false;
  choiceError.value = null;
}

/** 選んだ操作が通らなかった。**モーダルは閉じない**——選び直せないと行き止まりになる */
function failChoice(message: string): void {
  choiceError.value = message;
  choiceBusy.value = false;
}

/** 決着した行。名前で引く。取り直しの後は消えていることもある */
const settled = computed(() => projects.value.find((p) => p.name === choosing.value) ?? null);

/**
 * 成功で「する」を選べるか。
 *
 * `projectId` はサーバーが導出して行に入れている（design.md D13）。registry にも導出にも
 * 乗らない場合は取れないので、そのときは選ばせない（specs/project/generation）。
 */
const canReview = computed(() => settled.value?.projectId != null);

/**
 * 成功で「する」— steering への承認依頼が在れば、開いた状態で表示する。
 *
 * `approvalId` は本家から引く。通知の行から開くとき（承認画面を開くだけ）とは意図的に違える
 * ——通知は対象が1つとは限らないが、生成の完了で開きたい対象は1つだからである。
 *
 * **承認依頼が1件も無いことがある。** 完成の記録は steering が文書を出し終えたことを根拠に
 * しており、承認依頼の有無を見ていない（add-activated-phase・`api/session/activate`）。
 * steering の工程には承認依頼を出す手段が無いので、これは例外ではなく通常の経路である。
 * そのときは承認の一覧まで連れて行く——開けないことより行き止まりが悪い
 * （`project/generation`「決着したら、知らせてから次を選ばせる」）。
 */
async function review(): Promise<void> {
  const projectId = settled.value?.projectId;
  if (projectId == null || choiceBusy.value) return;

  choiceBusy.value = true;
  try {
    const approvals = await fetchPendingApprovals(projectId);
    const approvalId = approvals[0]?.id;
    closeChoice();
    await navigateTo(
      approvalId === undefined
        ? `/projects/${projectId}/approvals`
        : `/projects/${projectId}/approvals/${approvalId}`,
    );
  } catch {
    // 承認依頼を引けないだけなら、承認の一覧まで連れて行く。開けないことより行き止まりが悪い
    closeChoice();
    await navigateTo(`/projects/${projectId}/approvals`);
  }
}

/**
 * 失敗で「やり直す」— steering を起こし直す。
 *
 * 起こす口は U13（AI を起動する唯一の入口）。`reset=1` でリトライ回数を戻してから起こす
 * ——上限に達して `error` で終わっているため、戻さないと即座にまた諦める。
 */
async function retry(): Promise<void> {
  const name = choosing.value;
  if (name === null || choiceBusy.value) return;

  choiceBusy.value = true;
  const failed = await restartSteering(name, settled.value?.workflowRootPath ?? '');
  if (failed !== null) {
    failChoice('起こし直せなかった。もう一度試すか、破棄すること。');
    return;
  }
  closeChoice();
  void refreshNuxtData(PROJECTS_KEY);
}

/** 失敗で「破棄する」— プロジェクトを消して一覧へ戻る。行は消える */
async function discard(): Promise<void> {
  const projectId = settled.value?.projectId;
  if (projectId == null || choiceBusy.value) return;

  choiceBusy.value = true;
  const failed = await deleteProject(projectId);
  if (failed !== null) {
    failChoice('消せなかった。もう一度試すか、やり直すこと。');
    return;
  }
  closeChoice();
  void refreshNuxtData(PROJECTS_KEY);
}

/** 生成中か。まだ入れる中身を持たない */
function unfinished(project: ProjectSummary): boolean {
  return project.creation !== 'done';
}

function rowClass(project: ProjectSummary): string {
  if (project.creation === 'in-progress') return 'sb-row-creating';
  return project.connection === 'active' ? 'sb-row-hit' : 'sb-row-off';
}

function stateLabel(project: ProjectSummary): string {
  if (project.creation === 'in-progress') return '生成中';
  return project.connection === 'active' ? 'アクティブ' : '未接続';
}

/**
 * 「未処理」列。
 *
 * 本家が今返している保留中の承認依頼の件数（サーバーが数えたもの）に、接続後に発生した
 * 通知の件数を足す。前者だけだと接続後のタスクの動きが出ず、後者だけだと接続直後は
 * 必ず0件になる。prototype はアクティブなプロジェクトに最初から件数を出しており、
 * それは通知だけでは説明がつかない。
 */
const { notifications, onProjectCreation, onSnapshot } = useBoardSocket();

/**
 * 生成の出来事が届いたら一覧を取り直す。定期取得はしない
 * （specs/project/generation「生成の進行は、開いている一覧へ届く」）。
 */
onProjectCreation((event) => {
  void refreshNuxtData(PROJECTS_KEY);
  // `in-progress` は行が出るだけで、決着ではない
  if (event.state !== 'in-progress') settle(event.name, event.state);
});

/**
 * 接続の瞬間に届く現在分。切れている間に始まった・終わった生成はここで揃う。
 * **決着の知らせは出さない**——現在分であって、決着の瞬間ではない（design.md D4）。
 */
onSnapshot(() => {
  void refreshNuxtData(PROJECTS_KEY);
});

const notifiedCount = computed(() => {
  const counts = new Map<string, number>();

  for (const notification of notifications.value) {
    counts.set(notification.projectId, (counts.get(notification.projectId) ?? 0) + 1);
  }

  return counts;
});

/** 未接続では本家から取れないので数えられない */
function unread(project: ProjectSummary): number | null {
  if (project.projectId === null || project.pendingApprovals === null) return null;
  return project.pendingApprovals + (notifiedCount.value.get(project.projectId) ?? 0);
}
</script>

<template>
  <section>
    <!--
      決着は2段。知らせる面が自ら引き、その後に選ばせるモーダルが出る
      （specs/project/generation「決着したら、知らせてから次を選ばせる」）。
    -->
    <ProjectCreationNotice :name="noticing" :outcome="outcome" @done="noticeDone" />
    <ProjectCreationChoiceModal
      :name="choosing"
      :outcome="outcome"
      :can-review="canReview"
      :busy="choiceBusy"
      :error="choiceError"
      @review="review"
      @dismiss="closeChoice"
      @retry="retry"
      @discard="discard"
    />

    <div class="mb-3 flex items-center">
      <h1 class="sb-page-title mb-0">プロジェクト</h1>
      <div class="ml-auto flex gap-2">
        <!--
          ユーザー管理への入口。管理者にだけ出す（access/user-management・
          docs/specs/architecture/screen-flow.md）。
        -->
        <Can :ability="manageAccess">
          <NuxtLink to="/admin/users" class="sb-btn" data-testid="user-management-link">
            ユーザー管理
          </NuxtLink>
        </Can>
        <!--
          登録・作成は一覧画面の操作として持つ。独立したメニュー項目にはしない。
          登録は中身が未決のため非活性固定。作成は常に押せる（ADR 0010）。
        -->
        <button
          type="button"
          disabled
          class="sb-btn"
          title="登録が何を指すか（本家への登録なのか、走査対象の親パスを足すのか）が決まっていません。"
          data-testid="register-project"
        >
          <UIcon name="sb:link" class="size-3.5 shrink-0" />
          登録
        </button>
        <button
          type="button"
          class="sb-btn sb-btn-primary"
          data-testid="create-project"
          @click="startStroke"
        >
          <UIcon name="sb:plus" class="size-3.5 shrink-0" />
          作成
        </button>
      </div>
    </div>

    <!--
      中断したストローク。プロジェクトの表とは別の母集合で、昇格前のセッションだけが並ぶ。
      **離れた先から戻れないと「時間を置いて再開する」が成り立たない**ので、上層に置く
      （`docs/specs/architecture/failure.md`「対処の選択肢」）。完全な失敗に達したセッションは
      ここが唯一の戻り道になる。
    -->
    <template v-if="unfinishedStrokes.length > 0">
      <h2 class="sb-page-title mb-3 text-base">中断したストローク</h2>

      <table class="sb-table mb-8" data-testid="strokes-table">
        <thead>
          <tr>
            <!-- 出しているのはセッションの id である。概要の本文は持っていない -->
            <th scope="col">セッション</th>
            <th scope="col" class="w-56">状態</th>
            <th scope="col" class="w-28">最終更新</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="session in unfinishedStrokes"
            :key="session.id"
            class="sb-row-hit"
            data-testid="stroke-row"
            :data-session="session.id"
            :data-invocation="session.invocation"
            @click="resumeStroke(session)"
          >
            <td>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-left hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
                data-testid="stroke-resume"
                @click.stop="resumeStroke(session)"
              >
                <UIcon name="sb:folder" class="size-3.5 shrink-0" />
                {{ session.id }}
              </button>
            </td>
            <td>
              <span class="sb-chip" :class="session.invocation === 'error' ? 'text-error' : ''">
                {{ strokeStateLabel(session) }}
              </span>
            </td>
            <td class="text-[12px]">{{ relativeTime(session.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <p v-if="status === 'pending'" class="sb-placeholder">読み込み中…</p>

    <p
      v-else-if="directory?.status === 'not-configured'"
      class="sb-placeholder"
      data-testid="projects-not-configured"
    >
      監視する親パスが設定されていません。<code>nuxt.config.ts</code> の
      <code>projectShareRoot</code> に、<code>.spec-workflow</code> を持つディレクトリが
      並ぶ親パスを設定してください。
    </p>

    <p
      v-else-if="directory?.status === 'scan-failed'"
      class="sb-placeholder"
      data-testid="projects-scan-failed"
    >
      親パス <code>{{ directory.parentPath }}</code> を読めませんでした（{{ directory.reason }}）。
    </p>

    <p v-else-if="projects.length === 0" class="sb-placeholder" data-testid="projects-empty">
      <code>{{ directory?.status === 'ok' ? directory.parentPath : '' }}</code>
      の直下に <code>.spec-workflow</code> を持つディレクトリがありません。
    </p>

    <template v-else>
      <table class="sb-table" data-testid="projects-table">
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
            :class="rowClass(project)"
            data-testid="project-row"
            :data-connection="project.connection"
            :data-creation="project.creation"
            :data-name="project.name"
            @click="enter(project)"
          >
            <td>
              <!--
                未接続・生成中の行はボタンにしない。押せないだけでなく
                フォーカスも受けないようにする（specs/project/directory のキーボード操作の
                シナリオ）。生成中は `connection` が必ず `disconnected` なので、
                この分岐でまとめて落ちる。
              -->
              <button
                v-if="project.connection === 'active'"
                type="button"
                class="inline-flex items-center gap-1.5 text-left hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
                data-testid="project-enter"
                @click.stop="enter(project)"
              >
                <UIcon name="sb:folder" class="size-3.5 shrink-0" />
                {{ project.name }}
              </button>
              <span
                v-else
                class="inline-flex items-center gap-1.5"
                data-testid="project-name-disabled"
              >
                <!--
                  生成中はフォルダのアイコンを外し、**その位置で**ローダーを回す。行に別部品を
                  増やさない（ui.md）。動きを持つのはここだけで、行そのものは明滅しない。
                -->
                <span
                  v-if="project.creation === 'in-progress'"
                  class="sb-spinner"
                  data-testid="project-creating-spinner"
                  aria-hidden="true"
                />
                <UIcon v-else name="sb:folder" class="size-3.5 shrink-0" />
                {{ project.name }}
              </span>
            </td>
            <td>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="sb-chip"
                  :class="
                    project.creation === 'done' && project.connection === 'active'
                      ? 'sb-chip-on'
                      : ''
                  "
                >
                  {{ stateLabel(project) }}
                </span>
              </span>
            </td>
            <!--
              生成中は通知を持ちようがなく、`.spec-workflow` も無い。取れないことが
              分かる表示にして、承認の時刻などで埋めない（specs/project/directory）。
              いずれも値が null なので、既存の分岐がそのまま「—」を出す。
            -->
            <td data-testid="project-unread">
              <span v-if="(unread(project) ?? 0) > 0" class="sb-badge">{{ unread(project) }}</span>
              <span v-else class="text-[var(--text-muted)]">—</span>
            </td>
            <!--
              文字色はここで指定しない。行の状態によって沈めるのを `main.css` が持つため、
              ユーティリティで色を当てると持ち主が2人になり、後勝ちで沈まなくなる。
            -->
            <td class="text-[12px]" data-testid="project-last-modified">
              {{ project.lastModified === null ? '—' : relativeTime(project.lastModified) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p class="mt-2 text-[12px] text-[var(--text-secondary)]">
        未接続 = MCP サーバーが繋がっていない。選択できない。
        <span v-if="projects.some(unfinished)">
          生成中 = 承認したプロジェクトをまだ作っている途中。まだ入れない。
        </span>
      </p>
    </template>

    <p
      v-if="directory?.status === 'ok' && !directory.registryReadable"
      class="mt-2 text-[12px] text-[var(--text-muted)]"
      data-testid="registry-unreadable"
    >
      本家のプロジェクト登録簿を読めませんでした。すべて未接続として表示しています。
    </p>
  </section>
</template>
