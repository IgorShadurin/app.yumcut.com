import type { TemplateCustomData } from '@/shared/templates/custom-data';
import { VOICE_PROVIDER_LABELS } from '@/shared/constants/voice-providers';

export type ProjectStateValidationIssue = {
  code: 'INWORLD_EXACT_SCRIPT_TOO_LONG' | 'MINIMAX_EXACT_SCRIPT_TOO_LONG' | 'ELEVENLABS_EXACT_SCRIPT_TOO_LONG';
  field: 'text';
  message: string;
};

export type ProjectStateValidationInput = {
  mode: 'idea' | 'script';
  text: string;
  enabledLanguages: string[];
  languageVoiceProvidersByLanguage?: Record<string, string | null | undefined>;
  templateCustomData?: TemplateCustomData | null;
  limits: {
    inworldExactScriptMax: number;
    minimaxExactScriptMax: number;
    elevenlabsExactScriptMax: number;
  };
};

export type ProjectStateValidationResult = {
  issues: ProjectStateValidationIssue[];
  fieldErrors: {
    text?: string;
  };
  disabled: {
    submit: boolean;
    characters: boolean;
    autoApproveScript: boolean;
    autoApproveAudio: boolean;
  };
};

export function validateProjectState(input: ProjectStateValidationInput): ProjectStateValidationResult {
  const enabledLanguages = Array.isArray(input.enabledLanguages) ? input.enabledLanguages : [];
  const providers = input.languageVoiceProvidersByLanguage ?? {};
  const isV2Template = input.templateCustomData?.type === 'custom';

  const issues: ProjectStateValidationIssue[] = [];

  const text = (input.text ?? '').trim();
  const textLength = text.length;

  const providerLimits: Record<string, { max: number; label: string; code: ProjectStateValidationIssue['code'] }> = {
    inworld: { max: input.limits.inworldExactScriptMax, label: VOICE_PROVIDER_LABELS.inworld, code: 'INWORLD_EXACT_SCRIPT_TOO_LONG' },
    minimax: { max: input.limits.minimaxExactScriptMax, label: VOICE_PROVIDER_LABELS.minimax, code: 'MINIMAX_EXACT_SCRIPT_TOO_LONG' },
    elevenlabs: { max: input.limits.elevenlabsExactScriptMax, label: VOICE_PROVIDER_LABELS.elevenlabs, code: 'ELEVENLABS_EXACT_SCRIPT_TOO_LONG' },
  };

  if (input.mode === 'script') {
    for (const languageCode of enabledLanguages) {
      const provider = (providers[languageCode] ?? '').toString().toLowerCase();
      const entry = providerLimits[provider];
      if (!entry) continue;
      if (textLength > entry.max) {
        issues.push({
          code: entry.code,
          field: 'text',
          message: `But ${entry.label} audio provider supports only up to ${entry.max} symbols in the text script.`,
        });
        break;
      }
    }
  }

  const fieldErrors: ProjectStateValidationResult['fieldErrors'] = {};
  for (const issue of issues) {
    if (issue.field === 'text') {
      fieldErrors.text = issue.message;
      break;
    }
  }

  return {
    issues,
    fieldErrors,
    disabled: {
      submit: issues.length > 0,
      characters: isV2Template,
      autoApproveScript: isV2Template,
      autoApproveAudio: isV2Template,
    },
  };
}
