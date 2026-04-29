import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("postgresql schema contract for customers", () => {
  it("declares Customer model with required fields and indexes", () => {
    const schema = readWorkspaceFile("prisma/postgresql/schema.prisma");
    expect(schema).toContain("model Customer {");
    expect(schema).toContain("id           String @id @default(uuid())");
    expect(schema).toContain("code         String @unique");
    expect(schema).toContain("name         String");
    expect(schema).toContain("isActive     Boolean @default(true)");
    expect(schema).toContain("@@index([isActive])");
    expect(schema).toContain("@@index([name])");
    expect(schema).toContain("@@index([taxId])");
  });

  it("declares optional SalesInternalOrder.customerId relation and index", () => {
    const schema = readWorkspaceFile("prisma/postgresql/schema.prisma");
    expect(schema).toContain("model SalesInternalOrder {");
    expect(schema).toContain("customerId String?");
    expect(schema).toContain("customerName String?");
    expect(schema).toContain("customer Customer? @relation(fields: [customerId], references: [id], onDelete: Restrict)");
    expect(schema).toContain("@@index([customerId])");
  });
});

