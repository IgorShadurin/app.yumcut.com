import { config as loadEnv } from 'dotenv';

// Load .env/.env.local so required secrets (e.g. DAEMON_API_PASSWORD, storage keys) are available in tests.
loadEnv();

// Ensure tests do not invoke the real translation CLI unless explicitly requested.
if (typeof process !== 'undefined' && !process.env.MOCK_TRANSLATION) {
  process.env.MOCK_TRANSLATION = '1';
}

// Silence noisy console output during tests unless explicitly opted in.
if (typeof process !== 'undefined' && process.env.QUIET_TEST_LOGS !== '0') {
  const noop = () => {};
  // Preserve error logging for failures.
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
  // eslint-disable-next-line no-console
  console.warn = noop;
}
