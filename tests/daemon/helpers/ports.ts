import net from 'net';
import { randomInt } from './random';

export async function findFreePort(min = 5000, max = 6000): Promise<number> {
  const tried = new Set<number>();
  const maxAttempts = 2000;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    const port = randomInt(min, max);
    if (tried.has(port)) continue;
    tried.add(port);
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.unref();
      srv.once('error', () => resolve(false));
      srv.listen(port, () => {
        srv.close(() => resolve(true));
      });
    });
    if (ok) return port;
  }
  throw new Error(`Unable to find a free port in range ${min}-${max}`);
}

