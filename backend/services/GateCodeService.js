import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

// Hash a six-digit Gate Code using a fresh 16-byte salt and the existing scrypt format.
async function hashGateCode(gateCode) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(gateCode, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

// Compare a legacy plaintext Gate Code without an early character-by-character exit.
function safelyMatchesLegacyCode(savedCode, submittedCode) {
  if (
    typeof savedCode !== "string" ||
    savedCode.length !== submittedCode.length
  )
    return false;
  return timingSafeEqual(Buffer.from(savedCode), Buffer.from(submittedCode));
}

// Verify either a salted scrypt hash or a legacy plaintext value.
async function verifyGateCode(savedValue, submittedCode) {
  const hashParts = String(savedValue || "").split(":");
  if (hashParts.length !== 2)
    return safelyMatchesLegacyCode(savedValue, submittedCode);

  const [salt, expectedHashHex] = hashParts;
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expectedHashHex))
    return false;

  const actualHash = await scrypt(submittedCode, salt, 64);
  const expectedHash = Buffer.from(expectedHashHex, "hex");
  return timingSafeEqual(actualHash, expectedHash);
}

export { hashGateCode, verifyGateCode };
