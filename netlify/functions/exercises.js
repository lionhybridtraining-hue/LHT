const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listExercises, createExercise, updateExercise } = require("./_lib/supabase");
const { requireRole } = require("./_lib/authz");
const { parseJsonBody } = require("./_lib/http");

exports.handler = async (event) => {
  const config = getConfig();

  // GET — list all exercises (any authenticated user)
  if (event.httpMethod === "GET") {
    const auth = await requireRole(event, config, "coach");
    if (auth.error) return auth.error;

    const exercises = await listExercises(config);
    return json(200, { exercises: exercises || [] });
  }

  // POST — create exercise (coach only)
  if (event.httpMethod === "POST") {
    const auth = await requireRole(event, config, "coach");
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    if (!body.name || !body.category || !body.subcategory) {
      return json(400, { error: "name, category, subcategory are required" });
    }

    const exercise = await createExercise(config, {
      name: body.name,
      category: body.category,
      subcategory: body.subcategory,
      video_url: body.video_url || null,
      description: body.description || null,
      default_weight_per_side: body.default_weight_per_side || false,
      default_each_side: body.default_each_side || false,
      default_tempo: body.default_tempo || null
    });
    return json(201, { exercise });
  }

  // PATCH — update exercise (coach only)
  if (event.httpMethod === "PATCH") {
    const auth = await requireRole(event, config, "coach");
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    if (!body.id) {
      return json(400, { error: "id is required" });
    }

    const allowed = ["name", "category", "subcategory", "video_url", "description",
      "default_weight_per_side", "default_each_side", "default_tempo"];
    const patch = {};
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }

    const exercise = await updateExercise(config, body.id, patch);
    return json(200, { exercise });
  }

  return json(405, { error: "Method not allowed" });
};
