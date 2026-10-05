import { AuthError, createAdminClient, requireAuth } from "../_shared/auth.ts";
import { isEmailConfigured, renderEmail, resolveAppUrl, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Founder-only: creates a confirmed email/password account, grants it the admin role and
 * emails a welcome message with a one-time "set your password" link (when email is configured).
 * Body: { email, password, displayName }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const caller = await requireAuth(req);
    const admin = createAdminClient();

    const { data: callerRole, error: roleError } = await admin
      .from("admin_users")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (callerRole?.role !== "founder") return json({ error: "Only the founding admin can create admin accounts." }, 403);

    const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown; displayName?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 60) : "";

    if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 10) return json({ error: "Temporary password must be at least 10 characters." }, 400);
    if (!displayName) return json({ error: "Enter a display name." }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createError || !created.user) {
      const message = createError?.message?.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return json({ error: "An account with this email already exists. Use Promote instead." }, 409);
      }
      throw createError ?? new Error("createUser returned no user");
    }

    const userId = created.user.id;
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: userId, email, display_name: displayName }, { onConflict: "id" });
    if (profileError) console.warn("profile upsert failed", profileError.code);

    const { error: grantError } = await admin
      .from("admin_users")
      .insert({ user_id: userId, role: "admin", granted_by: caller.id });
    if (grantError) throw grantError;

    let emailSent = false;
    if (isEmailConfigured()) {
      try {
        const appUrl = resolveAppUrl(req);
        const { data: link, error: linkError } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: appUrl ? { redirectTo: `${appUrl}/auth` } : undefined,
        });
        if (linkError) throw linkError;
        const inviter = (caller.user_metadata?.display_name as string | undefined) ?? "The founding admin";
        const { html, text } = renderEmail({
          preheader: "You have admin access to The Vault. Set your password to get started.",
          kicker: "Admin access",
          title: `Welcome to the Admin Hub, ${displayName}`,
          paragraphs: [
            `${inviter} created an admin account for you on The Vault. You can now edit episodes, run bulk imports and schedule releases.`,
            "Set your own password with the button below. The link works once and expires in an hour. After that, sign in at the Admin Hub with this email.",
          ],
          cta: { label: "Set my password", url: link.properties.action_link },
          footnote: appUrl ? `Admin Hub: ${appUrl}/admin/login` : "If you weren't expecting this, you can ignore this email.",
        });
        await sendEmail({ to: email, subject: "Your Vault admin account is ready", html, text });
        emailSent = true;
      } catch (err) {
        console.error("welcome email failed", err instanceof Error ? err.message : "unknown");
      }
    }

    return json({ ok: true, userId, emailSent });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "Unauthorized" }, 401);
    console.error("admin-create-user failed", err instanceof Error ? err.message : "unknown");
    return json({ error: "Couldn't create the account. Try again." }, 500);
  }
});
