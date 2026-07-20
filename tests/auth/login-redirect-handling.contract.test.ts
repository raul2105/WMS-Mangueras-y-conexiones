import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("login redirect handling", () => {
  it("lets Auth.js successful redirects leave the login action", () => {
    const page = read("app/(public)/login/page.tsx");

    expect(page).toContain("function isNextRedirectError");
    expect(page).toContain('digest.startsWith("NEXT_REDIRECT")');
    expect(page).toContain("if (isNextRedirectError(error)) throw error;");
  });

  it("keeps genuine credential failures on the login page", () => {
    const page = read("app/(public)/login/page.tsx");

    expect(page).toContain('"Credenciales invalidas"');
    expect(page).toContain("No se pudo iniciar sesion");
  });
});
