import nodemailer from "nodemailer";
import { query } from "./db";
import { getEnv } from "./env";
import { getEmailQueue } from "./queues";

export type EmailTemplateKey =
  | "invite_teacher"
  | "account_suspended"
  | "password_reset"
  | "video_studio_enabled"
  | "video_studio_disabled"
  | "video_studio_requested"
  | "course_published"
  | "course_rejected"
  | "quiz_graded"
  | "certificate_issued";

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function wrapAccessibleHtml(locale: "es" | "en", title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:24px;background:#F8FAFC;color:#0F172A;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;">
  <main style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:0.06em;color:#1D4ED8;text-transform:uppercase;">Frateli Campus Virtual</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#0F172A;">${title}</h1>
    <div style="color:#334155;font-size:16px;">${bodyHtml}</div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0 16px;">
    <p style="margin:0;font-size:13px;color:#475569;">${
      locale === "es"
        ? "Mensaje automático enviado desde Frateli LMS."
        : "Automated message sent from Frateli LMS."
    }</p>
  </main>
</body>
</html>`;
}

export function renderEmailTemplate(
  templateKey: EmailTemplateKey,
  locale: "es" | "en",
  payload: Record<string, string>
): RenderedEmail {
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;

  switch (templateKey) {
    case "invite_teacher": {
      const link = payload.inviteUrl || `${appUrl}/login`;
      const subject =
        locale === "es"
          ? "Invitación como docente en Frateli Campus Virtual"
          : "Teacher invitation to Frateli Campus Virtual";
      const body =
        locale === "es"
          ? `<p>Hola ${payload.fullName || ""},</p><p>Has sido invitado como docente a Frateli Campus Virtual. Activa tu cuenta usando el siguiente enlace (válido por 72 horas):</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1D4ED8;color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;">Activar cuenta docente</a></p>`
          : `<p>Hello ${payload.fullName || ""},</p><p>You have been invited as a teacher on Frateli Campus Virtual. Activate your account using this link (valid for 72 hours):</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1D4ED8;color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;">Activate teacher account</a></p>`;
      return { subject, html: wrapAccessibleHtml(locale, subject, body), text: `${subject}\n${link}` };
    }
    case "video_studio_enabled": {
      const subject =
        locale === "es"
          ? "Video Studio habilitado en tu perfil docente"
          : "Video Studio enabled on your teacher profile";
      const body =
        locale === "es"
          ? `<p>Hola ${payload.fullName || ""},</p><p>El superadministrador ha habilitado tu acceso al <strong>Portal de Edición de Video (/studio)</strong>.</p><p>Motivo: ${payload.reason || "Autorizado"}</p><p><a href="${appUrl}/studio" style="display:inline-block;padding:12px 20px;background:#1D4ED8;color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;">Abrir Video Studio</a></p>`
          : `<p>Hello ${payload.fullName || ""},</p><p>The superadmin has enabled your access to the <strong>Video Editing Studio (/studio)</strong>.</p><p>Reason: ${payload.reason || "Authorized"}</p><p><a href="${appUrl}/studio" style="display:inline-block;padding:12px 20px;background:#1D4ED8;color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;">Open Video Studio</a></p>`;
      return { subject, html: wrapAccessibleHtml(locale, subject, body), text: `${subject}\n${appUrl}/studio` };
    }
    case "video_studio_disabled": {
      const subject =
        locale === "es"
          ? "Acceso a Video Studio deshabilitado"
          : "Video Studio access disabled";
      const body =
        locale === "es"
          ? `<p>Hola ${payload.fullName || ""},</p><p>Tu acceso a Video Studio ha sido revocado. Motivo: ${payload.reason || "Actualización de permisos"}.</p>`
          : `<p>Hello ${payload.fullName || ""},</p><p>Your Video Studio access has been revoked. Reason: ${payload.reason || "Permissions updated"}.</p>`;
      return { subject, html: wrapAccessibleHtml(locale, subject, body), text: subject };
    }
    case "certificate_issued": {
      const verifyUrl = payload.verifyUrl || `${appUrl}/verify/${payload.verificationCode || ""}`;
      const subject =
        locale === "es"
          ? `Certificado emitido: ${payload.courseTitle || "Frateli"}`
          : `Certificate issued: ${payload.courseTitle || "Frateli"}`;
      const body =
        locale === "es"
          ? `<p>¡Felicitaciones ${payload.fullName || ""}!</p><p>Has completado el curso <strong>${payload.courseTitle || ""}</strong>. Código de verificación: <code>${payload.verificationCode || ""}</code>.</p><p><a href="${verifyUrl}">Verificar certificado</a></p>`
          : `<p>Congratulations ${payload.fullName || ""}!</p><p>You have completed <strong>${payload.courseTitle || ""}</strong>. Verification code: <code>${payload.verificationCode || ""}</code>.</p><p><a href="${verifyUrl}">Verify certificate</a></p>`;
      return { subject, html: wrapAccessibleHtml(locale, subject, body), text: `${subject}\n${verifyUrl}` };
    }
    default: {
      const subject = payload.subject || (locale === "es" ? "Notificación de Frateli LMS" : "Frateli LMS Notification");
      const message = payload.message || "";
      return {
        subject,
        html: wrapAccessibleHtml(locale, subject, `<p>${message}</p>`),
        text: `${subject}\n${message}`,
      };
    }
  }
}

export async function enqueueEmail(params: {
  recipientUserId?: string | null;
  recipientEmail: string;
  templateKey: EmailTemplateKey;
  locale: "es" | "en";
  payload: Record<string, string>;
}): Promise<string> {
  const rendered = renderEmailTemplate(params.templateKey, params.locale, params.payload);
  const res = await query<{ id: string }>(
    `INSERT INTO email_outbox (recipient_user_id, recipient_email, template_key, locale, subject, payload_json, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [
      params.recipientUserId ?? null,
      params.recipientEmail,
      params.templateKey,
      params.locale,
      rendered.subject,
      JSON.stringify(params.payload),
    ]
  );

  const outboxId = res.rows[0].id;
  try {
    await getEmailQueue().add("send-email", { outboxId }, { jobId: outboxId });
    await query(`UPDATE email_outbox SET status = 'queued' WHERE id = $1 AND status = 'pending'`, [outboxId]);
  } catch {
    // Sweeper in worker will pick up pending rows
  }
  return outboxId;
}

export async function sendOutboxEmailNow(outboxId: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const env = getEnv();
  if (!env.SMTP_USER || !env.SMTP_APP_PASSWORD) {
    return { ok: false, error: "SMTP_USER or SMTP_APP_PASSWORD is not configured" };
  }

  const rowRes = await query<{
    id: string;
    recipient_email: string;
    template_key: EmailTemplateKey;
    locale: "es" | "en";
    payload_json: Record<string, string>;
  }>(
    `SELECT id, recipient_email, template_key, locale, payload_json
     FROM email_outbox WHERE id = $1`,
    [outboxId]
  );

  const row = rowRes.rows[0];
  if (!row) return { ok: false, error: "Outbox row not found" };

  const rendered = renderEmailTemplate(row.template_key, row.locale, row.payload_json || {});
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_APP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: row.recipient_email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    await query(
      `UPDATE email_outbox
       SET status = 'sent', smtp_message_id = $2, attempts = attempts + 1, sent_at = now(), last_error = NULL
       WHERE id = $1`,
      [outboxId, info.messageId]
    );
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE email_outbox
       SET status = 'failed', attempts = attempts + 1, last_error = $2
       WHERE id = $1`,
      [outboxId, errorMsg.slice(0, 1000)]
    );
    return { ok: false, error: errorMsg };
  }
}
