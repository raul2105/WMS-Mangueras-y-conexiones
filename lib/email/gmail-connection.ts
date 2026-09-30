import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import prisma from "@/lib/prisma";
import { GMAIL_SCOPES, requireGmailOAuthConfig } from "@/lib/email/gmail-config";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const TOKEN_TIMEOUT_MS = 10_000;
const ENVELOPE_VERSION = "v1";
const TOKEN_AAD_PREFIX = "wms:gmail-refresh-token:v1:";

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
};

export type GmailConnectionStatus =
  | { connected: false }
  | { connected: true; email: string; status: "CONNECTED" | "REAUTH_REQUIRED"; connectedAt: Date };

function encryptionKey(): Buffer {
  const encoded = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!encoded || !/^[0-9a-fA-F]{64}$/.test(encoded)) {
    throw new Error("La clave de cifrado de Gmail no está configurada correctamente.");
  }
  return Buffer.from(encoded, "hex");
}

export function encryptGmailRefreshToken(userId: string, token: string, key = encryptionKey()): string {
  if (!userId || !token || key.length !== 32) throw new Error("No se pudo proteger la credencial de Gmail.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${TOKEN_AAD_PREFIX}${userId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [ENVELOPE_VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGmailRefreshToken(userId: string, envelope: string, key = encryptionKey()): string {
  if (!userId || key.length !== 32) throw new Error("La credencial de Gmail no es válida; es necesario volver a conectar la cuenta.");
  const [version, ivText, tagText, ciphertextText, extra] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new Error("La credencial de Gmail no es válida; es necesario volver a conectar la cuenta.");
  }
  try {
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    const ciphertext = Buffer.from(ciphertextText, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`${TOKEN_AAD_PREFIX}${userId}`, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("La credencial de Gmail no se pudo descifrar; es necesario volver a conectar la cuenta.");
  }
}

async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await googleFetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new Error("Google no respondió a tiempo; inténtalo de nuevo.");
  }
  let payload: TokenResponse;
  try {
    payload = await response.json() as TokenResponse;
  } catch {
    throw new Error("Google devolvió una respuesta inválida.");
  }
  if (!response.ok) {
    if (payload.error === "invalid_grant") throw new GmailReauthorizationRequiredError();
    throw new Error("Google rechazó la solicitud de token.");
  }
  return payload;
}

export class GmailReauthorizationRequiredError extends Error {
  constructor() {
    super("La autorización de Gmail venció o fue revocada; vuelve a conectar la cuenta.");
    this.name = "GmailReauthorizationRequiredError";
  }
}

export function createGmailAuthorizationUrl(input: { state: string; codeChallenge: string }): string {
  const config = requireGmailOAuthConfig();
  if (!input.state || !input.codeChallenge) throw new Error("Falta protección de estado PKCE para Gmail.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    scope: GMAIL_SCOPES.join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeGmailAuthorizationCode(input: {
  userId: string;
  code: string;
  codeVerifier: string;
}): Promise<{ googleSub: string; email: string; scopes: string[] }> {
  if (!input.userId || !input.code || !input.codeVerifier) throw new Error("La respuesta de autorización de Gmail está incompleta.");
  const config = requireGmailOAuthConfig();
  const tokens = await tokenRequest(new URLSearchParams({
    code: input.code,
    code_verifier: input.codeVerifier,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  }));
  if (typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string") {
    throw new Error("Google no entregó las credenciales necesarias; vuelve a autorizar Gmail.");
  }

  let response: Response;
  try {
    response = await googleFetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
  } catch {
    throw new Error("No se pudo verificar la identidad de Gmail; vuelve a intentarlo.");
  }
  if (!response.ok) throw new Error("No se pudo verificar la identidad de Gmail.");
  let identity: { sub?: unknown; email?: unknown; email_verified?: unknown };
  try {
    identity = await response.json() as typeof identity;
  } catch {
    throw new Error("Google devolvió una identidad inválida.");
  }
  if (typeof identity.sub !== "string" || !identity.sub || typeof identity.email !== "string" ||
      !identity.email || identity.email_verified !== true) {
    throw new Error("La cuenta Google no confirmó una dirección de correo verificada.");
  }

  const scopes = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : [];
  const hasEmailIdentityScope = scopes.includes("email") ||
    scopes.includes("https://www.googleapis.com/auth/userinfo.email");
  if (!scopes.includes("openid") || !hasEmailIdentityScope ||
      !scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    throw new Error("La autorización de Gmail no incluye los permisos requeridos.");
  }
  const encryptedRefreshToken = encryptGmailRefreshToken(input.userId, tokens.refresh_token);
  try {
    await prisma.userGmailConnection.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        googleSub: identity.sub,
        email: identity.email,
        encryptedRefreshToken,
        scopes: scopes.join(" "),
        status: "CONNECTED",
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
        reauthRequiredAt: null,
      },
      update: {
        googleSub: identity.sub,
        email: identity.email,
        encryptedRefreshToken,
        scopes: scopes.join(" "),
        status: "CONNECTED",
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
        reauthRequiredAt: null,
      },
    });
  } catch {
    throw new Error("No se pudo guardar la conexión de Gmail. Verifica que esta cuenta Google no esté vinculada a otro usuario.");
  }
  return { googleSub: identity.sub, email: identity.email, scopes };
}

export async function getGmailConnectionStatus(userId: string): Promise<GmailConnectionStatus> {
  let connection: { email: string; status: string; connectedAt: Date } | null;
  try {
    connection = await prisma.userGmailConnection.findUnique({
      where: { userId },
      select: { email: true, status: true, connectedAt: true },
    });
  } catch {
    throw new Error("No se pudo consultar la conexión de Gmail.");
  }
  if (!connection) return { connected: false };
  if (connection.status !== "CONNECTED" && connection.status !== "REAUTH_REQUIRED") {
    throw new Error("El estado de la conexión de Gmail no es válido.");
  }
  return {
    connected: true,
    email: connection.email,
    status: connection.status,
    connectedAt: connection.connectedAt,
  };
}

export async function disconnectGmailConnection(userId: string): Promise<void> {
  try {
    const connection = await prisma.userGmailConnection.findUnique({
      where: { userId },
      select: { encryptedRefreshToken: true },
    });
    if (!connection) return;
    // Disable local sending before remote revocation, even if Google is unavailable.
    await prisma.userGmailConnection.updateMany({
      where: { userId, encryptedRefreshToken: connection.encryptedRefreshToken },
      data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date() },
    });
    const refreshToken = decryptGmailRefreshToken(userId, connection.encryptedRefreshToken);
    let response: Response;
    try {
      response = await googleFetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch {
      throw new Error("Google no confirmó la revocación; el envío está deshabilitado y puedes reintentar desconectar.");
    }
    // Google may return 400 when the grant is already invalid/revoked.
    if (!response.ok && response.status !== 400) {
      throw new Error("Google no confirmó la revocación; el envío está deshabilitado y puedes reintentar desconectar.");
    }
    await prisma.userGmailConnection.deleteMany({ where: { userId, encryptedRefreshToken: connection.encryptedRefreshToken } });
  } catch {
    throw new Error("No se pudo confirmar la desconexión de Gmail. Reintenta desconectar para confirmar la revocación.");
  }
}

export async function getGmailAccessTokenForUser(userId: string, expectedEmail?: string): Promise<string> {
  let connection: Awaited<ReturnType<typeof prisma.userGmailConnection.findUnique>>;
  try {
    connection = await prisma.userGmailConnection.findUnique({ where: { userId } });
  } catch {
    throw new Error("No se pudo consultar la conexión de Gmail.");
  }
  if (!connection) throw new Error("Este usuario no tiene una cuenta Gmail conectada.");
  if (connection.status !== "CONNECTED") throw new GmailReauthorizationRequiredError();
  if (expectedEmail && connection.email !== expectedEmail) {
    throw new Error("La cuenta Gmail cambió antes del envío; vuelve a intentar con la cuenta actual.");
  }
  const config = requireGmailOAuthConfig();
  const refreshToken = decryptGmailRefreshToken(userId, connection.encryptedRefreshToken);
  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest(new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }));
  } catch (error) {
    if (error instanceof GmailReauthorizationRequiredError) {
      try {
        await prisma.userGmailConnection.updateMany({
          where: { userId, status: "CONNECTED", encryptedRefreshToken: connection.encryptedRefreshToken },
          data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date() },
        });
      } catch {
        throw new Error("La autorización de Gmail venció y no se pudo actualizar su estado; vuelve a conectar la cuenta.");
      }
    }
    throw error;
  }
  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new Error("Google no devolvió un token de acceso válido.");
  }
  try {
    const validated = await prisma.userGmailConnection.updateMany({
      where: { userId, status: "CONNECTED", email: connection.email, encryptedRefreshToken: connection.encryptedRefreshToken },
      data: { lastValidatedAt: new Date() },
    });
    if (validated.count !== 1) throw new Error("La conexión Gmail cambió durante la renovación; vuelve a intentar.");
  } catch {
    throw new Error("No se pudo actualizar el estado de la conexión de Gmail.");
  }
  return tokens.access_token;
}
