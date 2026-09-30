import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GMAIL_OAUTH_STATE_TTL_SECONDS,
  createGmailOAuthPkcePair,
  createGmailOAuthState,
  decryptGmailOAuthStateCookie,
  encryptGmailOAuthStateCookie,
  verifyGmailOAuthStateCookie,
} from "@/lib/email/gmail-oauth-state";

const testSecret = "unit-test-only-secret-with-enough-entropy-1234567890";

describe("Gmail OAuth state protection", () => {
  it("creates a PKCE S256 challenge from a high-entropy verifier", () => {
    const { codeVerifier, codeChallenge } = createGmailOAuthPkcePair();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(createHash("sha256").update(codeVerifier).digest("base64url"));
    expect(createGmailOAuthPkcePair().codeVerifier).not.toBe(codeVerifier);
  });

  it("encrypts state and the verifier while binding the payload to one WMS user", () => {
    const now = 1_800_000_000_000;
    const state = createGmailOAuthState("manager-user-1");
    const cookie = encryptGmailOAuthStateCookie(state, testSecret, now);

    expect(cookie).not.toContain(state.state);
    expect(cookie).not.toContain(state.codeVerifier);
    expect(cookie).not.toContain(state.userId);
    expect(verifyGmailOAuthStateCookie(cookie, testSecret, state.userId, state.state, now)).toMatchObject({
      userId: state.userId,
      state: state.state,
      codeVerifier: state.codeVerifier,
      issuedAt: now,
    });
    expect(verifyGmailOAuthStateCookie(cookie, testSecret, "manager-user-2", state.state, now)).toBeNull();
    expect(verifyGmailOAuthStateCookie(cookie, testSecret, state.userId, "attacker-state", now)).toBeNull();
  });

  it("rejects tampered, expired, and future-dated cookies", () => {
    const now = 1_800_000_000_000;
    const state = createGmailOAuthState("manager-user-1");
    const validCookie = encryptGmailOAuthStateCookie(state, testSecret, now);
    const [version, iv, tag, encrypted] = validCookie.split(".");
    const changedTag = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;

    expect(decryptGmailOAuthStateCookie(`${version}.${iv}.${changedTag}.${encrypted}`, testSecret, now)).toBeNull();
    expect(decryptGmailOAuthStateCookie(
      encryptGmailOAuthStateCookie(state, testSecret, now - GMAIL_OAUTH_STATE_TTL_SECONDS * 1000),
      testSecret,
      now,
    )).toBeNull();
    expect(decryptGmailOAuthStateCookie(
      encryptGmailOAuthStateCookie(state, testSecret, now + 1),
      testSecret,
      now,
    )).toBeNull();
  });
});
