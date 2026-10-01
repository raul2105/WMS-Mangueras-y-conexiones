import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const GMAIL_OAUTH_STATE_COOKIE = "__Host-wms-gmail-oauth-state";
export const GMAIL_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const GMAIL_OAUTH_STATE_TTL_MS = GMAIL_OAUTH_STATE_TTL_SECONDS * 1000;
const COOKIE_VERSION = "v1";
const COOKIE_AAD = Buffer.from(`${GMAIL_OAUTH_STATE_COOKIE}:${COOKIE_VERSION}`);

export type GmailOAuthState = {
  userId: string;
  state: string;
  codeVerifier: string;
  issuedAt: number;
};

export function createGmailOAuthPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createGmailOAuthState(userId: string) {
  return {
    userId,
    state: randomBytes(32).toString("base64url"),
    ...createGmailOAuthPkcePair(),
  };
}

function deriveCookieKey(secret: string) {
  if (!secret) throw new Error("Auth secret is required to protect Gmail OAuth state.");
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), COOKIE_AAD, Buffer.from("state-cookie-encryption"), 32),
  );
}

export function encryptGmailOAuthStateCookie(
  state: Omit<GmailOAuthState, "issuedAt">,
  secret: string,
  now = Date.now(),
) {
  if (!state.userId || !state.state || !state.codeVerifier) {
    throw new Error("Gmail OAuth state is incomplete.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveCookieKey(secret), iv);
  cipher.setAAD(COOKIE_AAD);
  const payload = Buffer.from(JSON.stringify({ ...state, issuedAt: now }), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [COOKIE_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptGmailOAuthStateCookie(
  cookieValue: string | undefined,
  secret: string,
  now = Date.now(),
): GmailOAuthState | null {
  if (!cookieValue || cookieValue.length > 4096) return null;
  const [version, ivEncoded, tagEncoded, encryptedEncoded, extra] = cookieValue.split(".");
  if (version !== COOKIE_VERSION || !ivEncoded || !tagEncoded || !encryptedEncoded || extra !== undefined) {
    return null;
  }

  try {
    const iv = Buffer.from(ivEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    const encrypted = Buffer.from(encryptedEncoded, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;

    const decipher = createDecipheriv("aes-256-gcm", deriveCookieKey(secret), iv);
    decipher.setAAD(COOKIE_AAD);
    decipher.setAuthTag(tag);
    const cleartext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const payload = JSON.parse(cleartext) as Partial<GmailOAuthState>;
    if (
      typeof payload.userId !== "string" || !payload.userId ||
      typeof payload.state !== "string" || !payload.state ||
      typeof payload.codeVerifier !== "string" || !payload.codeVerifier ||
      typeof payload.issuedAt !== "number" || !Number.isSafeInteger(payload.issuedAt)
    ) {
      return null;
    }

    if (payload.issuedAt > now || now - payload.issuedAt >= GMAIL_OAUTH_STATE_TTL_MS) return null;
    return payload as GmailOAuthState;
  } catch {
    return null;
  }
}

export function isGmailOAuthStateEqual(expected: string, received: string) {
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  const hashesMatch = timingSafeEqual(expectedHash, receivedHash);
  return hashesMatch && expected.length === received.length;
}

export function verifyGmailOAuthStateCookie(
  cookieValue: string | undefined,
  secret: string,
  expectedUserId: string,
  receivedState: string,
  now = Date.now(),
) {
  const payload = decryptGmailOAuthStateCookie(cookieValue, secret, now);
  if (!payload || payload.userId !== expectedUserId) return null;
  return isGmailOAuthStateEqual(payload.state, receivedState) ? payload : null;
}
