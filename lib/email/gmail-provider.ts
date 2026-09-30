import type { EmailProvider } from "@/lib/email/provider";

type MailComposerInstance = {
  compile(): { build(): Promise<Buffer> };
};

export class GmailDeliveryError extends Error {
  readonly deliveryUnknown: boolean;
  readonly errorCode: string;

  constructor(message: string, options: { deliveryUnknown: boolean; errorCode: string }) {
    super(message);
    this.name = "GmailDeliveryError";
    this.deliveryUnknown = options.deliveryUnknown;
    this.errorCode = options.errorCode;
  }
}

export function createGmailEmailProvider(config: {
  accessToken: string;
  fromEmail: string;
  fromName?: string;
}): EmailProvider {
  return {
    providerId: "gmail",
    async send(input) {
      // Nodemailer's composer creates RFC 2822 MIME, including safe header encoding
      // and binary PDF transfer encoding. Only the resulting raw message is sent.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const MailComposer = require("nodemailer/lib/mail-composer") as new (options: Record<string, unknown>) => MailComposerInstance;
      const message = await new MailComposer({
        from: config.fromName ? { name: config.fromName, address: config.fromEmail } : config.fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.body,
        attachments: input.attachment
          ? [{ filename: input.attachment.filename, content: input.attachment.content, contentType: input.attachment.contentType }]
          : [],
      }).compile().build();
      const raw = message.toString("base64url");

      let response: Response;
      try {
        response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          signal: AbortSignal.timeout(8_000),
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ raw }),
          cache: "no-store",
        });
      } catch {
        throw new GmailDeliveryError("No se pudo confirmar la respuesta de Gmail; el envío puede haberse completado.", {
          deliveryUnknown: true,
          errorCode: "GMAIL_RESPONSE_UNKNOWN",
        });
      }

      if (!response.ok) {
        const deliveryUnknown = response.status >= 500;
        throw new GmailDeliveryError(
          deliveryUnknown
            ? "Gmail no confirmó el resultado del envío; se requiere revisión antes de reenviar."
            : `Gmail rechazó el envío (HTTP ${response.status}).`,
          {
            deliveryUnknown,
            errorCode: deliveryUnknown ? "GMAIL_RESPONSE_UNKNOWN" : `GMAIL_HTTP_${response.status}`,
          },
        );
      }

      let result: { id?: unknown };
      try {
        result = await response.json() as { id?: unknown };
      } catch {
        throw new GmailDeliveryError("Gmail aceptó la solicitud pero no devolvió un identificador verificable.", {
          deliveryUnknown: true,
          errorCode: "GMAIL_RESPONSE_UNKNOWN",
        });
      }
      if (typeof result.id !== "string" || !result.id) {
        throw new GmailDeliveryError("Gmail aceptó la solicitud pero no devolvió un identificador verificable.", {
          deliveryUnknown: true,
          errorCode: "GMAIL_RESPONSE_UNKNOWN",
        });
      }
      return { messageId: result.id };
    },
  };
}
