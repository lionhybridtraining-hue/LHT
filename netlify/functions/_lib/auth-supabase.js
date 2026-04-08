const crypto = require("crypto");

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

const jwksCache = {
  fetchedAt: 0,
  byKid: new Map()
};

function extractBearerToken(event) {
  const headers = event?.headers || {};
  const authHeader = headers.authorization || headers.Authorization || "";
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function decodeJWTHeader(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = Buffer.from(parts[0], "base64url").toString("utf8");
    return JSON.parse(header);
  } catch {
    return null;
  }
}

function getExpectedIssuer(config) {
  const base = String(config?.supabaseUrl || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/auth/v1`;
}

async function getJwksByKid(config) {
  const now = Date.now();
  const isFresh = now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS && jwksCache.byKid.size > 0;
  if (isFresh) return jwksCache.byKid;

  const expectedIssuer = getExpectedIssuer(config);
  if (!expectedIssuer) {
    throw new Error("Missing Supabase URL for JWKS validation");
  }

  const response = await fetch(`${expectedIssuer}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error("Unable to fetch JWKS");
  }

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];

  const nextByKid = new Map();
  for (const key of keys) {
    if (key?.kid && key?.kty) {
      nextByKid.set(key.kid, key);
    }
  }

  if (!nextByKid.size) {
    throw new Error("JWKS payload is empty");
  }

  jwksCache.byKid = nextByKid;
  jwksCache.fetchedAt = now;
  return jwksCache.byKid;
}

async function verifyJWTSignature(token, config) {
  const header = decodeJWTHeader(token);
  if (!header?.kid || header.alg !== "RS256") return false;

  const jwksByKid = await getJwksByKid(config);
  const jwk = jwksByKid.get(header.kid);
  if (!jwk) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signature = Buffer.from(parts[2], "base64url");
  return verifier.verify(publicKey, signature);
}

async function verifyTokenWithSupabaseAuth(token, config) {
  const expectedIssuer = getExpectedIssuer(config);
  if (!expectedIssuer) return null;

  const headers = {
    Authorization: `Bearer ${token}`
  };

  if (config?.supabaseAnonKey) {
    headers.apikey = config.supabaseAnonKey;
  }

  const response = await fetch(`${expectedIssuer}/user`, {
    method: "GET",
    headers
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload && payload.id ? payload : null;
}

function claimsAreValid(claims, config) {
  if (!claims?.sub) return false;

  const expectedIssuer = getExpectedIssuer(config);
  if (!expectedIssuer || claims.iss !== expectedIssuer) return false;

  if (!claims.exp || claims.exp * 1000 <= Date.now()) return false;
  if (claims.nbf && claims.nbf * 1000 > Date.now()) return false;

  const expectedAudience = "authenticated";
  const aud = claims.aud;
  const audienceMatches = Array.isArray(aud)
    ? aud.includes(expectedAudience)
    : aud === expectedAudience;
  if (!audienceMatches) return false;

  return true;
}

async function getAuthenticatedUser(event, config) {
  try {
    const token = extractBearerToken(event);
    if (!token) return null;

    const claims = decodeJWT(token);
    const hasValidClaims = claims && claimsAreValid(claims, config);

    if (hasValidClaims) {
      const validSignature = await verifyJWTSignature(token, config);
      if (validSignature) {
        const meta = claims.user_metadata || {};
        return {
          id: claims.sub,
          sub: claims.sub,
          email: claims.email,
          name: meta.full_name || meta.name || null,
          aud: claims.aud,
          iat: claims.iat,
          exp: claims.exp,
          raw: claims
        };
      }
    }

    // Fallback: let Supabase Auth authoritatively validate the token.
    const authUser = await verifyTokenWithSupabaseAuth(token, config);
    if (!authUser) return null;

    // Retorna user com sub (UUID), email, etc
    const fbMeta = authUser.user_metadata || (claims ? claims.user_metadata : null) || {};
    return {
      id: authUser.id,
      sub: authUser.id,
      email: authUser.email || null,
      name: fbMeta.full_name || fbMeta.name || null,
      aud: claims ? claims.aud : null,
      iat: claims ? claims.iat : null,
      exp: claims ? claims.exp : null,
      raw: claims || authUser
    };
  } catch {
    return null;
  }
}

module.exports = {
  extractBearerToken,
  decodeJWT,
  decodeJWTHeader,
  verifyJWTSignature,
  verifyTokenWithSupabaseAuth,
  getAuthenticatedUser
};
