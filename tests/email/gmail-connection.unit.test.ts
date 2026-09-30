import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  userGmailConnection: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import {
  decryptGmailRefreshToken,
  encryptGmailRefreshToken,
  createGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
  disconnectGmailConnection,
  getGmailAccessTokenForUser,
} from "@/lib/email/gmail-connection";
import { GMAIL_SCOPES, isGmailOAuthConfigured } from "@/lib/email/gmail-config";

const key = Buffer.alloc(32, 7);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function configureOAuth() {
  vi.stubEnv("GOOGLE_GMAIL_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_GMAIL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_GMAIL_REDIRECT_URI", "https://wms.example.test/api/email/gmail/callback");
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
}

describe("Gmail connection security", () => {
  it("uses offline consent and S256 PKCE with the minimum scopes", () => {
    configureOAuth();
    const url = new URL(createGmailAuthorizationUrl({ state: "random-state", codeChallenge: "challenge" }));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...GMAIL_SCOPES]);
  });

  it("rejects bad config and round-trips an authenticated token envelope bound to one user", () => {
    expect(isGmailOAuthConfigured()).toBe(false);
    configureOAuth();
    expect(isGmailOAuthConfigured()).toBe(true);
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "not-a-32-byte-hex-key");
    expect(isGmailOAuthConfigured()).toBe(false);
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("GOOGLE_GMAIL_REDIRECT_URI", "https://wms.example.test/untrusted");
    expect(isGmailOAuthConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_GMAIL_REDIRECT_URI", "https://wms.example.test/api/email/gmail/callback");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "https://wms.example.test");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "https://wms.example.test");
    expect(isGmailOAuthConfigured()).toBe(true);
    vi.stubEnv("NEXTAUTH_URL", "https://unexpected.example.test");
    expect(isGmailOAuthConfigured()).toBe(false);
    const envelope = encryptGmailRefreshToken("manager-1", "refresh-secret", key);
    expect(envelope).not.toContain("refresh-secret");
    expect(decryptGmailRefreshToken("manager-1", envelope, key)).toBe("refresh-secret");
    expect(() => decryptGmailRefreshToken("manager-2", envelope, key)).toThrow(/no se pudo descifrar/i);
    expect(() => decryptGmailRefreshToken("manager-1", `${envelope.slice(0, -1)}x`, key)).toThrow();
  });

  it("does not persist an OAuth grant unless Google verifies the identity and requested scopes", async () => {
    configureOAuth();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        scope: GMAIL_SCOPES.join(" "),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-sub", email: "manager@example.test", email_verified: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeGmailAuthorizationCode({
      userId: "manager-1",
      code: "authorization-code",
      codeVerifier: "high-entropy-verifier",
    })).rejects.toThrow(/correo verificada/i);
    expect(prismaMock.userGmailConnection.upsert).not.toHaveBeenCalled();
  });

  it("stores only the encrypted refresh token after verified consent", async () => {
    configureOAuth();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        scope: GMAIL_SCOPES.join(" "),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-sub", email: "manager@example.test", email_verified: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeGmailAuthorizationCode({
      userId: "manager-1",
      code: "authorization-code",
      codeVerifier: "high-entropy-verifier",
    })).resolves.toMatchObject({ googleSub: "google-sub", email: "manager@example.test" });
    const saved = prismaMock.userGmailConnection.upsert.mock.calls[0][0];
    expect(saved.create.encryptedRefreshToken).not.toContain("refresh-secret");
    expect(saved.create.scopes).toBe(GMAIL_SCOPES.join(" "));
    expect(saved.create.status).toBe("CONNECTED");
  });

  it("rejects grants missing Gmail send permission", async () => {
    configureOAuth();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        scope: "openid email",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-sub", email: "manager@example.test", email_verified: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeGmailAuthorizationCode({
      userId: "manager-1",
      code: "authorization-code",
      codeVerifier: "high-entropy-verifier",
    })).rejects.toThrow(/permisos requeridos/i);
    expect(prismaMock.userGmailConnection.upsert).not.toHaveBeenCalled();
  });

  it("disables local sending even if Google cannot confirm revocation", async () => {
    configureOAuth();
    const encryptedRefreshToken = encryptGmailRefreshToken("manager-1", "refresh-secret");
    prismaMock.userGmailConnection.findUnique.mockResolvedValue({ encryptedRefreshToken });
    prismaMock.userGmailConnection.updateMany.mockResolvedValue({ count: 1 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(disconnectGmailConnection("manager-1")).rejects.toThrow(/confirmar la desconexión/i);
    expect(prismaMock.userGmailConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: "manager-1", encryptedRefreshToken },
      data: { status: "REAUTH_REQUIRED", reauthRequiredAt: expect.any(Date) },
    });
    expect(prismaMock.userGmailConnection.deleteMany).not.toHaveBeenCalled();
  });

  it("does not return an access token after the connection changes or is disconnected", async () => {
    configureOAuth();
    const encryptedRefreshToken = encryptGmailRefreshToken("manager-1", "refresh-secret");
    prismaMock.userGmailConnection.findUnique.mockResolvedValue({ encryptedRefreshToken, status: "CONNECTED" });
    prismaMock.userGmailConnection.updateMany.mockResolvedValue({ count: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "access-secret" }), { status: 200 })));
    await expect(getGmailAccessTokenForUser("manager-1")).rejects.toThrow(/actualizar el estado/i);
    expect(prismaMock.userGmailConnection.updateMany.mock.calls[0][0].where).toEqual({
      userId: "manager-1", status: "CONNECTED", encryptedRefreshToken,
    });
  });

  it("revokes and deletes only the disconnected grant, preserving a concurrent new connection", async () => {
    configureOAuth();
    const encryptedRefreshToken = encryptGmailRefreshToken("manager-1", "old-refresh-secret");
    prismaMock.userGmailConnection.findUnique.mockResolvedValue({ encryptedRefreshToken });
    prismaMock.userGmailConnection.updateMany.mockResolvedValue({ count: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await disconnectGmailConnection("manager-1");
    expect(prismaMock.userGmailConnection.deleteMany).toHaveBeenCalledWith({ where: { userId: "manager-1", encryptedRefreshToken } });
  });
});
