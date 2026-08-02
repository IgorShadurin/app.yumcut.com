#!/usr/bin/env node
import path from 'node:path';
import dotenv from 'dotenv';
import { Resend } from 'resend';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const EVENT_NAME = process.env.RESEND_MARKETING_EVENT_NAME?.trim() || 'yumcut.marketing.email.v1';
const TEMPLATE_NAME = 'YumCut provider marketing email v1';
const TEMPLATE_ALIAS = 'yumcut-provider-marketing-v1';
const AUTOMATION_NAME = 'YumCut provider marketing delivery v1';
const BODY_KEYS = Array.from({ length: 10 }, (_unused, index) => `body_${String(index + 1).padStart(2, '0')}`);

function requiredEnv(name: 'RESEND_API_KEY' | 'RESEND_FROM_EMAIL' | 'RESEND_MARKETING_REPLY_TO_EMAIL'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function unwrap<T>(response: { data: T | null; error: { message: string } | null }, action: string): T {
  if (response.error || !response.data) {
    throw new Error(`${action}: ${response.error?.message || 'Resend returned no data.'}`);
  }
  return response.data;
}

async function main() {
  const resend = new Resend(requiredEnv('RESEND_API_KEY'));
  const from = requiredEnv('RESEND_FROM_EMAIL');
  const replyTo = requiredEnv('RESEND_MARKETING_REPLY_TO_EMAIL');

  const events = unwrap(await resend.events.list({ limit: 100 }), 'Unable to list Resend events');
  let eventId = events.data.find((event) => event.name === EVENT_NAME)?.id;
  if (!eventId) {
    const event = unwrap(await resend.events.create({
      name: EVENT_NAME,
      schema: {
        subject: 'string',
        source_id: 'string',
        ...Object.fromEntries(BODY_KEYS.map((key) => [key, 'string' as const])),
      },
    }), 'Unable to create Resend event');
    eventId = event.id;
  }

  const bodyHtml = BODY_KEYS.map((key) => `{{{${key.toUpperCase()}}}}`).join('');
  const bodyText = BODY_KEYS.map((key) => `{{{${key.toUpperCase()}}}}`).join('');
  const templateOptions = {
    name: TEMPLATE_NAME,
    alias: TEMPLATE_ALIAS,
    from,
    replyTo,
    subject: '{{{SUBJECT}}}',
    html: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#172033"><div style="white-space:pre-wrap">${bodyHtml}</div><div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6b7280">Unsubscribe</a></div></div>`,
    text: `${bodyText}\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
    variables: [
      { key: 'SUBJECT', type: 'string' as const },
      ...BODY_KEYS.map((key) => ({ key: key.toUpperCase(), type: 'string' as const, fallbackValue: '' })),
    ],
  };

  const templates = unwrap(await resend.templates.list({ limit: 100 }), 'Unable to list Resend templates');
  const existingTemplate = templates.data.find((template) => template.alias === TEMPLATE_ALIAS || template.name === TEMPLATE_NAME);
  let templateId = existingTemplate?.id;
  if (templateId) {
    unwrap(await resend.templates.update(templateId, templateOptions), 'Unable to update Resend template');
    unwrap(await resend.templates.publish(templateId), 'Unable to publish Resend template');
  } else {
    const createdTemplate = unwrap(await resend.templates.create(templateOptions), 'Unable to create Resend template');
    templateId = createdTemplate.id;
    unwrap(await resend.templates.publish(templateId), 'Unable to publish Resend template');
  }

  const steps = [
    { key: 'start', type: 'trigger' as const, config: { eventName: EVENT_NAME } },
    {
      key: 'send',
      type: 'send_email' as const,
      config: {
        template: {
          id: templateId,
          variables: {
            SUBJECT: { var: 'event.subject' },
            ...Object.fromEntries(BODY_KEYS.map((key) => [key.toUpperCase(), { var: `event.${key}` }])),
          },
        },
      },
    },
  ];
  const connections = [{ from: 'start', to: 'send' }];
  const automations = unwrap(await resend.automations.list({ limit: 100 }), 'Unable to list Resend automations');
  const existingAutomation = automations.data.find((automation) => automation.name === AUTOMATION_NAME);
  let automationId = existingAutomation?.id;
  if (automationId) {
    if (existingAutomation?.status === 'enabled') {
      unwrap(await resend.automations.update(automationId, {
        status: 'disabled',
      }), 'Unable to disable the existing Resend automation for update');
    }
    unwrap(await resend.automations.update(automationId, {
      status: 'enabled',
      steps,
      connections,
    }), 'Unable to update Resend automation');
  } else {
    const automation = unwrap(await resend.automations.create({
      name: AUTOMATION_NAME,
      status: 'enabled',
      steps,
      connections,
    }), 'Unable to create Resend automation');
    automationId = automation.id;
  }

  console.log(JSON.stringify({ eventName: EVENT_NAME, eventId, templateId, automationId, status: 'enabled' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
