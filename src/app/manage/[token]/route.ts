import { NextRequest } from 'next/server';
import { findEmailContactByPreferenceToken, setEmailMarketingSubscription } from '@/server/emails/contacts';
import { renderPreferencesPage } from '@/server/emails/preferences-page';

type Params = { token: string };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { token } = await params;
  const contact = await findEmailContactByPreferenceToken(token);
  return renderPreferencesPage(contact ? {
    token,
    email: contact.email,
    subscribed: contact.marketingSubscribed,
    suppressed: Boolean(contact.suppressedAt),
  } : { token, message: 'not_found' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { token } = await params;
  const form = await req.formData();
  const result = await setEmailMarketingSubscription(token, form.get('subscribed') === 'true');
  if (result.status === 'not_found') return renderPreferencesPage({ token, message: 'not_found' });
  return renderPreferencesPage({
    token,
    email: result.contact.email,
    subscribed: result.contact.marketingSubscribed,
    suppressed: Boolean(result.contact.suppressedAt),
    message: result.status === 'suppressed' ? 'suppressed' : 'saved',
  });
}
