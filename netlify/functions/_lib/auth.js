const { json } = require("./http");

function getIdentityUser(event) {
  return event && event.clientContext && event.clientContext.user
    ? event.clientContext.user
    : null;
}

function unauthorized() {
  return json(401, { error: "Acesso nao autorizado" });
}

module.exports = {
  getIdentityUser,
  unauthorized
};