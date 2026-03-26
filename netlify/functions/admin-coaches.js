const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listCoaches, createCoach, updateCoach, inviteAuthUser, createAuthUser, assignRoleToIdentity, getAuthUserByEmail, getAthleteByEmail } = require("./_lib/supabase");

function normalizeCoachPayload(payload) {
  let identityId = (payload.identityId || "").toString().trim();
  const email = (payload.email || "").toString().trim().toLowerCase();
  const name = (payload.name || "").toString().trim();
  const timezone = (payload.timezone || "Europe/Lisbon").toString().trim() || "Europe/Lisbon";
  const defaultFollowupType = (payload.followupType || payload.defaultFollowupType || "standard").toString().trim() || "standard";

  const capacityRaw = payload.capacityLimit;
  const capacityLimit = capacityRaw == null || capacityRaw === "" ? null : Number(capacityRaw);

  if (!email) throw new Error("email is required");
  if (!name) throw new Error("name is required");
  if (capacityLimit != null && (!Number.isInteger(capacityLimit) || capacityLimit < 0)) {
    throw new Error("capacityLimit must be a non-negative integer");
  }

  return {
    identity_id: identityId || null,
    email,
    name,
    timezone,
    capacity_limit: capacityLimit,
    default_followup_type: defaultFollowupType,
    status: "active"
  };
}

function mapCoach(row) {
  return {
    id: row.id,
    identityId: row.identity_id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    capacityLimit: row.capacity_limit,
    followupType: row.default_followup_type,
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "POST", "PATCH"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      const rows = await listCoaches(config);
      return json(200, { coaches: Array.isArray(rows) ? rows.map(mapCoach) : [] });
    }

    if (method === "PATCH") {
      const query = event.queryStringParameters || {};
      const coachId = (query.coachId || "").toString().trim();

      if (!coachId) {
        return json(400, { error: "coachId is required" });
      }

      const payload = parseJsonBody(event);
      const patch = {};

      // Only allow specific fields to be patched
      if (payload.timezone !== undefined) {
        const timezone = (payload.timezone || "Europe/Lisbon").toString().trim() || "Europe/Lisbon";
        patch.timezone = timezone;
      }
      if (payload.capacityLimit !== undefined) {
        const capacityRaw = payload.capacityLimit;
        const capacityLimit = capacityRaw == null || capacityRaw === "" ? null : Number(capacityRaw);
        if (capacityLimit != null && (!Number.isInteger(capacityLimit) || capacityLimit < 0)) {
          throw new Error("capacityLimit must be a non-negative integer");
        }
        patch.capacity_limit = capacityLimit;
      }
      if (payload.followupType !== undefined) {
        const followupType = (payload.followupType || "standard").toString().trim() || "standard";
        patch.default_followup_type = followupType;
      }
      if (payload.name !== undefined) {
        const name = (payload.name || "").toString().trim();
        if (!name) {
          throw new Error("name cannot be empty");
        }
        patch.name = name;
      }
      if (payload.status !== undefined) {
        const status = (payload.status || "active").toString().trim();
        if (!["active", "inactive"].includes(status)) {
          throw new Error("status must be 'active' or 'inactive'");
        }
        patch.status = status;
      }

      if (Object.keys(patch).length === 0) {
        return json(400, { error: "No valid fields to update" });
      }

      const updated = await updateCoach(config, coachId, patch);

      return json(200, { coach: mapCoach(updated) });
    }

    const payload = parseJsonBody(event);
    const normalized = normalizeCoachPayload(payload);
    
    let inviteEmailSent = false;
    let authUserId = normalized.identity_id || null;

    // --- Step 1: Resolve auth user (best-effort, never blocks coach creation) ---
    if (!authUserId) {
      console.log("[admin-coaches] Resolving auth for:", normalized.email);

      // Try A: Invite (sends invite email + creates user)
      try {
        const authUser = await inviteAuthUser(config, normalized.email, {
          auto_created: true,
          created_by_coach_flow: true
        });
        if (authUser && authUser.id) {
          authUserId = authUser.id;
          inviteEmailSent = true;
          console.log("[admin-coaches] Invite OK, id:", authUserId);
        }
      } catch (inviteErr) {
        const invMsg = String((inviteErr && inviteErr.message) || "");
        console.log("[admin-coaches] Invite failed:", invMsg, "status:", inviteErr.status);

        const alreadyExists =
          invMsg.toLowerCase().includes("already") ||
          invMsg.toLowerCase().includes("registered") ||
          invMsg.toLowerCase().includes("exists") ||
          inviteErr.status === 409 ||
          inviteErr.status === 422;

        if (alreadyExists) {
          // User exists in Auth — try to find their ID
          try {
            const existing = await getAuthUserByEmail(config, normalized.email);
            if (existing && existing.id) {
              authUserId = existing.id;
              console.log("[admin-coaches] Found existing auth user, id:", authUserId);
            }
          } catch (lookupErr) {
            console.log("[admin-coaches] Auth lookup failed:", lookupErr.message);
          }
        } else {
          // Invite endpoint itself failed (e.g. 404) — try creating user directly
          try {
            const authUser = await createAuthUser(config, normalized.email);
            if (authUser && authUser.id) {
              authUserId = authUser.id;
              console.log("[admin-coaches] createAuthUser OK, id:", authUserId);
            }
          } catch (createErr) {
            const cMsg = String((createErr && createErr.message) || "");
            console.log("[admin-coaches] createAuthUser failed:", cMsg, "status:", createErr.status);

            const createAlreadyExists =
              cMsg.toLowerCase().includes("already") ||
              cMsg.toLowerCase().includes("registered") ||
              cMsg.toLowerCase().includes("exists") ||
              createErr.status === 409 ||
              createErr.status === 422;

            console.log("[admin-coaches] createAlreadyExists:", createAlreadyExists);

            if (createAlreadyExists) {
              console.log("[admin-coaches] Trying getAuthUserByEmail...");
              try {
                const existing = await getAuthUserByEmail(config, normalized.email);
                console.log("[admin-coaches] getAuthUserByEmail result:", existing ? existing.id : null);
                if (existing && existing.id) {
                  authUserId = existing.id;
                  console.log("[admin-coaches] Found existing auth user (post-create), id:", authUserId);
                }
              } catch (lookupErr2) {
                console.log("[admin-coaches] Auth lookup (post-create) failed:", lookupErr2.message);
              }
            }
          }
        }
      }

      if (!authUserId) {
        console.log("[admin-coaches] Trying getAthleteByEmail fallback...");
        try {
          const athlete = await getAthleteByEmail(config, normalized.email);
          console.log("[admin-coaches] getAthleteByEmail result:", athlete ? athlete.identity_id : null);
          if (athlete && athlete.identity_id) {
            authUserId = athlete.identity_id;
            console.log("[admin-coaches] Reused identity_id from athlete:", authUserId);
          }
        } catch (athleteLookupErr) {
          console.log("[admin-coaches] Athlete lookup failed:", athleteLookupErr.message);
        }
      }

      if (!authUserId) {
        console.log("[admin-coaches] FAILED: Could not resolve auth user for:", normalized.email);
        const err = new Error("Nao foi possivel resolver o utilizador de autenticacao para este email. Confirma se o utilizador ja existe no Auth (Google login) e tenta novamente.");
        err.status = 400;
        throw err;
      }
    }

    // --- Step 2: Create coach record ---
    normalized.identity_id = authUserId;
    console.log("[admin-coaches] Creating coach, identity_id:", normalized.identity_id, "email:", normalized.email);
    const created = await createCoach(config, normalized);

    // --- Step 3: Assign role (only if we have an identity_id) ---
    if (authUserId) {
      try {
        await assignRoleToIdentity(config, authUserId, "coach");
        console.log("[admin-coaches] Role 'coach' assigned to:", authUserId);
      } catch (roleErr) {
        // Non-fatal: coach record exists, role can be assigned later
        console.log("[admin-coaches] Role assignment failed:", roleErr.message);
      }
    }

    return json(201, { coach: mapCoach(created), inviteEmailSent });
  } catch (err) {
    const status = Number(err && err.status);
    if (status >= 400 && status < 500) {
      return json(status, { error: err.message || "Erro de validacao" });
    }
    console.error("[admin-coaches] Unhandled error:", err.message || err);
    return json(500, { error: err.message || "Erro ao gerir coaches" });
  }
};
