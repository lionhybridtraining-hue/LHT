const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listAllAthletesForAdmin,
  listActiveAssignmentsWithPrograms,
  getPayingStatusForAthletes,
  getLatestPurchaseStatusForAthletes,
  listTrainingPrograms
} = require("./_lib/supabase");

/**
 * GET /.netlify/functions/admin-athletes-unified
 *
 * Returns all athletes with consolidated context:
 * - Basic info (id, name, email, identity_id, coach_identity_id, status)
 * - Active program assignment (training_program_id, programName, assignmentStatus)
 * - Payment status (isPaying)
 *
 * Used by the admin Athletes & Coaches unified table.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    // 1. Fetch all non-archived athletes with coach info
    let athletesRaw, athletes;
    try {
      athletesRaw = await listAllAthletesForAdmin(config);
      athletes = Array.isArray(athletesRaw) ? athletesRaw : [];
      console.log('[admin-athletes-unified] Athletes fetched:', athletes.length);
    } catch (e) {
      console.error('[admin-athletes-unified] Error fetching athletes:', e.message);
      throw e;
    }

    // 2. Fetch active/scheduled/paused assignments with program names
    let assignmentsRaw, assignments, programsRaw, programs, programNameById;
    try {
      assignmentsRaw = await listActiveAssignmentsWithPrograms(config);
      assignments = Array.isArray(assignmentsRaw) ? assignmentsRaw : [];
      console.log('[admin-athletes-unified] Assignments fetched:', assignments.length);
    } catch (e) {
      console.error('[admin-athletes-unified] Error fetching assignments:', e.message);
      throw e;
    }

    try {
      programsRaw = await listTrainingPrograms(config);
      programs = Array.isArray(programsRaw) ? programsRaw : [];
      console.log('[admin-athletes-unified] Programs fetched:', programs.length);
      programNameById = Object.fromEntries(programs.map((program) => [program.id, program.name || null]));
    } catch (e) {
      console.error('[admin-athletes-unified] Error fetching programs:', e.message);
      throw e;
    }

    // Build assignment map: athleteId -> most recent active assignment
    const assignmentByAthleteId = {};
    assignments.forEach((a) => {
      if (!assignmentByAthleteId[a.athlete_id]) {
        assignmentByAthleteId[a.athlete_id] = a;
      }
    });
    console.log('[admin-athletes-unified] Assignment map built');

    // 3. Fetch payment status for all athletes with identity_id
    const identityIds = athletes
      .map((a) => a.identity_id)
      .filter((id) => typeof id === "string" && id.length > 0);
    console.log('[admin-athletes-unified] Identity IDs to check:', identityIds.length);

    let payingMap, latestPurchaseMap;
    try {
      payingMap = await getPayingStatusForAthletes(config, identityIds);
      console.log('[admin-athletes-unified] Paying map fetched');
    } catch (e) {
      console.error('[admin-athletes-unified] Error fetching paying status:', e.message);
      payingMap = {};
    }

    try {
      latestPurchaseMap = await getLatestPurchaseStatusForAthletes(config, identityIds);
      console.log('[admin-athletes-unified] Latest purchase map fetched');
    } catch (e) {
      console.error('[admin-athletes-unified] Error fetching latest purchases:', e.message);
      latestPurchaseMap = {};
    }

    // 4. Merge into unified athlete objects
    const unified = athletes.map((athlete) => {
      const assignment = assignmentByAthleteId[athlete.id] || null;
      const paying = athlete.identity_id ? payingMap[athlete.identity_id] || null : null;
      const latestPurchase = athlete.identity_id ? latestPurchaseMap[athlete.identity_id] || null : null;
      const hasExpiredPurchase = Boolean(
        latestPurchase &&
        latestPurchase.expiresAt &&
        !paying &&
        new Date(latestPurchase.expiresAt).getTime() <= Date.now()
      );

      return {
        id: athlete.id,
        identityId: athlete.identity_id || null,
        email: athlete.email || "",
        name: athlete.name || "",
        status: "active",
        coachIdentityId: athlete.coach_identity_id || null,
        assignmentStatus: assignment ? assignment.status : null,
        trainingProgramId: assignment ? assignment.training_program_id : null,
        programName: assignment ? (programNameById[assignment.training_program_id] || null) : null,
        isPaying: paying ? paying.isPaying : false,
        paymentExpired: hasExpiredPurchase,
        manualAccessActive: paying ? Boolean(paying.manualAccessActive) : false,
        createdAt: athlete.created_at || null,
        updatedAt: null
      };
    });

    return json(200, {
      athletes: unified,
      total: unified.length,
      paying: unified.filter((a) => a.isPaying).length,
      assigned: unified.filter((a) => !!a.coachIdentityId).length
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar atletas unificados" });
  }
};
