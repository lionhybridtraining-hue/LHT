const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeeklyCheckinById, updateWeeklyCheckin, verifyCoachOwnsAthlete, getAthleteById } = require("./_lib/supabase");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { sendTemplatedEmail, buildCheckinApprovedEmail } = require("./_lib/email");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const roles = Array.isArray(auth.roles) ? auth.roles : [];
    const isAdmin = roles.includes("admin");
    const isCoach = roles.includes("coach");
    if (!isAdmin && !isCoach) {
      return json(403, { error: "Forbidden" });
    }

    const payload = parseJsonBody(event);
    const checkinId = (payload.checkinId || "").toString().trim();
    const finalFeedback = typeof payload.finalFeedback === "string" ? payload.finalFeedback.trim() : "";

    if (!checkinId) {
      return json(400, { error: "Missing checkinId" });
    }

    if (!finalFeedback) {
      return json(400, { error: "Missing finalFeedback" });
    }

    const checkin = await getWeeklyCheckinById(config, checkinId);
    if (!checkin) {
      return json(404, { error: "Check-in nao encontrado" });
    }

    const owns = isAdmin || await verifyCoachOwnsAthlete(config, auth.user.sub, checkin.athlete_id);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

    if (checkin.status !== "pending_coach") {
      return json(400, {
        error: checkin.approved_at
          ? "Check-in ja aprovado"
          : "Check-in ainda nao foi respondido pelo atleta"
      });
    }

    const updated = await updateWeeklyCheckin(config, checkin.id, {
      final_feedback: finalFeedback,
      status: "approved",
      approved_at: new Date().toISOString()
    });

    // Await email — sendEmail handles errors internally and won't throw.
    // Fire-and-forget is unreliable in serverless: the process exits before the promise resolves.
    const athlete = await getAthleteById(config, checkin.athlete_id);
    if (athlete && athlete.email) {
      const fallbackTemplate = buildCheckinApprovedEmail({
        athleteName: athlete.name || "",
        weekStart: checkin.week_start || ""
      });
      console.log(`[approve-checkin] Sending email to ${athlete.email} for checkin ${checkin.id}`);
      const sendResult = await sendTemplatedEmail(config, {
        to: athlete.email,
        templateCode: "checkin_approved",
        subjectTemplate: fallbackTemplate.subject,
        htmlTemplate: fallbackTemplate.html,
        context: {
          athleteName: athlete.name || "Atleta",
          weekStart: checkin.week_start || ""
        },
        athleteId: checkin.athlete_id,
        isTest: false,
        triggerSource: "approve_checkin",
        triggerRef: checkin.id,
        actorIdentityId: auth.user.sub,
        channelType: "transactional"
      });
      if (sendResult.result) {
        console.log(`[approve-checkin] Email sent successfully, id: ${sendResult.result.id}`);
      } else {
        console.warn("[approve-checkin] Email not sent (no result — check RESEND_API_KEY and EMAIL_FROM).");
      }
    } else {
      console.warn(`[approve-checkin] No athlete email found for athlete_id ${checkin.athlete_id} — skipping email.`);
    }

    return json(200, {
      ok: true,
      checkinId: updated ? updated.id : checkinId,
      status: "approved"
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao aprovar check-in" });
  }
};
