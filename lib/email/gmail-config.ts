export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getGmailOAuthConfig(): GmailOAuthConfig | null {
  const { GOOGLE_GMAIL_CLIENT_ID: clientId, GOOGLE_GMAIL_CLIENT_SECRET: clientSecret,
    GOOGLE_GMAIL_REDIRECT_URI: redirectUri } = process.env;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGmailOAuthConfigured(): boolean {
  if (!getGmailOAuthConfig() || !process.env.GMAIL_TOKEN_ENCRYPTION_KEY) return false;
  try {
    requireGmailOAuthConfig();
    return /^[0-9a-fA-F]{64}$/.test(process.env.GMAIL_TOKEN_ENCRYPTION_KEY);
  } catch {
    return false;
  }
}

export function requireGmailOAuthConfig(): GmailOAuthConfig {
  const config = getGmailOAuthConfig();
  if (!config) throw new Error("La conexión de Gmail no está configurada.");
  try {
    const redirect = new URL(config.redirectUri);
    if ((redirect.protocol !== "https:" && redirect.hostname !== "localhost") ||
        redirect.pathname !== "/api/email/gmail/callback" || redirect.search || redirect.hash ||
        redirect.username || redirect.password) throw new Error();

    if (process.env.NODE_ENV === "production") {
      const configuredOrigins = [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_APP_BASE_URL]
        .filter((value): value is string => Boolean(value))
        .map((value) => {
          const url = new URL(value);
          if (url.protocol !== "https:") throw new Error();
          return url.origin;
        });
      if (configuredOrigins.length === 0 || configuredOrigins.some((origin) => origin !== redirect.origin)) {
        throw new Error();
      }
    }
  } catch {
    throw new Error("La URI de retorno de Gmail no coincide con el callback seguro de esta aplicación.");
  }
  return config;
}
