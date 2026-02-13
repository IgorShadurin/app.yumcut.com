import http from 'http';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { findFreePort } from './ports';
import { vi } from 'vitest';
import { makeVirtualPrisma } from '../virtual-prisma';

function getSharedPrisma() {
  const g = globalThis as any;
  if (!g.__vtPrisma) {
    g.__vtPrisma = makeVirtualPrisma();
  }
  return g.__vtPrisma;
}

type ServerCall = { method: string; path: string };
type AppServerState = {
  statuses: { projectId: string; status: string; message?: string | null; extra?: any }[];
  jobStatuses: { jobId: string; status: string; projectId?: string }[];
  assets: { projectId: string; kind: 'audio' | 'image' | 'video'; isFinal?: boolean }[];
  scripts: { projectId: string; length: number }[];
};
type ServerInstance = { baseUrl: string; calls: ServerCall[]; state: AppServerState; close: () => Promise<void> };

export async function startAppApiServer(opts: { daemonPassword: string, userId?: string, mediaRoot?: string, storagePublicUrl?: string, isAdmin?: boolean }): Promise<ServerInstance> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const calls: ServerCall[] = [];
  const state: AppServerState = { statuses: [], jobStatuses: [], assets: [], scripts: [] };
  const userId = opts.userId || 'u1';
  process.env.DAEMON_API_PASSWORD = opts.daemonPassword;
  if (opts.mediaRoot) process.env.MEDIA_ROOT = opts.mediaRoot;
  const storageBase = opts.storagePublicUrl || process.env.TEST_STORAGE_BASE_URL || 'http://localhost:3333';
  process.env.STORAGE_PUBLIC_URL = storageBase;
  process.env.NEXT_PUBLIC_STORAGE_BASE_URL = storageBase;
  if (!process.env.UPLOAD_SIGNING_PRIVATE_KEY) {
    try { process.env.UPLOAD_SIGNING_PRIVATE_KEY = fs.readFileSync('keys/upload_private.pem', 'utf8'); } catch {}
  }
  if (!process.env.UPLOAD_SIGNING_PUBLIC_KEY) {
    try { process.env.UPLOAD_SIGNING_PUBLIC_KEY = fs.readFileSync('keys/upload_public.pem', 'utf8'); } catch {}
  }

  // Mock prisma + auth/tokens/telegram before importing routes
  const prisma = getSharedPrisma();
  vi.resetModules();
  vi.doMock('@/server/db', () => ({ prisma }));
  vi.doMock('@/server/auth', async () => {
    const mod: any = await vi.importActual('@/server/auth');
    return {
      ...mod,
      getAuthSession: async () => ({
        user: { id: userId, email: 't@example.com', name: 'Test', isAdmin: opts.isAdmin ?? false },
      }),
    };
  });
  vi.doMock('@/server/tokens', () => ({
    spendTokens: async () => {},
    makeUserInitiator: (id: string) => ({ kind: 'user', userId: id }),
    TOKEN_TRANSACTION_TYPES: { projectCreation: 'projectCreation', signUpBonus: 'signUpBonus' },
    InsufficientTokensError: class MockInsufficientTokensError extends Error {
      balance: number;
      required: number;
      constructor(balance = 0, required = 0) {
        super('Insufficient tokens');
        this.name = 'InsufficientTokensError';
        this.balance = balance;
        this.required = required;
      }
    },
  }));
  vi.doMock('@/server/telegram', () => ({ notifyAdminsOfNewProject: async () => {}, notifyProjectStatusChange: async () => {} }));

  const handlerDaemonHealth: any = await import('@/app/api/daemon/health/route');
  const projectsList: any = await import('@/app/api/projects/route');
  const daemonEligible: any = await import('@/app/api/daemon/projects/eligible/route');
  const daemonJobsQueue: any = await import('@/app/api/daemon/jobs/queue/route');
  const daemonJobsCreate: any = await import('@/app/api/daemon/jobs/route');
  const daemonJobsExists: any = await import('@/app/api/daemon/jobs/exists/route');
  const daemonJobClaim: any = await import('@/app/api/daemon/jobs/[jobId]/claim/route');
  const daemonJobStatus: any = await import('@/app/api/daemon/jobs/[jobId]/status/route');
  const projectSnapshot: any = await import('@/app/api/daemon/projects/[projectId]/creation-snapshot/route');
  const projectScript: any = await import('@/app/api/daemon/projects/[projectId]/script/route');
  const projectStatus: any = await import('@/app/api/daemon/projects/[projectId]/status/route');
  const projectTranscriptionSnap: any = await import('@/app/api/daemon/projects/[projectId]/transcription-snapshot/route');
  const projectLanguageProgressRoute: any = await import('@/app/api/daemon/projects/[projectId]/language-progress/route');
  const projectAssetsRegister: any = await import('@/app/api/daemon/projects/[projectId]/assets/route');
  const characterGeneratedRoute: any = await import('@/app/api/daemon/projects/[projectId]/character/generated/route');
  const storageGrantRoute: any = await import('@/app/api/storage/grant/route');
  const projectAudiosRegenerate: any = await import('@/app/api/projects/[projectId]/audios/regenerate/route');
  const projectAudiosApprove: any = await import('@/app/api/projects/[projectId]/audios/approve/route');
  const storageUploadTokenRoute: any = await import('@/app/api/storage/upload-token/route');
  const characterUploadRoute: any = await import('@/app/api/characters/custom/upload/route');
  // Public project status (polled by UI/tests)
  const publicProjectStatus: any = await import('@/app/api/projects/[projectId]/status/route');
  const projectDetailRoute: any = await import('@/app/api/projects/[projectId]/route');
  const projectScriptApprove: any = await import('@/app/api/projects/[projectId]/script/approve/route');
  const projectScriptRequest: any = await import('@/app/api/projects/[projectId]/script/request/route');
  const adminProjectStatusRoute: any = await import('@/app/api/admin/projects/[projectId]/status/route');

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) { res.statusCode = 404; res.end(''); return; }
    const url = new URL(req.url, baseUrl);
    calls.push({ method: req.method, path: url.pathname });
    try {
      if (req.method === 'GET' && url.pathname === '/api/daemon/health') {
        const request = new NextRequest(new Request(new URL(url.pathname + url.search, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await handlerDaemonHealth.GET(request);
        res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/daemon/jobs/queue') {
        const request = new NextRequest(new Request(new URL(url.pathname + url.search, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await daemonJobsQueue.GET(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/daemon/jobs') {
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await daemonJobsCreate.POST(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/daemon/jobs/exists') {
        const request = new NextRequest(new Request(new URL(url.pathname + url.search, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await daemonJobsExists.GET(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/daemon\/jobs\/.+\/claim$/.test(url.pathname)) {
        const jobId = url.pathname.split('/')[4];
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any }));
        const response: Response = await daemonJobClaim.POST(request, { params: Promise.resolve({ jobId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/daemon\/jobs\/.+\/status$/.test(url.pathname)) {
        const jobId = url.pathname.split('/')[4];
        const body = await readBody(req);
        try {
          const parsed = JSON.parse(body.toString('utf8'));
          let projectId: string | undefined = undefined;
          try {
            const prisma = getSharedPrisma();
            const rec = await prisma.job.findUnique({ where: { id: jobId }, select: { projectId: true } });
            projectId = rec?.projectId;
          } catch {}
          if (parsed && typeof parsed.status === 'string') {
            state.jobStatuses.push({ jobId, status: parsed.status, projectId });
          }
        } catch {}
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await daemonJobStatus.POST(request, { params: Promise.resolve({ jobId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/daemon/projects/eligible') {
        const request = new NextRequest(new Request(new URL(url.pathname + url.search, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await daemonEligible.GET(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && /\/api\/daemon\/projects\/.+\/creation-snapshot$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await projectSnapshot.GET(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (/(^GET|^POST)/.test(req.method!) && /\/api\/daemon\/projects\/.+\/script$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        if (req.method === 'GET') {
          const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'GET', headers: req.headers as any }));
          const response: Response = await projectScript.GET(request, { params: Promise.resolve({ projectId }) });
          res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
        } else {
          const body = await readBody(req);
          try {
            const parsed = JSON.parse(body.toString('utf8'));
            if (parsed && typeof parsed.text === 'string') {
              state.scripts.push({ projectId, length: parsed.text.length });
            }
          } catch {}
          const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
          const response: Response = await projectScript.POST(request, { params: Promise.resolve({ projectId }) });
          res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
        }
      }
      if (req.method === 'POST' && /\/api\/daemon\/projects\/.+\/status$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const body = await readBody(req);
        try {
          const parsed = JSON.parse(body.toString('utf8'));
          if (parsed && typeof parsed.status === 'string') {
            state.statuses.push({ projectId, status: parsed.status, message: parsed.message ?? null, extra: parsed.extra });
          }
        } catch {}
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await projectStatus.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && /\/api\/daemon\/projects\/.+\/transcription-snapshot$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await projectTranscriptionSnap.GET(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && /\/api\/daemon\/projects\/.+\/language-progress$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await projectLanguageProgressRoute.GET(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/daemon\/projects\/.+\/language-progress$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await projectLanguageProgressRoute.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/daemon\/projects\/.+\/assets$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const body = await readBody(req);
        try {
          const parsed = JSON.parse(body.toString('utf8'));
          if (parsed && typeof parsed.type === 'string') {
            state.assets.push({ projectId, kind: parsed.type, isFinal: !!parsed.isFinal });
          }
        } catch {}
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await projectAssetsRegister.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/storage/grant') {
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await storageGrantRoute.POST(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/projects\/[^/]+\/audios\/approve$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[3];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await projectAudiosApprove.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/daemon\/projects\/.+\/character\/generated$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await characterGeneratedRoute.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/projects') {
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await projectsList.POST(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/storage/upload-token') {
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await storageUploadTokenRoute.POST(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/characters/custom/upload') {
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), { method: 'POST', headers: req.headers as any, body: body as any } as any));
        const response: Response = await characterUploadRoute.POST(request);
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && /\/api\/projects\/.+\/status$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[3];
        const request = new NextRequest(new Request(new URL(url.pathname + url.search, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await publicProjectStatus.GET(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'GET' && /^\/api\/projects\/[^/]+$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[3];
        const request = new NextRequest(new Request(new URL(url.pathname + url.search, baseUrl), { method: 'GET', headers: req.headers as any }));
        const response: Response = await projectDetailRoute.GET(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/projects\/[^/]+\/script\/approve$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[3];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), {
          method: 'POST',
          headers: req.headers as any,
          body: body as any,
        } as any));
        const response: Response = await projectScriptApprove.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/projects\/[^/]+\/script\/request$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[3];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), {
          method: 'POST',
          headers: req.headers as any,
          body: body as any,
        } as any));
        const response: Response = await projectScriptRequest.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/admin\/projects\/[^/]+\/status$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[4];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), {
          method: 'POST',
          headers: req.headers as any,
          body: body as any,
        } as any));
        const response: Response = await adminProjectStatusRoute.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method === 'POST' && /\/api\/projects\/[^/]+\/audios\/regenerate$/.test(url.pathname)) {
        const projectId = url.pathname.split('/')[3];
        const body = await readBody(req);
        const request = new NextRequest(new Request(new URL(url.pathname, baseUrl), {
          method: 'POST',
          headers: req.headers as any,
          body: body as any,
        } as any));
        const response: Response = await projectAudiosRegenerate.POST(request, { params: Promise.resolve({ projectId }) });
        res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      res.statusCode = 404; res.end('');
    } catch (err: any) {
      res.statusCode = 500;
      res.end(String(err?.message || err));
    }
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return { baseUrl, calls, state, close: () => new Promise((r) => server.close(() => r())) };
}

export async function startStorageApiServer(opts: { daemonPassword: string, mediaRoot?: string, storagePublicUrl?: string, storageAllowedOrigins?: string }): Promise<ServerInstance> {
  const baseUrl = (opts.storagePublicUrl && opts.storagePublicUrl.trim()) || process.env.TEST_STORAGE_BASE_URL || 'http://localhost:3333';
  const calls: ServerCall[] = [];
  process.env.DAEMON_API_PASSWORD = opts.daemonPassword;
  if (opts.mediaRoot) process.env.MEDIA_ROOT = opts.mediaRoot;
  process.env.NEXT_PUBLIC_STORAGE_BASE_URL = baseUrl;
  process.env.STORAGE_PUBLIC_URL = baseUrl;
  process.env.STORAGE_ALLOWED_ORIGINS = opts.storageAllowedOrigins || process.env.STORAGE_ALLOWED_ORIGINS || 'http://localhost:3001,http://localhost:3000';
  // No local server; rely on the real storage instance.
  return { baseUrl, calls, state: { statuses: [], jobStatuses: [], assets: [], scripts: [] }, close: async () => {} };
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c as any));
  return Buffer.concat(chunks);
}

function readStreamAsWeb(req: http.IncomingMessage): any {
  const { Readable } = require('stream');
  const nodeReadable = req as any;
  if (Readable.toWeb) return Readable.toWeb(nodeReadable);
  return nodeReadable;
}
