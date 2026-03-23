const { Resend } = require("resend");

/**
 * Send an email via Resend. Fails silently (logs error) so callers
 * are not blocked by email failures.
 */
async function sendEmail(config, { to, subject, html }) {
  if (!config.resendApiKey) {
    console.warn("[email] RESEND_API_KEY not configured — skipping email.");
    return null;
  }

  try {
    const resend = new Resend(config.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: config.emailFrom,
      to,
      subject,
      html
    });

    if (error) {
      console.error("[email] Resend API error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[email] Failed to send:", err.message || err);
    return null;
  }
}

function buildCheckinApprovedEmail({ athleteName, weekStart }) {
  const name = athleteName || "Atleta";
  const week = weekStart || "";
  return {
    subject: `Check-in semanal revisado — semana de ${week}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="color:#c8a415;margin:0 0 16px;">Lion Hybrid Training</h2>
        <p>Ola ${name},</p>
        <p>O teu coach ja revisou o teu check-in da semana de <strong>${week}</strong>.</p>
        <p>Obrigado pelo teu compromisso com o processo!</p>
        <br/>
        <p style="font-size:13px;color:#888;">— Equipa Lion Hybrid Training</p>
      </div>
    `
  };
}

module.exports = {
  sendEmail,
  buildCheckinApprovedEmail
};
