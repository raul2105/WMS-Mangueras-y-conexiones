import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailProvider } from "@/lib/email/provider";

describe("SMTP providers in IPv6-only egress mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails clearly before sending when SMTP is configured with an IPv4 literal", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "192.0.2.10");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "test-user");
    vi.stubEnv("SMTP_PASS", "test-pass");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("WMS_IPV6_EGRESS", "1");

    const provider = createEmailProvider({ providerId: "smtp", fromEmail: "wms@example.test" });
    expect(provider).not.toBeNull();

    await expect(
      provider!.send({ to: "recipient@example.test", subject: "PDF", body: "test" })
    ).rejects.toThrow(/no publica una dirección IPv6 utilizable.*egreso IPv4/i);
  });
});
