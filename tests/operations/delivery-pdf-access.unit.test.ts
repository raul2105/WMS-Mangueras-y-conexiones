import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAccess: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/rbac/sales", () => ({ requireSalesWriteAccess: mocks.requireAccess }));
vi.mock("@/lib/prisma", () => ({ default: { salesInternalOrder: { findFirst: mocks.findFirst, findUnique: mocks.findUnique } } }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: mocks.render }));
vi.mock("@/lib/operations/operational-document-pdf", () => ({
  OperationalDocumentPdf: () => null, buildOperationalDocumentFilename: () => "delivery.pdf",
}));

const { GET } = await import("@/app/api/production/requests/[id]/delivery.pdf/route");
const request = new NextRequest("http://localhost/api/production/requests/order-2/delivery.pdf");

describe("delivery PDF object access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue({ user: { id: "sales-1", roles: ["SALES_EXECUTIVE"] } });
    mocks.findFirst.mockResolvedValue(null);
  });

  it("does not render another executive's order or reveal whether it exists", async () => {
    const response = await GET(request, { params: Promise.resolve({ id: "order-2" }) });
    expect(response.status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      AND: [{ id: "order-2" }, { OR: [
        { assignedToUserId: "sales-1" },
        expect.objectContaining({ assignedToUserId: null, deliveredToCustomerAt: null }),
      ] }],
    } }));
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("allows manager visibility but blocks documents before delivery", async () => {
    mocks.requireAccess.mockResolvedValue({ user: { id: "manager", roles: ["MANAGER"] } });
    mocks.findFirst.mockResolvedValue({ deliveredToCustomerAt: null });
    const response = await GET(request, { params: Promise.resolve({ id: "order-2" }) });
    expect(response.status).toBe(409);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-2" } }));
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("renders a visible delivered order", async () => {
    mocks.findFirst.mockResolvedValue({ code: "PI-TEST", deliveredToCustomerAt: new Date(), lines: [], warehouse: null });
    mocks.render.mockResolvedValue(Buffer.from("pdf"));
    const response = await GET(request, { params: Promise.resolve({ id: "order-2" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });
});
