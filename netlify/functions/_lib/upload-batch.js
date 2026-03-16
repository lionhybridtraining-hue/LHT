const crypto = require("crypto");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_REGEX.test(String(value || ""));
}

function stripKnownExtensions(fileName) {
  return String(fileName || "")
    .trim()
    .replace(/\.(zip|csv|gz)$/i, "");
}

function deterministicUuidFromSeed(seed) {
  const hash = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 32).split("");
  hash[12] = "5";
  const variant = Number.parseInt(hash[16], 16);
  hash[16] = ((variant & 0x3) | 0x8).toString(16);
  const hex = hash.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function deriveUploadBatchId({ athleteId, sourceFileName, uploadBatchId }) {
  if (isUuid(uploadBatchId)) {
    return uploadBatchId;
  }

  const stem = stripKnownExtensions(sourceFileName);
  if (!stem) {
    return crypto.randomUUID();
  }

  if (isUuid(stem)) {
    return stem;
  }

  const seed = `${athleteId || "unknown-athlete"}|${stem.toLowerCase()}`;
  return deterministicUuidFromSeed(seed);
}

module.exports = {
  isUuid,
  deriveUploadBatchId
};
