import { AuthError, createAdminClient, requireAuth } from "../_shared/auth.ts";
import { EmailNotConfiguredError, isEmailConfigured, renderEmail, resolveAppUrl, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EPISODE_RE = /^EP[0-9]{3,}$/;

type Action = "status" | "test" | "role_granted" | "role_revoked" | "episode_released";

interface Body {
  action?: Action;
  userId?: string;
  episodeId?: string;
}

/**
 * Admin system notifications.
 * - status: is the email sender configured (any admin)
 * - test: send a test email to yourself (any admin)
 * - role_granted / role_revoked { userId }: tell a user their admin access changed (founder only)
 * - episode_released { episodeId }: tell the other admins an episode went live or was scheduled (any admin)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const caller = await requireAuth(req);
    const admin = createAdminClient();
    const { data: callerRole, error: roleError } = await admin.from("admin_users").select("role").eq("user_id", caller.id).maybeSingle();
    if (roleError) throw roleError;
    if (!callerRole) return json({ error: "Admin access required." }, 403);
    const isFounder = callerRole.role === "founder";

    const body = (await req.json().catch(() => ({}))) as Body;
    const appUrl = resolveAppUrl(req);
    const callerName = (caller.user_metadata?.display_name as string | undefined) ?? caller.email?.split("@")[0] ?? "An admin";

    if (body.action === "status") return json({ ok: true, configured: isEmailConfigured() });
    if (!isEmailConfigured()) return json({ ok: false, code: "EMAIL_NOT_CONFIGURED", error: "The email sender isn't set up yet." }, 503);

    switch (body.action) {
      case "test": {
        if (!caller.email) return json({ error: "Your account has no email address." }, 400);
        const { html, text } = renderEmail({
          preheader: "Email delivery for The Vault is working.",
          kicker: "Delivery check",
          title: "Your email sender is working",
          paragraphs: [
            "This is a test from the Admin Hub. If you can read it, password resets, sign-up confirmations and admin notifications will reach your players and team.",
            `Sent ${new Date().toUTCString()}.`,
          ],
          cta: appUrl ? { label: "Open the Admin Hub", url: `${appUrl}/admin` } : undefined,
        });
        await sendEmail({ to: caller.email, subject: "Test email from The Vault", html, text });
        return json({ ok: true, sent: 1, to: caller.email });
      }

      case "role_granted":
      case "role_revoked": {
        if (!isFounder) return json({ error: "Only the founding admin can send role notifications." }, 403);
        if (!body.userId || !UUID_RE.test(body.userId)) return json({ error: "Missing user." }, 400);
        const { data: roleRow } = await admin.from("admin_users").select("role").eq("user_id", body.userId).maybeSingle();
        const granted = body.action === "role_granted";
        if (granted !== Boolean(roleRow)) return json({ error: "That role change didn't happen." }, 409);
        const { data: target, error: targetError } = await admin.auth.admin.getUserById(body.userId);
        if (targetError || !target.user?.email) return json({ error: "User not found." }, 404);
        const name = (target.user.user_metadata?.display_name as string | undefined) ?? target.user.email.split("@")[0];
        const { html, text } = granted
          ? renderEmail({
              preheader: "You can now edit and release episodes.",
              kicker: "Admin access",
              title: `You're an admin now, ${name}`,
              paragraphs: [
                `${callerName} gave your account admin access to The Vault. You can edit episodes, import questions in bulk and schedule releases from the Admin Hub.`,
                "Sign in with the same email and password you use to play.",
              ],
              cta: appUrl ? { label: "Open the Admin Hub", url: `${appUrl}/admin/login` } : undefined,
            })
          : renderEmail({
              preheader: "Your admin access was removed.",
              kicker: "Admin access",
              title: "Your admin access was removed",
              paragraphs: [
                `${callerName} removed admin access from your account. Your player account, runs and progress are unchanged.`,
                "If you think this was a mistake, contact the founding admin.",
              ],
            });
        await sendEmail({
          to: target.user.email,
          subject: granted ? "You've been made a Vault admin" : "Your Vault admin access was removed",
          html,
          text,
        });
        return json({ ok: true, sent: 1 });
      }

      case "episode_released": {
        if (!body.episodeId || !EPISODE_RE.test(body.episodeId)) return json({ error: "Missing episode." }, 400);
        const { data: ep, error: epError } = await admin.from("episodes").select("id, title, status, publish_at").eq("id", body.episodeId).maybeSingle();
        if (epError) throw epError;
        if (!ep || ep.status === "draft") return json({ error: "That episode isn't released." }, 409);

        const { data: roster, error: rosterError } = await admin.from("admin_users").select("user_id");
        if (rosterError) throw rosterError;
        const recipients: string[] = [];
        for (const row of roster ?? []) {
          if (row.user_id === caller.id) continue;
          const { data: u } = await admin.auth.admin.getUserById(row.user_id);
          if (u.user?.email) recipients.push(u.user.email);
        }
        if (recipients.length === 0) return json({ ok: true, sent: 0 });

        const when = ep.publish_at ? new Date(ep.publish_at) : new Date();
        const isLive = when.getTime() <= Date.now();
        const whenLabel = when.toUTCString().replace(" GMT", " UTC");
        const { html, text } = renderEmail({
          preheader: isLive ? `${ep.id} is live for players.` : `${ep.id} is scheduled for ${whenLabel}.`,
          kicker: isLive ? "Episode live" : "Episode scheduled",
          title: `${ep.id} · ${ep.title}`,
          paragraphs: [
            isLive
              ? `${callerName} published ${ep.id} "${ep.title}". Players will see it the next time they open The Vault.`
              : `${callerName} scheduled ${ep.id} "${ep.title}" to go live on ${whenLabel}.`,
          ],
          cta: appUrl ? { label: "Review in the Admin Hub", url: `${appUrl}/admin/episodes/${ep.id}` } : undefined,
          footnote: "You're getting this because you're an admin of The Vault.",
        });
        // One message per admin so addresses aren't exposed to each other.
        let sent = 0;
        for (const to of recipients) {
          try {
            await sendEmail({ to, subject: isLive ? `${ep.id} is live` : `${ep.id} scheduled`, html, text });
            sent += 1;
          } catch (err) {
            console.error("release notice failed", err instanceof Error ? err.message : "unknown");
          }
        }
        return json({ ok: true, sent });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "Unauthorized" }, 401);
    if (err instanceof EmailNotConfiguredError) return json({ ok: false, code: "EMAIL_NOT_CONFIGURED", error: "The email sender isn't set up yet." }, 503);
    console.error("admin-notify failed", err instanceof Error ? err.message : "unknown");
    return json({ error: "Couldn't send the email. Check the sender settings and try again." }, 500);
  }
});
