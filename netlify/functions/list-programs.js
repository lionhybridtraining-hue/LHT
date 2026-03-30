const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listPublicTrainingPrograms } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const mode = String((event.queryStringParameters || {}).mode || "").trim().toLowerCase();
    const rows = await listPublicTrainingPrograms(config);
    const todayIso = new Date().toISOString().slice(0, 10);
    const mappedPrograms = Array.isArray(rows)
      ? rows.map((program) => ({
          id: program.id,
          externalId: program.external_id || null,
          name: program.name,
          description: program.description || null,
          durationWeeks: program.duration_weeks,
          priceCents: program.price_cents,
          currency: program.currency,
          billingType: program.billing_type || "one_time",
          followupType: program.followup_type || "standard",
          eventDate: program.event_date || null,
          eventName: program.event_name || null,
          eventLocation: program.event_location || null,
          eventDescription: program.event_description || null,
          calendarVisible: program.calendar_visible !== false,
          calendarHighlightRank: Number.isInteger(program.calendar_highlight_rank)
            ? program.calendar_highlight_rank
            : null
        }))
      : [];

    if (mode === "calendar") {
      const challenges = mappedPrograms
        .filter((program) => program.calendarVisible && program.eventDate && program.eventDate >= todayIso)
        .sort((a, b) => {
          const ar = a.calendarHighlightRank;
          const br = b.calendarHighlightRank;
          if (ar != null && br != null && ar !== br) return ar - br;
          if (ar != null && br == null) return -1;
          if (ar == null && br != null) return 1;
          if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
          return String(a.name || "").localeCompare(String(b.name || ""));
        });
      return json(200, { ok: true, mode: "calendar", challenges });
    }

    return json(200, {
      ok: true,
      programs: mappedPrograms
    });
  } catch (error) {
    return json(500, { error: error.message || "Nao foi possivel listar programas" });
  }
};