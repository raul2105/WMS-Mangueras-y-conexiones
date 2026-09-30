import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeGmailAuthorizationCode,
} from "@/lib/email/gmail-connection";
import { isGmailOAuthConfigured } from "@/lib/email/gmail-config";
import {
  clearGmailOAuthStateCookie,
  getGmailManagerAccess,
  getGmailOAuthStateSecret,
  noStore,
  settingsRedirect,
  settingsResultRedirect,
} from "@/lib/email/gmail-oauth-http";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  verifyGmailOAuthStateCookie,
} from "@/lib/email/gmail-oauth-state";

export const dynamic = "force-dynamic";

function clearAndNoStore(response: NextResponse) {
  return noStore(clearGmailOAuthStateCookie(response));
}

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const access = await getGmailManagerAccess();
  if (!access.allowed) {
    return clearAndNoStore(settingsRedirect(
      access.reason === "unauthenticated"
        ? "/login?callbackUrl=%2Fpurchasing%2Femail"
        : "/forbidden?from=%2Fpurchasing%2Femail",
    ));
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  const secret = getGmailOAuthStateSecret();
  const state = callbackUrl.searchParams.get("state") ?? "";
  const verified = secret
    ? verifyGmailOAuthStateCookie(cookieValue, secret, access.userId, state)
    : null;

  if (!verified) return clearAndNoStore(settingsResultRedirect("expired"));
  if (callbackUrl.searchParams.has("error")) return clearAndNoStore(settingsResultRedirect("error"));

  const code = callbackUrl.searchParams.get("code");
  if (!code || !isGmailOAuthConfigured()) {
    return clearAndNoStore(settingsResultRedirect(code ? "unavailable" : "error"));
  }

  try {
    await exchangeGmailAuthorizationCode({
      userId: access.userId,
      code,
      codeVerifier: verified.codeVerifier,
    });
    return clearAndNoStore(settingsResultRedirect("connected"));
  } catch {
    return clearAndNoStore(settingsResultRedirect("error"));
  }
}
