import { loadConfig as loadDaemonConfig } from '../config';
import type { DaemonConfig } from '../config';

let daemonConfig: DaemonConfig = loadDaemonConfig();

export function getDaemonConfig(): DaemonConfig {
  return daemonConfig;
}

export function __setDaemonConfigForTests(config: DaemonConfig) {
  daemonConfig = config;
}
