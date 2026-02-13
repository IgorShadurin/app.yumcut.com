import { describe, expect, it } from 'vitest';
import { validateProjectState } from '@/shared/projects';

describe('validateProjectState', () => {
  it('blocks exact-script when any enabled language uses Inworld over the limit', () => {
    const res = validateProjectState({
      mode: 'script',
      text: 'a'.repeat(2001),
      enabledLanguages: ['en'],
      languageVoiceProvidersByLanguage: { en: 'inworld' },
      templateCustomData: null,
      limits: { inworldExactScriptMax: 2000, minimaxExactScriptMax: 5000, elevenlabsExactScriptMax: 5100 },
    });
    expect(res.disabled.submit).toBe(true);
    expect(res.fieldErrors.text).toMatch(/But Inworld audio provider supports only up to 2000 symbols/i);
    expect(res.issues[0]?.code).toBe('INWORLD_EXACT_SCRIPT_TOO_LONG');
  });

  it('blocks exact-script when any enabled language uses Minimax over the limit', () => {
    const res = validateProjectState({
      mode: 'script',
      text: 'a'.repeat(5001),
      enabledLanguages: ['en'],
      languageVoiceProvidersByLanguage: { en: 'minimax' },
      templateCustomData: null,
      limits: { inworldExactScriptMax: 2000, minimaxExactScriptMax: 5000, elevenlabsExactScriptMax: 5100 },
    });
    expect(res.disabled.submit).toBe(true);
    expect(res.fieldErrors.text).toMatch(/But Minimax audio provider supports only up to 5000 symbols/i);
    expect(res.issues[0]?.code).toBe('MINIMAX_EXACT_SCRIPT_TOO_LONG');
  });

  it('blocks exact-script when any enabled language uses ElevenLabs over the limit', () => {
    const res = validateProjectState({
      mode: 'script',
      text: 'a'.repeat(5101),
      enabledLanguages: ['en'],
      languageVoiceProvidersByLanguage: { en: 'elevenlabs' },
      templateCustomData: null,
      limits: { inworldExactScriptMax: 2000, minimaxExactScriptMax: 5000, elevenlabsExactScriptMax: 5100 },
    });
    expect(res.disabled.submit).toBe(true);
    expect(res.fieldErrors.text).toMatch(/But ElevenLabs audio provider supports only up to 5100 symbols/i);
    expect(res.issues[0]?.code).toBe('ELEVENLABS_EXACT_SCRIPT_TOO_LONG');
  });

  it('does not block when Inworld is only set for a non-enabled language', () => {
    const res = validateProjectState({
      mode: 'script',
      text: 'a'.repeat(2001),
      enabledLanguages: ['en'],
      languageVoiceProvidersByLanguage: { es: 'inworld' },
      templateCustomData: null,
      limits: { inworldExactScriptMax: 2000, minimaxExactScriptMax: 5000, elevenlabsExactScriptMax: 5100 },
    });
    expect(res.disabled.submit).toBe(false);
    expect(res.fieldErrors.text).toBeUndefined();
    expect(res.issues).toHaveLength(0);
  });

  it('disables characters and auto-approve toggles for v2 templates without adding errors', () => {
    const res = validateProjectState({
      mode: 'idea',
      text: 'hello',
      enabledLanguages: ['en'],
      languageVoiceProvidersByLanguage: { en: 'inworld' },
      templateCustomData: {
        type: 'custom',
        raw: {},
        customId: 'x',
        supportsCustomCharacters: false,
        supportsExactText: true,
        supportsScriptPrompt: true,
      },
      limits: { inworldExactScriptMax: 2000, minimaxExactScriptMax: 5000, elevenlabsExactScriptMax: 5100 },
    });
    expect(res.issues).toHaveLength(0);
    expect(res.disabled.characters).toBe(true);
    expect(res.disabled.autoApproveScript).toBe(true);
    expect(res.disabled.autoApproveAudio).toBe(true);
  });
});
