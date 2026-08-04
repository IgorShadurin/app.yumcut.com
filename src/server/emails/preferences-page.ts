type PreferencesPageInput = {
  token: string;
  email?: string | null;
  subscribed?: boolean;
  suppressed?: boolean;
  message?: 'saved' | 'unsubscribed' | 'suppressed' | 'not_found';
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, Math.min(8, local.length - 2)))}@${domain}`;
}

export function renderPreferencesPage(input: PreferencesPageInput): Response {
  const notFound = input.message === 'not_found';
  const status = notFound ? 404 : 200;
  const token = encodeURIComponent(input.token);
  const email = escapeHtml(maskEmail(input.email));
  const notice = input.message === 'unsubscribed'
    ? 'You have been unsubscribed from marketing emails.'
    : input.message === 'saved'
      ? 'Your email preferences were saved.'
      : input.message === 'suppressed'
        ? 'This address cannot be subscribed because delivery previously failed.'
        : '';
  const body = notFound
    ? '<h1>Link not found</h1><p>This preference link is invalid or no longer available.</p>'
    : `<h1>Email preferences</h1><p>Marketing email settings for <strong>${email}</strong>.</p>${notice ? `<p class="notice">${notice}</p>` : ''}<form method="post" action="/manage/${token}"><label><input type="checkbox" name="subscribed" value="true" ${input.subscribed ? 'checked' : ''} ${input.suppressed ? 'disabled' : ''}> Receive product news, tips and newsletters</label><button type="submit">Save preferences</button></form>${input.subscribed ? `<form method="post" action="/unsubscribe/${token}"><button class="link" type="submit">Unsubscribe from marketing emails</button></form>` : ''}<p class="small">Transactional emails required to provide the service are not affected by this setting.</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Email preferences · YumCut</title><style>body{margin:0;background:#fff7ed;color:#172033;font:16px/1.55 system-ui,-apple-system,sans-serif}.card{max-width:560px;margin:10vh auto;padding:32px;background:#fff;border:1px solid #fed7aa;border-radius:20px;box-shadow:0 12px 35px #9a34121a}h1{margin:0 0 12px}form{margin-top:24px}label{display:flex;gap:10px;align-items:flex-start}button{margin-top:20px;padding:11px 18px;border:0;border-radius:10px;background:#ea580c;color:#fff;font-weight:700;cursor:pointer}.link{margin-top:12px;padding:0;background:transparent;color:#9a3412;text-decoration:underline}.notice{padding:12px;border-radius:10px;background:#ecfdf5;color:#166534}.small{margin-top:28px;color:#64748b;font-size:13px}@media(max-width:640px){.card{margin:0;min-height:100vh;border:0;border-radius:0;box-shadow:none}}</style></head><body><main class="card">${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
