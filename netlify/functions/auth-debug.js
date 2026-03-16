const { json } = require("./_lib/http");
const { getIdentityUser } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const headers = event && event.headers ? event.headers : {};
  const authHeader = headers.authorization || headers.Authorization || "";
  const user = getIdentityUser(event);

  return json(200, {
    ok: true,
    hasAuthorizationHeader: Boolean(authHeader),
    authorizationPrefix: authHeader ? authHeader.slice(0, 12) : "",
    hasClientContextUser: Boolean(user),
    user: user
      ? {
          email: user.email || "",
          sub: user.sub || ""
        }
      : null
  });
};