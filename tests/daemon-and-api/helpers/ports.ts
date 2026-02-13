import net from 'net';

export async function findFreePort(min = 30000, max = 40000): Promise<number> {
  const tried = new Set<number>();
  for (let i = 0; i < 2000; i += 1) {
    const port = Math.floor(Math.random() * (max - min + 1)) + min;
    if (tried.has(port)) continue;
    tried.add(port);
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.unref();
      srv.once('error', () => resolve(false));
      srv.listen(port, () => srv.close(() => resolve(true)));
    });
    if (ok) return port;
  }
  throw new Error('Unable to find free port');
}

