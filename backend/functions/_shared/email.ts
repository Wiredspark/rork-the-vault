/**
 * Transactional email via Resend (https://resend.com).
 * Secrets: RESEND_API_KEY, EMAIL_FROM_ADDRESS (an address on a domain verified in Resend).
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sender is not configured");
    this.name = "EmailNotConfiguredError";
  }
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

const SENDER_NAME = "The Vault";

export function isEmailConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("EMAIL_FROM_ADDRESS"));
}

/** Sends one email through Resend. Throws on configuration or delivery errors. */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<string> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM_ADDRESS");
  if (!apiKey || !from) throw new EmailNotConfiguredError();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${SENDER_NAME} <${from}>`, to: Array.isArray(to) ? to : [to], subject, html, text }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    console.error("resend send failed", res.status, body?.name ?? "unknown");
    throw new Error(body?.message ?? `Resend responded ${res.status}`);
  }
  return body.id ?? "";
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export interface EmailLayout {
  preheader: string;
  kicker: string;
  title: string;
  /** Paragraphs of plain text (escaped for HTML). */
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote?: string;
}

/** Branded dark/gold email shell with inline styles (email-client safe). Returns html + text. */
export function renderEmail({ preheader, kicker, title, paragraphs, cta, footnote }: EmailLayout): { html: string; text: string } {
  const p = paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#E9E2D0;">${escapeHtml(t)}</p>`)
    .join("");
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:#CFAB5C;">
<a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#0B1210;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#8F9A93;">Button not working? Paste this link into your browser:<br><span style="color:#CFAB5C;word-break:break-all;">${escapeHtml(cta.url)}</span></p>`
    : "";
  const note = footnote ? `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:#8F9A93;">${escapeHtml(footnote)}</p>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0B1210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1210;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;font-size:12px;font-weight:700;letter-spacing:0.42em;color:#CFAB5C;">THE VAULT</td></tr>
<tr><td style="background:#111A17;border:1px solid #2A332E;border-radius:16px;padding:32px 28px;">
<p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:#CFAB5C;">${escapeHtml(kicker)}</p>
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;font-weight:700;color:#F5EEDC;">${escapeHtml(title)}</h1>
${p}${button}${note}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#5E6A63;">Different genres. Same higher stakes.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [kicker.toUpperCase(), "", title, "", ...paragraphs.flatMap((t) => [t, ""]), cta ? `${cta.label}: ${cta.url}` : "", footnote ?? "", "", "— The Vault"]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();

  return { html, text };
}

/**
 * Resolves the app's public origin for links: APP_URL secret if set, otherwise the caller's
 * Origin header when it's a Rork-hosted https origin.
 */
export function resolveAppUrl(req: Request): string | null {
  const configured = Deno.env.get("APP_URL")?.replace(/\/+$/, "");
  if (configured) return configured;
  const origin = req.headers.get("origin") ?? "";
  if (/^https:\/\/[a-z0-9-]+\.rork\.(live|app)$/i.test(origin)) return origin;
  return null;
}
