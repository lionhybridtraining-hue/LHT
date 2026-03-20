export default function splitStringFormatted(input: unknown): string {
  const normalizedInput = Array.isArray(input)
    ? input
        .map((item) => (typeof item === "string" ? item : String(item ?? "")))
        .join(" ")
    : typeof input === "string"
    ? input
    : String(input ?? "");

  const cleanedInput = normalizedInput.trim();

  // Some API responses append a compact split payload immediately after
  // the human-readable description, e.g. ")1.6km-06:06+0.80km-04:13...".
  // Some variants insert punctuation first, e.g. "),1.6km-06:06...".
  const compactPayloadAfterParen =
    /\)\s*[,;:]?\s*(?=\d+(?:\.\d+)?km-\d{1,2}:\d{2}(?:min)?)/i;
  const compactPayloadMatch = compactPayloadAfterParen.exec(cleanedInput);

  if (compactPayloadMatch) {
    const splitIndex = compactPayloadMatch.index + 1;
    return cleanedInput.slice(0, splitIndex);
  }

  // Fallback: trim trailing compact payload even when there is no ")" boundary.
  const trailingCompactPayload =
    /\s*\d+(?:\.\d+)?km-\d{1,2}:\d{2}(?:min)?(?:\+\d+(?:\.\d+)?km-\d{1,2}:\d{2}(?:min)?)+\s*$/i;
  const trailingMatch = trailingCompactPayload.exec(cleanedInput);

  if (trailingMatch && trailingMatch.index > 0) {
    return cleanedInput.slice(0, trailingMatch.index).trimEnd();
  }

  // Remove trailing floating-point residue like "-8.881784197001252e-16".
  const trailingScientificNotation = /\s*-?\d+(?:\.\d+)?e[+-]?\d+\s*$/i;
  const withoutScientificResidue = cleanedInput.replace(
    trailingScientificNotation,
    ""
  );

  // If no match, return the whole input
  return withoutScientificResidue;
}
