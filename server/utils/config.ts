/**
 * 本家に触るために要る3つの設定を読む唯一の場所。
 *
 * いずれも環境変数から入る（tech.md の Security Practices「ソースに埋めない」）。
 * 対応する環境変数は `runtimeConfig` のキーから Nuxt が導く。
 *
 *   upstreamBaseUrl    <- NUXT_UPSTREAM_BASE_URL
 *   projectsParentPath <- NUXT_PROJECTS_PARENT_PATH
 *   specWorkflowHome   <- NUXT_SPEC_WORKFLOW_HOME
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
  /** `.spec-workflow` を持つディレクトリを探す親パス。未設定なら null */
  projectsParentPath: string | null;
  /**
   * 本家のグローバル状態の置き場。`activeProjects.json` がここにある。
   *
   * 本家と同じ場所を指していないとアクティブ判定ができないので、解決規則も本家に揃える。
   * 未設定でも既定値に落ちるため null にはならない。
   */
  specWorkflowHome: string;
}

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
    projectsParentPath: normalize(runtimeConfig.projectsParentPath),
    specWorkflowHome: resolveSpecWorkflowHome(normalize(runtimeConfig.specWorkflowHome)),
  };
}
