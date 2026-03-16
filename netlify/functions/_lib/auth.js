const { json } = require("./http");

function getIdentityUser(event) {
  return event && event.clientContext && event.clientContext.user
    ? event.clientContext.user
    : null;
}

function unauthorized(reason) {
  return json(401, {
    error: "Acesso nao autorizado",
    reason: reason || "missing_identity_user"
  });
}

module.exports = {
  getIdentityUser,
  unauthorized
};