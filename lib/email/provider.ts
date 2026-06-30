import { createHash } from "node:crypto";

export type EmailProvider = {
  /**
   * Send an email with optional attachment
   */
  send(input: {
    to: string;
    subject: string;
    body: string;
    attachment?: {
      filename: string;
      content: Buffer;
      contentType: string;
    };
  }): Promise<{ messageId: string }>;

  /**
   * Provider identifier for logging/metrics
   */
  readonly providerId: string;
};

export type EmailProviderConfig = {
  providerId: string;
  fromEmail: string;
  fromName?: string;
};

/**
 * Create a real email provider from environment configuration.
 * Returns null if provider is not configured (missing required env vars).
 */
export function createEmailProvider(config: EmailProviderConfig): EmailProvider | null {
  const providerType = process.env.EMAIL_PROVIDER?.toLowerCase();

  if (!providerType) {
    return null;
  }

  switch (providerType) {
    case "ses": {
      const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

      // AWS_REGION is required; credentials can come from IAM role (default chain) if not explicitly set
      if (!region) {
        return null;
      }

      // Lazy-load SES client to avoid bundling AWS SDK in test environments
      return createSesProvider({
        region,
        accessKeyId,
        secretAccessKey,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      });
    }

    case "smtp": {
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const secure = process.env.SMTP_SECURE === "true";

      if (!host || !user || !pass) {
        return null;
      }

      return createSmtpProvider({
        host,
        port,
        secure,
        user,
        pass,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      });
    }

    default:
      return null;
  }
}

/**
 * Create a fake email provider for testing.
 * Captures sent emails in memory for assertion.
 */
export function createFakeEmailProvider(): { provider: EmailProvider; sentEmails: SentEmail[] } {
  const sentEmails: SentEmail[] = [];

  const provider: EmailProvider = {
    providerId: "fake",
    async send(input) {
      const email: SentEmail = {
        ...input,
        attachment: input.attachment
          ? {
              filename: input.attachment.filename,
              contentType: input.attachment.contentType,
              size: input.attachment.content.length,
            }
          : undefined,
        sentAt: new Date(),
      };
      sentEmails.push(email);
      return { messageId: `fake-${createHash("sha256").update(JSON.stringify(email)).digest("hex").slice(0, 12)}` };
    },
  };

  return { provider, sentEmails };
}

export type SentEmail = {
  to: string;
  subject: string;
  body: string;
  attachment?: {
    filename: string;
    contentType: string;
    size: number;
  };
  sentAt: Date;
};

/**
 * SES provider implementation (lazy-loaded)
 */
function createSesProvider(config: {
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  fromEmail: string;
  fromName?: string;
}): EmailProvider {
  // Dynamic import to avoid bundling AWS SDK in tests
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SESClient } = require("@aws-sdk/client-ses");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTransport } = require("nodemailer");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const awsSes = require("@aws-sdk/client-ses");

  // Use IAM role / default credential chain if explicit keys not provided
  const clientConfig: Record<string, unknown> = { region: config.region };
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };
  }
  const client = new SESClient(clientConfig);

  return {
    providerId: "ses",
    async send(input) {
      // Use nodemailer to build MIME message with attachment, then send via SES SendRawEmail
      const transporter = createTransport({ SES: { client, aws: awsSes } });

      const mailOptions: Record<string, unknown> = {
        from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.body,
      };

      if (input.attachment) {
        mailOptions.attachments = [
          {
            filename: input.attachment.filename,
            content: input.attachment.content,
            contentType: input.attachment.contentType,
          },
        ];
      }

      const result = await transporter.sendMail(mailOptions);
      return { messageId: result.messageId ?? `ses-${Date.now()}` };
    },
  };
}

/**
 * SMTP provider implementation using nodemailer
 */
function createSmtpProvider(config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
}): EmailProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTransport } = require("nodemailer");

  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    providerId: "smtp",
    async send(input) {
      const result = await transporter.sendMail({
        from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.body,
        attachments: input.attachment
          ? [
              {
                filename: input.attachment.filename,
                content: input.attachment.content,
                contentType: input.attachment.contentType,
              },
            ]
          : undefined,
      });
      return { messageId: result.messageId ?? `smtp-${Date.now()}` };
    },
  };
}

/**
 * Get provider instance for production use.
 * Returns null if no provider is configured.
 */
export function getEmailProvider(): EmailProvider | null {
  const fromEmail = process.env.EMAIL_FROM_EMAIL;
  const fromName = process.env.EMAIL_FROM_NAME;

  if (!fromEmail) {
    return null;
  }

  return createEmailProvider({ providerId: process.env.EMAIL_PROVIDER ?? "unknown", fromEmail, fromName });
}