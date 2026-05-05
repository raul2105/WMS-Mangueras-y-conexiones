import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const pageGuardMock = vi.fn();
const getSessionContextMock = vi.fn();

vi.mock("@/components/rbac/PageGuard", () => ({
  pageGuard: pageGuardMock,
}));

vi.mock("@/lib/auth/session-context", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    warehouse: {
      findMany: vi.fn(async () => []),
    },
  },
}));

describe("new request page runtime customer branch", () => {
  it("renders manual customerName input when user lacks customers.view", async () => {
    pageGuardMock.mockResolvedValue(undefined);
    getSessionContextMock.mockResolvedValue({
      isSystemAdmin: false,
      permissions: ["sales.view", "sales.create_order"],
      user: { id: "u1" },
      roles: ["CUSTOM_ROLE"],
    });

    const pageModule = await import("@/app/(shell)/production/requests/new/page");
    const element = await pageModule.default({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('name="customerName"');
    expect(html).not.toContain('name="customerId"');
    expect(html).toContain("No tienes acceso al catálogo de clientes");
  });
});
