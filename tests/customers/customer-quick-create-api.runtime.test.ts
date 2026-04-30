import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.fn();
const getSessionContextMock = vi.fn();
const searchCustomersMock = vi.fn();
const createCustomerMock = vi.fn();

class MockCustomerServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CustomerServiceError";
  }
}

vi.mock("@/lib/rbac", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/lib/auth/session-context", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/lib/customers/customer-service", () => ({
  searchCustomers: searchCustomersMock,
  createCustomer: createCustomerMock,
  CustomerServiceError: MockCustomerServiceError,
}));

vi.mock("@/lib/prisma", () => ({
  default: {},
}));

describe("customer quick-create api runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue(undefined);
    getSessionContextMock.mockResolvedValue({
      user: { id: "user-1", name: "QA", email: "qa@scmayher.com" },
    });
    searchCustomersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, hasMore: false });
  });

  it("returns 201 on successful create", async () => {
    createCustomerMock.mockResolvedValue({
      id: "cust-1",
      code: "CLI-2026-0001",
      name: "Cliente QA",
      taxId: "RFC123456AAA",
      email: "qa@cliente.com",
      isActive: true,
    });

    const { POST } = await import("@/app/api/customers/route");
    const request = new Request("http://localhost/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cliente QA",
        taxId: "RFC123456AAA",
        email: "qa@cliente.com",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toBe("cust-1");
    expect(requirePermissionMock).toHaveBeenCalledWith("customers.manage");
    expect(createCustomerMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when schema validation fails", async () => {
    const { POST } = await import("@/app/api/customers/route");
    const request = new Request("http://localhost/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBeTruthy();
    expect(createCustomerMock).not.toHaveBeenCalled();
  });

  it("returns 409 when taxId already exists in pre-check", async () => {
    searchCustomersMock.mockResolvedValue({
      items: [{ id: "cust-9", code: "CLI-2026-0009", name: "Duplicado", taxId: "RFC123456AAA" }],
      total: 1,
      page: 1,
      pageSize: 10,
      hasMore: false,
    });

    const { POST } = await import("@/app/api/customers/route");
    const request = new Request("http://localhost/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cliente QA", taxId: "RFC123456AAA" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error)).toContain("Ya existe un cliente con ese RFC/NIF");
    expect(createCustomerMock).not.toHaveBeenCalled();
  });

  it("returns 409 with guidance when service raises duplicate error", async () => {
    createCustomerMock.mockRejectedValue(
      new MockCustomerServiceError("DUPLICATE_CUSTOMER_CODE", "Ya existe un cliente con código CLI-2026-0001"),
    );

    const { POST } = await import("@/app/api/customers/route");
    const request = new Request("http://localhost/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cliente QA", code: "CLI-2026-0001" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error)).toContain("búscalo y selecciónalo");
  });
});
