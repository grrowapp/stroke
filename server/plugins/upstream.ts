/**
 * 起動時に本家への接続を張り、アクティブ集合の変化に追従させる。
 *
 * 本家は利用者が別途起動する前提なので、起動していない状態から始まるのが普通である。
 * 繋がらなくても stroke-board は動き続ける（specs/upstream-connection）。
 */

import { defineNitroPlugin } from 'nitropack/runtime';

import { readServerConfig } from '../utils/config';
import {
  broadcastConnection,
  broadcastNotification,
  broadcastSnapshot,
  registerMonitor,
} from '../utils/control/board';
import { buildProjectDirectory } from '../utils/control/directory';
import { UpstreamMonitor } from '../utils/control/monitor';
import { readRegistry } from '../utils/upstream/registry';
import { scanProjects } from '../utils/upstream/scan';

export default defineNitroPlugin((nitro) => {
  const config = readServerConfig();

  if (config.upstreamBaseUrl === null) {
    // 未設定でも画面は出す。接続状態が「未接続」として出るだけ
    return;
  }

  const monitor = new UpstreamMonitor({
    upstreamBaseUrl: config.upstreamBaseUrl,
    onNotification: (notification) => void broadcastNotification(notification),
    onConnectionChange: broadcastConnection,
    onMalformed: (projectId, reason) => {
      // 形が変わったときに黙って通さない（tech.md の Security Practices）
      console.warn(`[stroke-board] 本家のペイロードを弾いた projectId=${projectId}: ${reason}`);
    },
  });

  registerMonitor(monitor);

  const sync = async () => {
    const [scan, registry] = await Promise.all([
      scanProjects(config.projectsParentPath),
      readRegistry(config.specWorkflowHome),
    ]);

    const directory = buildProjectDirectory(scan, {
      entries: registry.status === 'ok' ? registry.entries : [],
      readable: registry.status === 'ok',
    });

    const changed = monitor.sync(directory.status === 'ok' ? directory.projects : []);

    // 監視対象が入れ替わったら、開いているブラウザの一覧も揃え直す
    if (changed) await broadcastSnapshot();
  };

  void sync();
  const timer = setInterval(() => void sync(), config.syncIntervalMs);

  nitro.hooks.hook('close', () => {
    clearInterval(timer);
    monitor.stop();
  });
});
