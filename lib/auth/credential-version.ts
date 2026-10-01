import { createHash } from "node:crypto";

// Keep the password hash out of tokens while binding a session to the
// credential that was actually checked during sign-in.
export function getCredentialVersion(passwordHash: string) {
  return createHash("sha256").update(`wms-password-v1\0${passwordHash}`).digest("hex");
}
