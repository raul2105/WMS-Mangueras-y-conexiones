import { afterEach, describe, expect, it, vi } from "vitest";
import { createGmailEmailProvider, GmailDeliveryError } from "@/lib/email/gmail-provider";

describe("Gmail API email provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends RFC 2822 MIME as base64url and returns Gmail message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "gmail-message-42" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGmailEmailProvider({ accessToken: "access-token-test", fromEmail: "manager@example.test", fromName: "Manager WMS" });

    const result = await provider.send({
      to: "compras@example.test",
      subject: "Orden de compra ágil",
      body: "Se adjunta la orden oficial.",
      attachment: { filename: "OC-42-v1.pdf", content: Buffer.from("pdf-fixture"), contentType: "application/pdf" },
    });

    expect(result.messageId).toBe("gmail-message-42");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(new Headers(request.headers).get("authorization")).toBe("Bearer access-token-test");
    const raw = JSON.parse(String(request.body)).raw as string;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toContain("To: compras@example.test");
    expect(mime).toContain("application/pdf");
    expect(mime).toContain("OC-42-v1.pdf");
    expect(mime).toContain("Se adjunta la orden oficial.");
  });

  it("classifies a definite Gmail 4xx rejection without exposing the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive-token-like-payload", { status: 403 })));
    const provider = createGmailEmailProvider({ accessToken: "not-for-logs", fromEmail: "manager@example.test" });

    let thrown: unknown;
    try {
      await provider.send({ to: "vendor@example.test", subject: "OC", body: "Body" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(GmailDeliveryError);
    expect(thrown).toMatchObject({ deliveryUnknown: false, errorCode: "GMAIL_HTTP_403" });
    expect((thrown as Error).message).not.toContain("sensitive-token-like-payload");
  });

  it("marks a network failure as an uncertain delivery result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket reset")));
    const provider = createGmailEmailProvider({ accessToken: "not-for-logs", fromEmail: "manager@example.test" });

    await expect(provider.send({ to: "vendor@example.test", subject: "OC", body: "Body" })).rejects.toMatchObject({
      name: "GmailDeliveryError",
      deliveryUnknown: true,
      errorCode: "GMAIL_RESPONSE_UNKNOWN",
    });
  });

  it("bounds Gmail API requests to eight seconds and treats a timeout as uncertain", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    const provider = createGmailEmailProvider({ accessToken: "not-for-logs", fromEmail: "manager@example.test" });

    await expect(provider.send({ to: "vendor@example.test", subject: "OC", body: "Body" })).rejects.toMatchObject({
      deliveryUnknown: true,
      errorCode: "GMAIL_RESPONSE_UNKNOWN",
    });
    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
  });
});
