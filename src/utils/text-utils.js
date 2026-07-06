const WINDOWS_1252_BYTES = new Map([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

const MOJIBAKE_PATTERN = /[ÃÂÄÅÆ]|á[º»]/;
const REPLACEMENT_CHAR = /\uFFFD/g;

function repairMojibake(value) {
  if (typeof value !== "string" || !MOJIBAKE_PATTERN.test(value)) {
    return value;
  }

  const bytes = [];

  for (const char of value) {
    const code = char.charCodeAt(0);

    if (WINDOWS_1252_BYTES.has(char)) {
      bytes.push(WINDOWS_1252_BYTES.get(char));
    } else if (code <= 0xff) {
      bytes.push(code);
    } else {
      return value;
    }
  }

  const repaired = Buffer.from(bytes).toString("utf8");
  return textScore(repaired) < textScore(value) ? repaired : value;
}

function repairObjectText(value) {
  if (typeof value === "string") return repairMojibake(value);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(repairObjectText);

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      repairObjectText(nestedValue),
    ])
  );
}

function textScore(value) {
  const text = String(value || "");
  const mojibakeMatches = text.match(MOJIBAKE_PATTERN);
  const replacementMatches = text.match(REPLACEMENT_CHAR);

  return (
    (mojibakeMatches ? mojibakeMatches.length * 3 : 0) +
    (replacementMatches ? replacementMatches.length * 10 : 0)
  );
}

module.exports = {
  repairMojibake,
  repairObjectText,
};
