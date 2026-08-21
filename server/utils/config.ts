/**
 * 本家ダッシュボードの URL と、監視する親パスを読む唯一の場所。
 *
 * どちらも環境変数から入る（tech.md の Security Practices「ソースに埋めない」）。
 * 対応する環境変数は `runtimeConfig` のキーから Nuxt が導く。
 *
 *   upstreamBaseUrl    <- NUXT_UPSTREAM_BASE_URL
 *   projectsParentPath <- NUXT_PROJECTS_PARENT_PATH
 */

import { useRuntimeConfig } from '#imports';

const TRAILING_SLASHES = /\/+$/;

export interface ServerConfig {
  /** 本家ダッシュボードの URL。未設定なら null */
  upstreamBaseUrl: string | null;
  /** `.spec-workflow` を持つディレクトリを探す親パス。未設定なら null */
  projectsParentPath: string | null;
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
  };
}
