type JsonObject = Record<string, unknown>;

export type TemplateCustomDataBase = {
  type: string;
  raw: JsonObject;
};

export type CustomTemplateCustomData = TemplateCustomDataBase & {
  type: 'custom';
  customId: string;
  supportsCustomCharacters: boolean;
  supportsExactText: boolean; // allow “Exact script” mode: daemon saves user provided narration and launches template with --user-text
  supportsScriptPrompt: boolean; // allow user guidance prompts; when false we ignore creation/avoidance hints
};

export type TemplateCustomData = CustomTemplateCustomData | TemplateCustomDataBase;

export function normalizeTemplateCustomData(raw: unknown): TemplateCustomData | null {
  if (!isJsonObject(raw)) {
    return null;
  }
  const typeValue = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!typeValue) {
    return null;
  }
  const normalizedRaw = raw as JsonObject;
  if (typeValue !== 'custom') {
    return {
      type: typeValue,
      raw: normalizedRaw,
    } satisfies TemplateCustomDataBase;
  }
  const customId = typeof raw.customId === 'string' ? raw.customId.trim() : '';
  if (!customId) {
    return null;
  }
  return {
    type: 'custom',
    raw: normalizedRaw,
    customId,
    supportsCustomCharacters: coerceBoolean(raw.supportsCustomCharacters, false),
    supportsExactText: coerceBoolean(raw.supportsExactText, false),
    supportsScriptPrompt: coerceBoolean(raw.supportsScriptPrompt, false),
  } satisfies CustomTemplateCustomData;
}

export function isCustomTemplateData(data: TemplateCustomData | null | undefined): data is CustomTemplateCustomData {
  return !!data && data.type === 'custom';
}

export function templateSupportsCustomCharacters(data: TemplateCustomData | null | undefined): boolean {
  return isCustomTemplateData(data) ? data.supportsCustomCharacters : false;
}

export function templateSupportsExactText(data: TemplateCustomData | null | undefined): boolean {
  return isCustomTemplateData(data) ? data.supportsExactText : false;
}

export function templateSupportsScriptPrompt(data: TemplateCustomData | null | undefined): boolean {
  return isCustomTemplateData(data) ? data.supportsScriptPrompt : false;
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return fallback;
    return value !== 0;
  }
  return fallback;
}
