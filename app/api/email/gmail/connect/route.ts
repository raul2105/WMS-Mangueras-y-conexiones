import { NextResponse } from "next/server";
import {
  createGmailAuthorizationUrl,
} from "@/lib/email/gmail-connection";
import { isGmailOAuthConfigured } from "@/lib/email/gmail-config";
import {
  GMAIL_OAUTH_STATE_COOKIE_OPTIONS,
  getGmailManagerAccess,
  getGmailOAuthStateSecret,
  getWmsOrigin,
  isSameOriginPost,
  noStore,
  settingsRedirect,
  settingsResultRedirect,
} from "@/lib/email/gmail-oauth-http";
import {
  createGmailOAuthState,
  encryptGmailOAuthStateCookie,
  GMAIL_OAUTH_STATE_COOKIE,
} from "@/lib/email/gmail-oauth-state";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return noStore(NextResponse.json({ error: "Solicitud no válida." }, { status: 403 }));
  }

  const access = await getGmailManagerAccess();
  if (!access.allowed) {
    return noStore(settingsRedirect(
      access.reason === "unauthenticated"
        ? "/login?callbackUrl=%2Fpurchasing%2Femail"
        : "/forbidden?from=%2Fpurchasing%2Femail",
    ));
  }

  const origin = getWmsOrigin();
  const secret = getGmailOAuthStateSecret();
  if (!origin || !secret || !isGmailOAuthConfigured()) {
    return noStore(settingsResultRedirect("unavailable"));
  }

  try {
    const state = createGmailOAuthState(access.userId);
    const cookieValue = encryptGmailOAuthStateCookie(state, secret);
    const authorizationUrl = new URL(createGmailAuthorizationUrl({
      state: state.state,
      codeChallenge: state.codeChallenge,
    }));

    if (
      authorizationUrl.origin !== "https://accounts.google.com" ||
      authorizationUrl.searchParams.get("state") !== state.state ||
      authorizationUrl.searchParams.get("code_challenge") !== state.codeChallenge ||
      authorizationUrl.searchParams.get("code_challenge_method") !== "S256"
    ) {
      return noStore(settingsResultRedirect("error"));
    }

    const response = NextResponse.redirect(authorizationUrl, 303);
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, cookieValue, GMAIL_OAUTH_STATE_COOKIE_OPTIONS);
    return noStore(response);
  } catch {
    return noStore(settingsResultRedirect("error"));
  }
}
