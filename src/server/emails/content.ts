function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyEscapedText(value: string): string {
  return value.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const trailing = match.match(/[),.;!?]+$/)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `<a href="${url}" style="color:#c2410c">${url}</a>${trailing}`;
  });
}

function preferencesLinks(preferencesOrigin: string, contactId: string) {
  const origin = preferencesOrigin.replace(/\/$/, '');
  return {
    manageUrl: `${origin}/manage/${encodeURIComponent(contactId)}`,
    unsubscribeUrl: `${origin}/unsubscribe/${encodeURIComponent(contactId)}`,
  };
}

export function renderEmailContent(input: {
  text: string;
  marketing: boolean;
  contactId?: string;
  preferencesOrigin?: string;
  obfuscatePreferencePaths?: boolean;
}): { text: string; html: string; headers: Record<string, string> } {
  const paragraphs = escapeHtml(input.text.trim())
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px">${linkifyEscapedText(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

  if (!input.marketing) {
    return {
      text: input.text.trim(),
      html: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#172033">${paragraphs}</div>`,
      headers: {},
    };
  }

  if (!input.contactId || !input.preferencesOrigin) {
    throw new Error('Marketing email requires a local contact token and preferences URL.');
  }

  const { manageUrl, unsubscribeUrl } = preferencesLinks(input.preferencesOrigin, input.contactId);
  const htmlManageUrl = input.obfuscatePreferencePaths ? manageUrl.replace('/manage/', '/man&#97;ge/') : manageUrl;
  const htmlUnsubscribeUrl = input.obfuscatePreferencePaths
    ? unsubscribeUrl.replace('/unsubscribe/', '/unsub&#115;cribe/')
    : unsubscribeUrl;
  const footer = `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">You can <a href="${htmlManageUrl}" style="color:#6b7280">manage email preferences</a> or <a href="${htmlUnsubscribeUrl}" style="color:#6b7280">unsubscribe</a>.</div>`;

  return {
    text: `${input.text.trim()}\n\nManage email preferences: ${manageUrl}\nUnsubscribe: ${unsubscribeUrl}`,
    html: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#172033">${paragraphs}${footer}</div>`,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
