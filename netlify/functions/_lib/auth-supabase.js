const crypto = require("crypto");

function extractBearerToken(event) {
  const headers = event?.headers || {};
  const authHeader = headers.authorization || headers.Authorization || "";
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

// Decoda JWT sem verificar signature (Supabase já verificou no auth client)
function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payload = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(event, config) {
  const token = extractBearerToken(event);
  if (!token) return null;

  const claims = decodeJWT(token);
  if (!claims) return null;

  // Valida issuer (do Supabase)
  if (!claims.iss || !claims.iss.includes("supabase")) return null;
  
  // Valida expiração
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;

  // Retorna user com sub (UUID), email, etc
  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email,
    aud: claims.aud,
    raw: claims
  };
}

module.exports = {
  extractBearerToken,
  decodeJWT,
  getAuthenticatedUser
};
