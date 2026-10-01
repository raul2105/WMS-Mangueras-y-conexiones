import { NextResponse } from "next/server";
import { disconnectGmailConnection } from "@/lib/email/gmail-connection";
import {
  clearGmailOAuthStateCookie,
  getGmailManagerAccess,
  isSameOriginPost,
  noStore,
  settingsRedirect,
  settingsResultRedirect,
} from "@/lib/email/gmail-oauth-http";

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

  try {
    await disconnectGmailConnection(access.userId);
    return noStore(clearGmailOAuthStateCookie(settingsResultRedirect("disconnected")));
  } catch {
    return noStore(clearGmailOAuthStateCookie(settingsResultRedirect("error")));
  }
}
