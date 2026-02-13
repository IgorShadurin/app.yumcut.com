import * as crypto from 'node:crypto';

export const QWEN_DEFAULT_NEGATIVE_PROMPT =
  'text, letters, numbers, captions, logos, watermarks, typography';

const RUNWARE_LORA_DEFAULT = { model: 'runware:108@8', weight: 1 } as const;

export type RunwareTextToImageParams = {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  scheduler?: string;
  negativePrompt?: string;
  includeCost?: boolean;
  checkNSFW?: boolean;
  loras?: Array<{ model: string; weight?: number }>;
  outputFormat?: 'jpg' | 'png' | 'webp';
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Runware image fetch failed ${response.status}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function extractRunwareImageBytes(
  json: any,
  fetchImpl: typeof fetch = fetch
): Promise<Uint8Array | undefined> {
  if (!json) return undefined;
  const data = Array.isArray(json?.data) ? json.data : undefined;
  const first = data && data.length > 0 ? data[0] : undefined;
  if (!first || typeof first !== 'object') return undefined;

  const url = first?.imageURL || first?.url;
  if (isNonEmptyString(url)) {
    try {
      return await fetchBytes(url, fetchImpl);
    } catch {}
  }

  const dataUri = first?.imageDataURI || first?.dataURI;
  if (isNonEmptyString(dataUri)) {
    try {
      const encoded = dataUri.startsWith('data:image/')
        ? (dataUri.split(',')[1] || '')
        : dataUri;
      return new Uint8Array(Buffer.from(encoded, 'base64'));
    } catch {}
  }

  const base64 = first?.imageBase64Data || first?.base64Data;
  if (isNonEmptyString(base64)) {
    try {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    } catch {}
  }

  return undefined;
}

export function defaultRunwarePromptPayload(params: RunwareTextToImageParams) {
  const {
    prompt,
    model = 'runware:108@1',
    width = 576,
    height = 1024,
    steps = 8,
    cfgScale = 1,
    scheduler = 'UniPC',
    negativePrompt = QWEN_DEFAULT_NEGATIVE_PROMPT,
    includeCost = true,
    checkNSFW = false,
    loras,
    outputFormat = 'jpg',
  } = params;

  const loraList =
    loras === undefined
      ? model.startsWith('runware:108@')
        ? [{ ...RUNWARE_LORA_DEFAULT }]
        : []
      : loras.length > 0
        ? loras.map((l) => ({ model: l.model, weight: l.weight ?? 1 }))
        : [];

  return [
    {
      taskType: 'imageInference',
      taskUUID: crypto.randomUUID(),
      model,
      numberResults: 1,
      width,
      height,
      steps,
      outputType: 'URL',
      outputFormat,
      includeCost,
      checkNSFW,
      cfgScale,
      scheduler,
      positivePrompt: prompt,
      negativePrompt,
      ...(loraList.length > 0 ? { lora: loraList } : {}),
    },
  ] as const;
}

export async function requestRunwareImage(params: {
  apiKey: string;
  prompt: string;
  width: number;
  height: number;
  model: string;
  negativePrompt?: string;
}): Promise<{ imageBytes: Uint8Array; responseJson: any }> {
  const payload = defaultRunwarePromptPayload({
    prompt: params.prompt,
    model: params.model,
    width: params.width,
    height: params.height,
    negativePrompt: params.negativePrompt,
    outputFormat: 'jpg',
  });
  const response = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Runware request failed ${response.status}: ${text}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Runware response was not valid JSON.');
  }
  const imageBytes = await extractRunwareImageBytes(json);
  if (!imageBytes) {
    throw new Error('Runware did not return image data.');
  }
  return { imageBytes, responseJson: json };
}
