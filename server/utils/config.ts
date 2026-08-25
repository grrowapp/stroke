/**
 * 本家に触るために要る3つの設定を読む唯一の場所。
 *
 * `upstreamBaseUrl` / `specWorkflowHome` / `syncIntervalMs` は環境変数から入る
 * （`NUXT_UPSTREAM_BASE_URL` / `NUXT_SPEC_WORKFLOW_HOME` / `NUXT_SYNC_INTERVAL_MS`）。
 * 対応する環境変数は `runtimeConfig` のキーから Nuxt が導く。
 *
 * 走査の親パスだけは `projectShareRoot` を見る。ストローク側の保存先と同じ場所を
 * 指す必要があるため、設定を分けない（docs/specs/core/settings-reference.md）。
 */

import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { useRuntimeConfig } from '#imports';

const TRAILING_SLASHES = /\/+$/;

/** 本家の既定値。`src/core/global-dir.ts` の DEFAULT_DIR_NAME に合わせている */
const DEFAULT_SPEC_WORKFLOW_DIR = '.spec-workflow-mcp';

export interface ServerConfig {
  /** 本家ダッシュボードの URL。未設定なら null */
  upstreamBaseUrl: string | null;
  /**
   * `.spec-workflow` を持つディレクトリを探す親パス。未設定なら null。
   *
   * ストローク側のセッションと昇格したプロジェクトの保存先（`projectShareRoot`）と
   * 同じ1つの設定を見る。分けると食い違ったときに、承認したプロジェクトが一覧から
   * 消える（docs/specs/core/settings-reference.md）。
   */
  projectsParentPath: string | null;
  /**
   * 本家のグローバル状態の置き場。`activeProjects.json` がここにある。
   *
   * 本家と同じ場所を指していないとアクティブ判定ができないので、解決規則も本家に揃える。
   * 未設定でも既定値に落ちるため null にはならない。
   */
  specWorkflowHome: string;
  /**
   * アクティブ集合を見直す間隔（ミリ秒）。
   *
   * 本家の状態変化は WebSocket で受けるのでポーリングしない。ここで見ているのは
   * 「どのプロジェクトが本家に登録されたか」だけで、これは registry のファイル状態であり
   * WebSocket では届かない。
   */
  syncIntervalMs: number;
}

const DEFAULT_SYNC_INTERVAL_MS = 30_000;

/**
 * 本家 `getGlobalDir()` と同じ解決規則。
 * 絶対パスはそのまま、相対パスは cwd 基準、未設定なら `~/.spec-workflow-mcp`。
 */
function resolveSpecWorkflowHome(raw: string | null): string {
  if (raw === null) return join(homedir(), DEFAULT_SPEC_WORKFLOW_DIR);
  return isAbsolute(raw) ? raw : join(process.cwd(), raw);
}

/**
 * 空文字と空白のみは「未設定」として扱う。
 * 未設定を null にして返すのは、呼び出し側が「未設定」と「0件」を区別できるようにするため
 * （specs/project-directory の「親パスが未設定」シナリオ）。
 */
function normalize(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readServerConfig(): ServerConfig {
  const runtimeConfig = useRuntimeConfig();

  const upstreamBaseUrl = normalize(runtimeConfig.upstreamBaseUrl);

  return {
    // 末尾のスラッシュを落として、パスの結合が `//` にならないようにする
    upstreamBaseUrl: upstreamBaseUrl?.replace(TRAILING_SLASHES, '') ?? null,
    projectsParentPath: normalize(runtimeConfig.projectShareRoot),
    specWorkflowHome: resolveSpecWorkflowHome(normalize(runtimeConfig.specWorkflowHome)),
    syncIntervalMs: toPositiveInteger(runtimeConfig.syncIntervalMs) ?? DEFAULT_SYNC_INTERVAL_MS,
  };
}

function toPositiveInteger(raw: unknown): number | null {
  const parsed = Number(normalize(typeof raw === 'number' ? String(raw) : raw));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
