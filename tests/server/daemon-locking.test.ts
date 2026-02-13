import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';
import { makeVirtualPrisma } from '../daemon-and-api/virtual-prisma';

const API_PASSWORD = 'secret';

function makeRequest(url: string, init: RequestInit = {}) {
  return new NextRequest(new Request(url, init));
}

describe('daemon assignment locking', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DAEMON_API_PASSWORD = API_PASSWORD;
  });

  it('assigns project to the first claiming daemon and rejects others', async () => {
    const prisma = makeVirtualPrisma();
    vi.doMock('@/server/db', () => ({ prisma }));
    const route = await import('@/app/api/daemon/jobs/[jobId]/claim/route');

    const project = await prisma.project.create({
      data: { userId: 'u1', title: 'Demo', status: ProjectStatus.ProcessScript },
    });
    const job = await prisma.job.create({
      data: { userId: 'u1', projectId: project.id, type: 'script', status: 'queued', payload: {} },
    });

    const reqA = makeRequest('http://localhost/api/daemon/jobs/a/claim', {
      method: 'POST',
      headers: new Headers({ 'x-daemon-password': API_PASSWORD, 'x-daemon-id': 'daemon-a' }),
    });
    const resA = await route.POST(reqA, { params: Promise.resolve({ jobId: job.id }) });
    const bodyA = await resA.json();
    expect(bodyA.claimed).toBe(true);

    const updatedProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updatedProject?.currentDaemonId).toBe('daemon-a');
    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.daemonId).toBe('daemon-a');

    const reqB = makeRequest('http://localhost/api/daemon/jobs/a/claim', {
      method: 'POST',
      headers: new Headers({ 'x-daemon-password': API_PASSWORD, 'x-daemon-id': 'daemon-b' }),
    });
    const resB = await route.POST(reqB, { params: Promise.resolve({ jobId: job.id }) });
    const bodyB = await resB.json();
    expect(bodyB.claimed).toBe(false);
  });

  it('only exposes queued jobs to the assigned daemon', async () => {
    const prisma = makeVirtualPrisma();
    vi.doMock('@/server/db', () => ({ prisma }));
    const route = await import('@/app/api/daemon/jobs/queue/route');

    const project = await prisma.project.create({
      data: { userId: 'u1', title: 'Demo', status: ProjectStatus.ProcessScript },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { currentDaemonId: 'daemon-a' },
    });
    await prisma.job.create({
      data: { userId: 'u1', projectId: project.id, type: 'script', status: 'queued', payload: {} },
    });

    const reqA = makeRequest('http://localhost/api/daemon/jobs/queue?limit=5', {
      method: 'GET',
      headers: new Headers({ 'x-daemon-password': API_PASSWORD, 'x-daemon-id': 'daemon-a' }),
    });
    const resA = await route.GET(reqA);
    const bodyA = await resA.json();
    expect(bodyA.jobs).toHaveLength(1);

    const reqB = makeRequest('http://localhost/api/daemon/jobs/queue?limit=5', {
      method: 'GET',
      headers: new Headers({ 'x-daemon-password': API_PASSWORD, 'x-daemon-id': 'daemon-b' }),
    });
    const resB = await route.GET(reqB);
    const bodyB = await resB.json();
    expect(bodyB.jobs).toHaveLength(0);
  });

  it('prevents job creation from non-owning daemon', async () => {
    const prisma = makeVirtualPrisma();
    vi.doMock('@/server/db', () => ({ prisma }));
    const route = await import('@/app/api/daemon/jobs/route');

    const project = await prisma.project.create({
      data: { userId: 'u1', title: 'Demo', status: ProjectStatus.ProcessScript },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { currentDaemonId: 'daemon-a' },
    });

    const allowReq = makeRequest('http://localhost/api/daemon/jobs', {
      method: 'POST',
      headers: new Headers({
        'x-daemon-password': API_PASSWORD,
        'x-daemon-id': 'daemon-a',
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ projectId: project.id, userId: 'u1', type: 'script' }),
    });
    const allowRes = await route.POST(allowReq);
    expect(allowRes.status).toBe(200);

    const blockReq = makeRequest('http://localhost/api/daemon/jobs', {
      method: 'POST',
      headers: new Headers({
        'x-daemon-password': API_PASSWORD,
        'x-daemon-id': 'daemon-b',
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ projectId: project.id, userId: 'u1', type: 'script' }),
    });
    const blockRes = await route.POST(blockReq);
    expect(blockRes.status).toBe(403);
  });
});
