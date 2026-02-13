import { randomUUID } from 'crypto';

type ISODate = string;

type Project = {
  id: string;
  userId: string;
  title: string;
  status: string;
  prompt: string | null;
  rawScript: string | null;
  deleted: boolean;
  languages?: string[] | null;
  finalScriptText?: string | null;
  finalVoiceoverId?: string | null;
  finalVoiceoverPath?: string | null;
  finalVoiceoverUrl?: string | null;
  languageVoiceAssignments?: Record<string, string | null> | null;
  languageVoiceProviders?: Record<string, string | null> | null;
  voiceProvider?: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentDaemonId?: string | null;
  currentDaemonLockedAt?: Date | null;
};

type Job = {
  id: string;
  projectId: string;
  userId: string;
  type: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'paused';
  payload: Record<string, unknown> | null;
  createdAt: Date;
  daemonId?: string | null;
};

type Script = { projectId: string; languageCode: string; text: string; updatedAt: Date };
type AudioCandidate = {
  id: string;
  projectId: string;
  path: string;
  publicUrl: string | null;
  localPath?: string | null;
  languageCode?: string | null;
  isFinal: boolean;
  createdAt: Date;
};
type ImageAsset = { id: string; projectId: string; path: string; publicUrl: string | null };
type ProjectTemplateImage = {
  id: string;
  projectId: string;
  imageAssetId: string;
  imageName: string;
  model: string;
  prompt: string;
  sentence: string | null;
  size: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type VideoAsset = {
  id: string;
  projectId: string;
  path: string;
  publicUrl: string | null;
  isFinal: boolean;
  languageCode?: string | null;
};
type ProjectStatusHistory = { id: string; projectId: string; status: string; message?: string | null; extra?: any; createdAt: Date };
type UserCharacter = { id: string; userId: string; title: string | null; description: string | null; createdAt: Date; deleted: boolean; deletedAt: Date | null };
type UserCharacterVariation = {
  id: string;
  userCharacterId: string;
  title: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  status: string;
  source: string | null;
  createdAt: Date;
  deleted: boolean;
  deletedAt: Date | null;
};
type ScriptRequest = { id: string; projectId: string; text: string; createdAt: Date };
type ProjectLanguageProgress = {
  projectId: string;
  languageCode: string;
  transcriptionDone: boolean;
  captionsDone: boolean;
  videoPartsDone: boolean;
  finalVideoDone: boolean;
  disabled: boolean;
  failedStep: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TemplateVoice = {
  id: string;
  title: string;
  description: string | null;
  externalId: string | null;
  languages: string | null;
  speed: string | null;
  gender: string | null;
  voiceProvider: string;
  previewPath: string | null;
  weight: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function makeVirtualPrisma() {
  const voiceCreatedAt = (offsetDays: number) => new Date(Date.UTC(2024, 0, 1 + offsetDays));

  const db = {
    projects: new Map<string, Project>(),
    jobs: new Map<string, Job>(),
    scripts: new Map<string, Script>(), // key `${projectId}:${languageCode}`
    audioCandidates: new Map<string, AudioCandidate>(),
    imageAssets: new Map<string, ImageAsset>(),
    projectTemplateImages: new Map<string, ProjectTemplateImage>(),
    videoAssets: new Map<string, VideoAsset>(),
    languageProgress: new Map<string, ProjectLanguageProgress>(),
    projectStatusHistory: new Map<string, ProjectStatusHistory>(),
    projectSelections: new Map<string, any>(), // projectCharacterSelection by projectId
    userCharacters: new Map<string, UserCharacter>(),
    userCharacterVariations: new Map<string, UserCharacterVariation>(),
    scriptRequests: new Map<string, ScriptRequest>(),
    users: new Map<string, { id: string; email: string; deleted: boolean; name: string | null; image: string | null; tokenBalance?: number }>(),
    daemons: new Map<string, { id: string; lastSeenAt: Date; createdAt: Date; updatedAt: Date }>(),
    templateVoices: [
      {
        id: 'tpl-voice-en-fast',
        title: 'English Fast Female',
        description: null,
        externalId: 'english-primary-voice',
        languages: 'en,en-US',
        speed: 'fast',
        gender: 'female',
        voiceProvider: 'minimax',
        previewPath: null,
        weight: 1200,
        isPublic: true,
        createdAt: voiceCreatedAt(0),
        updatedAt: voiceCreatedAt(0),
      },
      {
        id: 'tpl-voice-fr-fast',
        title: 'French Fast Female',
        description: null,
        externalId: 'french-fast-fallback',
        languages: 'fr,fr-FR',
        speed: 'fast',
        gender: 'female',
        voiceProvider: 'minimax',
        previewPath: null,
        weight: 1150,
        isPublic: true,
        createdAt: voiceCreatedAt(1),
        updatedAt: voiceCreatedAt(1),
      },
      {
        id: 'tpl-voice-global',
        title: 'Global Narrator',
        description: null,
        externalId: 'global-voice',
        languages: 'en,es,de',
        speed: 'slow',
        gender: 'male',
        voiceProvider: 'minimax',
        previewPath: null,
        weight: 900,
        isPublic: true,
        createdAt: voiceCreatedAt(2),
        updatedAt: voiceCreatedAt(2),
      },
    ] as TemplateVoice[],
  };

  db.users.set('u1', { id: 'u1', email: 'user@example.com', deleted: false, name: 'Test User', image: null, tokenBalance: 0 });

  function now() { return new Date(); }
  const scriptKey = (projectId: string, languageCode: string) => `${projectId}:${languageCode || 'en'}`;
  const progressKey = (projectId: string, languageCode: string) => `${projectId}:${languageCode}`;

  const project = {
    async findFirst({ where, include, orderBy, take, select }: any) {
      // Simplified filter: supports id, userId, deleted
      let rows = Array.from(db.projects.values());
      if (where?.id) rows = rows.filter(r => r.id === where.id);
      if (where?.userId) rows = rows.filter(r => r.userId === where.userId);
      if (typeof where?.deleted === 'boolean') rows = rows.filter(r => r.deleted === where.deleted);
      // OrderBy and take minimal support
      if (orderBy?.createdAt === 'desc') rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
      if (orderBy?.createdAt === 'asc') rows.sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
      if (typeof take === 'number') rows = rows.slice(0, take);
      const p = rows[0];
      if (!p) return null;
      // Include relations expected by real status handler
      if (include) {
        const out: any = { ...p };
        if (include.scripts) {
          const scripts = Array.from(db.scripts.values()).filter((s) => s.projectId === p.id);
          out.scripts = scripts;
        }
        if (include.script) {
          const scripts = Array.from(db.scripts.values()).filter((s) => s.projectId === p.id);
          out.script = scripts[0] || null;
        }
        if (include.audios) out.audios = Array.from(db.audioCandidates.values()).filter(a => a.projectId === p.id);
        if (include.videos) out.videos = Array.from(db.videoAssets.values()).filter(v => v.projectId === p.id);
        if (include.statusLog) {
          let logs = Array.from(db.projectStatusHistory.values()).filter(s => s.projectId === p.id);
          if (include.statusLog.orderBy?.createdAt === 'desc') logs.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
          if (typeof include.statusLog.take === 'number') logs = logs.slice(0, include.statusLog.take);
          out.statusLog = logs;
        }
        if (include.selection) {
          out.selection = db.projectSelections.get(p.id) || null;
        }
        return out;
      }
      if (select) {
        const out: any = {}; for (const k of Object.keys(select)) out[k] = (p as any)[k]; return out;
      }
      return p;
    },
    async findUnique({ where, select }: any) {
      const p = db.projects.get(where.id);
      if (!p) return null;
      if (!select) return p;
      const out: any = {};
      for (const k of Object.keys(select)) out[k] = (p as any)[k];
      return out;
    },
    async findUniqueOrThrow({ where, select }: any) {
      const result = await project.findUnique({ where, select });
      if (!result) {
        const err: any = new Error('Record not found');
        err.code = 'P2025';
        throw err;
      }
      return result;
    },
    async findMany({ where, orderBy, take, select }: any) {
      let rows = Array.from(db.projects.values());
      if (where?.deleted === false) rows = rows.filter(r => !r.deleted);
      if (where?.status?.in) rows = rows.filter(r => (where.status.in as string[]).includes(r.status));
      if (orderBy?.createdAt === 'asc') rows.sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
      if (orderBy?.createdAt === 'desc') rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
      if (typeof take === 'number') rows = rows.slice(0, take);
      if (select) {
        return rows.map(r => { const o:any={}; for (const k of Object.keys(select)) o[k]=(r as any)[k]; return o; });
      }
      return rows;
    },
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const connectUserId = data.user?.connect?.id as string | undefined;
      const ownerId = typeof connectUserId === 'string' && connectUserId.length > 0
        ? connectUserId
        : data.userId;
      if (!ownerId) {
        throw new Error('Project create requires userId or user.connect.id');
      }
      const p: Project = {
        id,
        userId: ownerId,
        title: data.title,
        status: data.status || 'New',
        prompt: data.prompt ?? null,
        rawScript: data.rawScript ?? null,
      deleted: false,
      languages: Array.isArray(data.languages) ? [...data.languages] : (Array.isArray((data as any).languages) ? [...(data as any).languages] : null),
      createdAt: now(),
      updatedAt: now(),
      currentDaemonId: null,
      currentDaemonLockedAt: null,
    };
      db.projects.set(p.id, p);
      if (Array.isArray(p.languages)) {
        for (const language of p.languages as string[]) {
          const key = progressKey(p.id, language);
          if (!db.languageProgress.has(key)) {
            db.languageProgress.set(key, {
              projectId: p.id,
              languageCode: language,
              transcriptionDone: false,
              captionsDone: false,
              videoPartsDone: false,
              finalVideoDone: false,
              disabled: false,
              failedStep: null,
              failureReason: null,
              createdAt: now(),
              updatedAt: now(),
            });
          }
        }
      }
      return p;
    },
    async update({ where, data }: any) {
      const p = db.projects.get(where.id);
      if (!p) throw new Error('Project not found');
      Object.assign(p, data);
      p.updatedAt = now();
      db.projects.set(p.id, p);
      return p;
    },
  };

  function matchesProjectClause(job: Job, clause: any): boolean {
    if (!clause) return true;
    const projectRecord = db.projects.get(job.projectId);
    if (!projectRecord) return false;
    if (Array.isArray(clause.AND) && !clause.AND.every((sub: any) => matchesProjectClause(job, sub))) {
      return false;
    }
    if (Array.isArray(clause.OR) && clause.OR.length > 0) {
      if (!clause.OR.some((sub: any) => matchesProjectClause(job, sub))) {
        return false;
      }
    }
    if (clause.currentDaemonId !== undefined) {
      if (clause.currentDaemonId === null) {
        if (projectRecord.currentDaemonId) return false;
      } else if (typeof clause.currentDaemonId === 'string') {
        if (projectRecord.currentDaemonId !== clause.currentDaemonId) return false;
      }
    }
    const statusFilter = clause.status;
    if (typeof statusFilter === 'string' && projectRecord.status !== statusFilter) {
      return false;
    }
    if (statusFilter?.equals && projectRecord.status !== statusFilter.equals) {
      return false;
    }
    if (Array.isArray(statusFilter?.in) && statusFilter.in.length > 0) {
      if (!statusFilter.in.includes(projectRecord.status)) {
        return false;
      }
    }
    if (clause.jobs?.none?.status) {
      const targetStatus = clause.jobs.none.status;
      const hasJob = Array.from(db.jobs.values()).some(
        (candidate) => candidate.projectId === job.projectId && candidate.id !== job.id && candidate.status === targetStatus,
      );
      if (hasJob) return false;
    }
    return true;
  }

  const job = {
    async count({ where }: any) {
      let rows = Array.from(db.jobs.values());
      if (where?.projectId) rows = rows.filter(j => j.projectId === where.projectId);
      if (where?.type) rows = rows.filter(j => j.type === where.type);
      if (where?.status?.in) rows = rows.filter(j => (where.status.in as string[]).includes(j.status));
      return rows.length;
    },
    async findMany({ where, orderBy, take, select }: any) {
      let rows = Array.from(db.jobs.values());
      if (where?.status) rows = rows.filter(j => j.status === where.status);
      if (where?.project) {
        rows = rows.filter((jobRow) => matchesProjectClause(jobRow, where.project));
      }
      if (where?.OR && Array.isArray(where.OR)) {
        rows = rows.filter(j => where.OR.some((cond: any) => (cond.type ? j.type === cond.type : true) && (cond.project?.status ? (db.projects.get(j.projectId)?.status === cond.project.status) : true)));
      }
      if (orderBy?.createdAt === 'asc') rows.sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
      if (orderBy?.createdAt === 'desc') rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
      if (typeof take === 'number') rows = rows.slice(0, take);
      if (select) return rows.map(r => { const o:any={}; for (const k of Object.keys(select)) o[k]=(r as any)[k]; return o; });
      return rows;
    },
    async findFirst({ where, orderBy }: any) {
      let rows = Array.from(db.jobs.values()).filter(j => (!where?.projectId || j.projectId === where.projectId));
      if (where?.status?.in) rows = rows.filter(j => (where.status.in as string[]).includes(j.status));
      if (orderBy?.createdAt === 'asc') rows.sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
      if (orderBy?.createdAt === 'desc') rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
      return rows[0] || null;
    },
    async findUnique({ where, select }: any) {
      const j = db.jobs.get(where.id);
      if (!j) return null;
      if (!select) return j;
      const out: any = { id: j.id, type: j.type, status: j.status, projectId: j.projectId };
      if (select.project) out.project = { status: db.projects.get(j.projectId)?.status };
      return out;
    },
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const j: Job = {
        id,
        projectId: data.projectId,
        userId: data.userId,
        type: data.type,
        status: data.status || 'queued',
        payload: data.payload ?? null,
        createdAt: now(),
        daemonId: data.daemonId ?? null,
      };
      db.jobs.set(id, j);
      return j;
    },
    async update({ where, data }: any) {
      const j = db.jobs.get(where.id);
      if (!j) throw new Error('Job not found');
      Object.assign(j, data);
      if (data.daemonId !== undefined) {
        j.daemonId = data.daemonId;
      }
      db.jobs.set(j.id, j);
      return j;
    },
    async updateMany({ where, data }: any) {
      const j = db.jobs.get(where.id);
      if (!j) return { count: 0 };
      if (where.status && j.status !== where.status) return { count: 0 };
      if (where.project && !matchesProjectClause(j, where.project)) {
        return { count: 0 };
      }
      Object.assign(j, data);
      db.jobs.set(j.id, j);
      return { count: 1 };
    },
    async deleteMany({ where }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.jobs.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;
        if (where?.type && record.type !== where.type) continue;
        if (where?.status?.in && !(where.status.in as string[]).includes(record.status)) continue;
        db.jobs.delete(id);
        count += 1;
      }
      return { count };
    },
  };

  const script = {
    async findUnique({ where }: any) {
      if (where.projectId_languageCode) {
        const { projectId, languageCode } = where.projectId_languageCode;
        return db.scripts.get(scriptKey(projectId, languageCode)) || null;
      }
      if (where.projectId) {
        const rows = Array.from(db.scripts.values()).filter((s) => s.projectId === where.projectId);
        return rows[0] || null;
      }
      return null;
    },
    async findFirst({ where, orderBy }: any) {
      let rows = Array.from(db.scripts.values());
      if (where?.projectId) rows = rows.filter((s) => s.projectId === where.projectId);
      if (orderBy?.updatedAt === 'desc') rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      if (orderBy?.updatedAt === 'asc') rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      return rows[0] || null;
    },
    async upsert({ where, create, update }: any) {
      const target = where.projectId_languageCode
        ? where.projectId_languageCode
        : { projectId: where.projectId, languageCode: (update.languageCode || create.languageCode || 'en') };
      const key = scriptKey(target.projectId, target.languageCode || 'en');
      const existing = db.scripts.get(key);
      if (existing) {
        existing.text = update.text ?? existing.text;
        existing.updatedAt = now();
        db.scripts.set(key, existing);
        return existing;
      }
      const created: Script = {
        projectId: target.projectId,
        languageCode: target.languageCode || 'en',
        text: create.text,
        updatedAt: now(),
      };
      db.scripts.set(key, created);
      return created;
    },
  };

  const audioCandidate = {
    async findUnique({ where }: any) { return db.audioCandidates.get(where.id) || null; },
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const rec: AudioCandidate = {
        id,
        projectId: data.projectId,
        path: data.path,
        publicUrl: data.publicUrl ?? null,
        localPath: (data as any).localPath ?? null,
        languageCode: (data as any).languageCode ?? null,
        isFinal: data.isFinal ?? false,
        createdAt: data.createdAt instanceof Date ? data.createdAt : data.createdAt ? new Date(data.createdAt) : now(),
      };
      db.audioCandidates.set(id, rec);
      return rec;
    },
    async deleteMany({ where }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.audioCandidates.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;
        if (where?.languageCode && record.languageCode !== where.languageCode) continue;
        if (typeof where?.isFinal === 'boolean' && record.isFinal !== where.isFinal) continue;
        db.audioCandidates.delete(id);
        count += 1;
      }
      return { count };
    },
    async updateMany({ where, data }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.audioCandidates.entries())) {
        if (where?.id?.in && !(where.id.in as string[]).includes(id)) continue;
        if (where?.projectId && record.projectId !== where.projectId) continue;
        if (where?.languageCode && record.languageCode !== where.languageCode) continue;
        const next = { ...record, ...data };
        if (typeof data.isFinal === 'boolean') next.isFinal = data.isFinal;
        if (typeof data.localPath === 'string') next.localPath = data.localPath;
        if (data.createdAt) {
          next.createdAt = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
        }
        db.audioCandidates.set(id, next);
        count += 1;
      }
      return { count };
    },
    async update({ where, data }: any) {
      const rec = db.audioCandidates.get(where.id);
      if (!rec) throw new Error('AudioCandidate not found');
      const next: AudioCandidate = {
        ...rec,
        ...data,
        isFinal: typeof data.isFinal === 'boolean' ? data.isFinal : rec.isFinal,
        localPath: data.localPath !== undefined ? data.localPath : rec.localPath,
        publicUrl: data.publicUrl !== undefined ? data.publicUrl : rec.publicUrl,
        createdAt: data.createdAt
          ? (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt))
          : rec.createdAt,
      };
      db.audioCandidates.set(where.id, next);
      return next;
    },
    async findMany({ where }: any) {
      let rows = Array.from(db.audioCandidates.values());
      if (where?.projectId) rows = rows.filter((r) => r.projectId === where.projectId);
      if (where?.languageCode) rows = rows.filter((r) => r.languageCode === where.languageCode);
      if (where?.isFinal !== undefined) rows = rows.filter((r) => r.isFinal === where.isFinal);
      if (where?.id?.in) rows = rows.filter((r) => (where.id.in as string[]).includes(r.id));
      return rows;
    },
  };

  const projectLanguageProgress = {
    async upsert({ where, create, update }: any) {
      const { projectId, languageCode } = where.projectId_languageCode;
      const key = progressKey(projectId, languageCode);
      const existing = db.languageProgress.get(key);
      if (existing) {
        const next: ProjectLanguageProgress = {
          ...existing,
          ...update,
          disabled: update.disabled !== undefined ? update.disabled : existing.disabled,
          failedStep: update.failedStep !== undefined ? (update.failedStep ?? null) : existing.failedStep,
          failureReason: update.failureReason !== undefined ? (update.failureReason ?? null) : existing.failureReason,
          updatedAt: now(),
        };
        db.languageProgress.set(key, next);
        return next;
      }
      const record: ProjectLanguageProgress = {
        projectId,
        languageCode,
        transcriptionDone: create.transcriptionDone ?? false,
        captionsDone: create.captionsDone ?? false,
        videoPartsDone: create.videoPartsDone ?? false,
        finalVideoDone: create.finalVideoDone ?? false,
        disabled: create.disabled ?? false,
        failedStep: create.failedStep ?? null,
        failureReason: create.failureReason ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.languageProgress.set(key, record);
      return record;
    },
    async findMany({ where }: any) {
      let rows = Array.from(db.languageProgress.values());
      if (where?.projectId) rows = rows.filter((row) => row.projectId === where.projectId);
      if (where?.languageCode) rows = rows.filter((row) => row.languageCode === where.languageCode);
      if (where?.transcriptionDone !== undefined) rows = rows.filter((row) => row.transcriptionDone === where.transcriptionDone);
      return rows;
    },
    async update({ where, data }: any) {
      const { projectId, languageCode } = where.projectId_languageCode;
      const key = progressKey(projectId, languageCode);
      const existing = db.languageProgress.get(key);
      if (!existing) throw new Error('Progress row not found');
      const next: ProjectLanguageProgress = {
        ...existing,
        ...data,
        disabled: data.disabled !== undefined ? data.disabled : existing.disabled,
        failedStep: data.failedStep !== undefined ? (data.failedStep ?? null) : existing.failedStep,
        failureReason: data.failureReason !== undefined ? (data.failureReason ?? null) : existing.failureReason,
        updatedAt: now(),
      };
      db.languageProgress.set(key, next);
      return next;
    },
    async updateMany({ where, data }: any) {
      let count = 0;
      for (const [key, record] of Array.from(db.languageProgress.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;
        if (where?.languageCode && record.languageCode !== where.languageCode) continue;
        const next: ProjectLanguageProgress = {
          ...record,
          ...data,
          disabled: data.disabled !== undefined ? data.disabled : record.disabled,
          failedStep: data.failedStep !== undefined ? (data.failedStep ?? null) : record.failedStep,
          failureReason: data.failureReason !== undefined ? (data.failureReason ?? null) : record.failureReason,
          updatedAt: now(),
        };
        db.languageProgress.set(key, next);
        count += 1;
      }
      return { count };
    },
  };

  const imageAsset = {
    async create({ data }: any) { const id = randomUUID(); const rec: ImageAsset = { id, projectId: data.projectId, path: data.path, publicUrl: data.publicUrl ?? null }; db.imageAssets.set(id, rec); return rec; },
    async findMany({ where, select }: any) {
      let rows = Array.from(db.imageAssets.values());
      if (where?.projectId) rows = rows.filter((r) => r.projectId === where.projectId);
      if (where?.id?.in) {
        const values = (where.id.in as string[]).filter((value) => typeof value === 'string');
        rows = rows.filter((r) => values.includes(r.id));
      }
      if (select) {
        return rows.map((row) => {
          const selected: any = {};
          if (select.id) selected.id = row.id;
          if (select.projectId) selected.projectId = row.projectId;
          if (select.path) selected.path = row.path;
          if (select.publicUrl) selected.publicUrl = row.publicUrl;
          return selected;
        });
      }
      return rows;
    },
    async deleteMany({ where }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.imageAssets.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;
        db.imageAssets.delete(id);
        count += 1;
      }
      return { count };
    },
  };

  const projectTemplateImage = {
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const rec: ProjectTemplateImage = {
        id,
        projectId: data.projectId,
        imageAssetId: data.imageAssetId,
        imageName: data.imageName,
        model: data.model,
        prompt: data.prompt,
        sentence: data.sentence ?? null,
        size: data.size ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.projectTemplateImages.set(id, rec);
      return rec;
    },
    async upsert({ where, create, update }: any) {
      const key = where.projectId_imageName;
      if (!key) throw new Error('projectTemplateImage upsert requires projectId_imageName');
      const existing = Array.from(db.projectTemplateImages.values())
        .find((row) => row.projectId === key.projectId && row.imageName === key.imageName);
      if (existing) {
        const next: ProjectTemplateImage = {
          ...existing,
          imageAssetId: update.imageAssetId ?? existing.imageAssetId,
          model: update.model ?? existing.model,
          prompt: update.prompt ?? existing.prompt,
          sentence: update.sentence !== undefined ? update.sentence : existing.sentence,
          size: update.size !== undefined ? update.size : existing.size,
          updatedAt: now(),
        };
        db.projectTemplateImages.set(existing.id, next);
        return next;
      }
      return projectTemplateImage.create({ data: create });
    },
    async deleteMany({ where }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.projectTemplateImages.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;
        if (where?.imageName?.notIn && Array.isArray(where.imageName.notIn)) {
          if (where.imageName.notIn.includes(record.imageName)) continue;
        }
        db.projectTemplateImages.delete(id);
        count += 1;
      }
      return { count };
    },
    async findMany({ where }: any) {
      let rows = Array.from(db.projectTemplateImages.values());
      if (where?.projectId) rows = rows.filter((row) => row.projectId === where.projectId);
      if (where?.imageName) rows = rows.filter((row) => row.imageName === where.imageName);
      if (where?.imageAssetId) rows = rows.filter((row) => row.imageAssetId === where.imageAssetId);
      return rows;
    },
  };

  const videoAsset = {
    async create({ data }: any) {
      const id = randomUUID();
      const rec: VideoAsset = {
        id,
        projectId: data.projectId,
        path: data.path,
        publicUrl: data.publicUrl ?? null,
        isFinal: !!data.isFinal,
        languageCode: (data as any).languageCode ?? null,
      };
      db.videoAssets.set(id, rec);
      return rec;
    },
    async deleteMany({ where }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.videoAssets.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;
        db.videoAssets.delete(id);
        count += 1;
      }
      return { count };
    },
    async updateMany({ where, data }: any) {
      let count = 0;
      for (const [id, record] of Array.from(db.videoAssets.entries())) {
        if (where?.projectId && record.projectId !== where.projectId) continue;

        let matchesLanguage = true;
        if (typeof where?.languageCode === 'string') {
          matchesLanguage = (record.languageCode ?? null) === where.languageCode;
        } else if (Array.isArray(where?.OR) && where.OR.length > 0) {
          matchesLanguage = where.OR.some((clause: any) => {
            const expected = clause.languageCode ?? null;
            return (record.languageCode ?? null) === (expected ?? null);
          });
        }
        if (!matchesLanguage) continue;

        const next: VideoAsset = {
          ...record,
          ...data,
        };
        db.videoAssets.set(id, next);
        count += 1;
      }
      return { count };
    },
  };

  const templateVoice = {
    async findMany({ where, orderBy, select }: any) {
      const applyWhere = (input: TemplateVoice[], clause: any): TemplateVoice[] => {
        let subset = [...input];
        if (clause?.isPublic !== undefined) {
          subset = subset.filter((voice) => voice.isPublic === clause.isPublic);
        }
        const ext = clause?.externalId;
        if (typeof ext === 'string') {
          subset = subset.filter((voice) => voice.externalId === ext);
        } else if (ext?.in && Array.isArray(ext.in)) {
          const values = (ext.in as unknown[]).filter((value): value is string => typeof value === 'string');
          subset = subset.filter((voice) => voice.externalId && values.includes(voice.externalId));
        } else if (ext?.equals && typeof ext.equals === 'string') {
          subset = subset.filter((voice) => voice.externalId === ext.equals);
        }
        return subset;
      };

      let rows = [...db.templateVoices];
      if (where?.OR && Array.isArray(where.OR) && where.OR.length > 0) {
        const collected = new Map<string, TemplateVoice>();
        for (const clause of where.OR) {
          for (const voice of applyWhere(db.templateVoices, clause)) {
            collected.set(voice.id, voice);
          }
        }
        rows = Array.from(collected.values());
      } else if (where) {
        rows = applyWhere(rows, where);
      }

      const orderClauses = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
      if (orderClauses.length > 0) {
        rows.sort((a, b) => {
          for (const clause of orderClauses) {
            if (clause.weight) {
              if (a.weight !== b.weight) {
                return clause.weight === 'asc' ? a.weight - b.weight : b.weight - a.weight;
              }
            } else if (clause.createdAt) {
              if (a.createdAt.getTime() === b.createdAt.getTime()) continue;
              return clause.createdAt === 'asc'
                ? a.createdAt.getTime() - b.createdAt.getTime()
                : b.createdAt.getTime() - a.createdAt.getTime();
            }
          }
          return 0;
        });
      }

      if (select) {
        return rows.map((voice) => {
          const out: any = {};
          for (const key of Object.keys(select)) {
            out[key] = (voice as any)[key];
          }
          return out;
        });
      }

      return rows;
    },
  };

  const scriptRequest = {
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const rec: ScriptRequest = {
        id,
        projectId: data.projectId,
        text: data.text,
        createdAt: now(),
      };
      db.scriptRequests.set(id, rec);
      return rec;
    },
  };

  const projectStatusHistory = {
    async create({ data }: any) { const id = randomUUID(); const rec: ProjectStatusHistory = { id, projectId: data.projectId, status: data.status, message: data.message ?? null, extra: data.extra ?? null, createdAt: now() }; db.projectStatusHistory.set(id, rec); return rec; },
    async findFirst({ where, orderBy }: any) {
      let rows = Array.from(db.projectStatusHistory.values()).filter(x => x.projectId === where.projectId && (where.status?.in ? (where.status.in as string[]).includes(x.status) : true));
      if (orderBy?.createdAt === 'desc') rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
      return rows[0] || null;
    }
  };

  const projectCharacterSelection = {
    async findUnique({ where }: any) { return db.projectSelections.get(where.projectId) || null; },
    async create({ data }: any) {
      const record = {
        projectId: data.projectId,
        userCharacterId: data.userCharacterId || null,
        userCharacterVariationId: data.userCharacterVariationId || null,
        characterId: data.characterId || null,
        characterVariationId: data.characterVariationId || null,
      };
      db.projectSelections.set(data.projectId, record);
      return record;
    },
    async upsert({ where, create, update }: any) {
      const existing = db.projectSelections.get(where.projectId);
      if (existing) {
        Object.assign(existing, update);
        db.projectSelections.set(where.projectId, existing);
        return existing;
      }
      const record = {
        projectId: create.projectId,
        userCharacterId: create.userCharacterId || null,
        userCharacterVariationId: create.userCharacterVariationId || null,
        characterId: create.characterId || null,
        characterVariationId: create.characterVariationId || null,
      };
      db.projectSelections.set(create.projectId, record);
      return record;
    },
  };

  function matchesUserCharacter(where: any, record: UserCharacter) {
    if (!where) return true;
    if (where.id && record.id !== where.id) return false;
    if (where.userId && record.userId !== where.userId) return false;
    if (typeof where.deleted === 'boolean' && record.deleted !== where.deleted) return false;
    return true;
  }
  function matchesUserCharacterVariation(where: any, record: UserCharacterVariation) {
    if (!where) return true;
    if (where.id && record.id !== where.id) return false;
    if (where.userCharacterId && record.userCharacterId !== where.userCharacterId) return false;
    if (typeof where.deleted === 'boolean' && record.deleted !== where.deleted) return false;
    if (where.userCharacter) {
      const parent = db.userCharacters.get(record.userCharacterId);
      if (!parent) return false;
      if (!matchesUserCharacter(where.userCharacter.where || where.userCharacter, parent)) return false;
    }
    return true;
  }

  const userCharacter = {
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const record: UserCharacter = {
        id,
        userId: data.userId,
        title: data.title ?? null,
        description: data.description ?? null,
        createdAt: now(),
        deleted: data.deleted ?? false,
        deletedAt: data.deletedAt ?? null,
      };
      db.userCharacters.set(id, record);
      return record;
    },
    async findFirst({ where, select }: any = {}) {
      const record = Array.from(db.userCharacters.values()).find((rec) => matchesUserCharacter(where, rec)) ?? null;
      if (!record) return null;
      if (!select) return record;
      const out: any = {};
      for (const key of Object.keys(select)) out[key] = (record as any)[key];
      return out;
    },
    async findUnique({ where, select }: any) {
      const record = db.userCharacters.get(where.id);
      if (!record) return null;
      if (!select) return record;
      const out: any = {};
      for (const key of Object.keys(select)) out[key] = (record as any)[key];
      return out;
    },
    async update({ where, data }: any) {
      const record = db.userCharacters.get(where.id);
      if (!record) throw new Error('UserCharacter not found');
      Object.assign(record, data);
      if ('deleted' in data && data.deleted && !data.deletedAt) {
        record.deletedAt = now();
      }
      db.userCharacters.set(record.id, record);
      return record;
    },
  };

  const userCharacterVariation = {
    async create({ data }: any) {
      const id = data.id || randomUUID();
      const record: UserCharacterVariation = {
        id,
        userCharacterId: data.userCharacterId,
        title: data.title ?? null,
        imagePath: data.imagePath ?? null,
        imageUrl: data.imageUrl ?? null,
        status: data.status ?? 'ready',
        source: data.source ?? null,
        createdAt: now(),
        deleted: data.deleted ?? false,
        deletedAt: data.deletedAt ?? null,
      };
      db.userCharacterVariations.set(id, record);
      return record;
    },
    async findFirst({ where, include, select }: any = {}) {
      const record = Array.from(db.userCharacterVariations.values()).find((rec) => matchesUserCharacterVariation(where, rec)) ?? null;
      if (!record) return null;
      let base: any = record;
      if (select) {
        base = {};
        for (const key of Object.keys(select)) base[key] = (record as any)[key];
      }
      if (include?.userCharacter) {
        base.userCharacter = db.userCharacters.get(record.userCharacterId) || null;
      }
      return base;
    },
    async findUnique({ where, include, select }: any) {
      const record = db.userCharacterVariations.get(where.id);
      if (!record) return null;
      let base: any = record;
      if (select) {
        base = {};
        for (const key of Object.keys(select)) base[key] = (record as any)[key];
      }
      if (include?.userCharacter) {
        base.userCharacter = db.userCharacters.get(record.userCharacterId) || null;
      }
      return base;
    },
    async update({ where, data }: any) {
      const record = db.userCharacterVariations.get(where.id);
      if (!record) throw new Error('UserCharacterVariation not found');
      Object.assign(record, data);
      if ('deleted' in data && data.deleted && !data.deletedAt) {
        record.deletedAt = now();
      }
      db.userCharacterVariations.set(record.id, record);
      return record;
    },
    async count({ where }: any = {}) {
      return Array.from(db.userCharacterVariations.values()).filter((rec) => matchesUserCharacterVariation(where, rec)).length;
    },
  };

  const user = {
    async findUnique({ where, select }: any) {
      let record: any = null;
      if (where?.id) {
        record = db.users.get(where.id) ?? null;
      } else if (where?.email) {
        const email = typeof where.email === 'string' ? where.email : null;
        if (email) {
          record = Array.from(db.users.values()).find((u) => u.email === email) ?? null;
        }
      }
      if (!record) return null;
      if (!select) return record;
      const out: any = {};
      for (const key of Object.keys(select)) {
        out[key] = (record as any)[key];
      }
      return out;
    },
    async update({ where, data }: any) {
      const existing = db.users.get(where.id);
      if (!existing) {
        throw new Error('User not found');
      }
      const next = typeof data === 'function' ? data(existing) : data;
      const updated = { ...existing, ...next };
      db.users.set(where.id, updated);
      return updated;
    },
  };

  const daemon = {
    async upsert({ where, create, update }: any) {
      const id = where.id;
      if (!id) throw new Error('Daemon upsert requires id');
      const existing = db.daemons.get(id);
      if (existing) {
        const next = {
          ...existing,
          ...update,
          lastSeenAt: update?.lastSeenAt instanceof Date ? update.lastSeenAt : existing.lastSeenAt,
          updatedAt: now(),
        };
        db.daemons.set(id, next);
        return next;
      }
      const createdAt = now();
      const record = {
        id,
        lastSeenAt: create?.lastSeenAt instanceof Date ? create.lastSeenAt : createdAt,
        createdAt,
        updatedAt: createdAt,
      };
      db.daemons.set(id, record);
      return record;
    },
  };

  async function $transaction(arg: any) {
    if (typeof arg === 'function') {
      return arg({
        project,
        job,
        script,
        audioCandidate,
        imageAsset,
        projectTemplateImage,
        videoAsset,
        projectStatusHistory,
        projectCharacterSelection,
        projectLanguageProgress,
        userCharacter,
        userCharacterVariation,
        user,
        templateVoice,
        scriptRequest,
        userSettings: {
          async findUnique() { return null; },
          async deleteMany() { return { count: 0 }; },
        },
      });
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    throw new Error('Unsupported $transaction usage');
  }

  return {
    _db: db,
    project,
    job,
    script,
    audioCandidate,
    imageAsset,
    projectTemplateImage,
    videoAsset,
    projectStatusHistory,
    projectCharacterSelection,
    projectLanguageProgress,
    userCharacter,
    userCharacterVariation,
    user,
    templateVoice,
    $transaction,
    scriptRequest,
    daemon,
    userSettings: {
      async findUnique({ where }: any) {
        return {
          userId: where?.userId || 'u1',
          includeDefaultMusic: true,
          addOverlay: true,
          autoApproveScript: true,
          autoApproveAudio: true,
          watermarkEnabled: false,
          captionsEnabled: true,
          targetLanguages: ['en'],
          audioStyleGuidanceEnabled: false,
          audioStyleGuidance: '',
        };
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
  };
}
