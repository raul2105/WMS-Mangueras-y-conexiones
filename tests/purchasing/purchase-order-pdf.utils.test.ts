import { describe, expect, it } from "vitest";
import { 
  buildPurchaseOrderPdfFilename, 
  getSupplierDisplayLines 
} from "@/lib/purchasing/purchase-order-pdf";
describe("PDF utility functions", () => {
  describe("buildPurchaseOrderPdfFilename", () => {
    it("sanitiza folio con prefijo OC", () => {
      expect(buildPurchaseOrderPdfFilename("OC-2026-0004")).toBe("OC-2026-0004.pdf");
    });
    
    it("agrega prefijo OC si no lo tiene", () => {
      expect(buildPurchaseOrderPdfFilename("2026-0004")).toBe("OC-2026-0004.pdf");
    });
    
    it("sanitiza caracteres especiales", () => {
      expect(buildPurchaseOrderPdfFilename("OC-2026/0004?*")).toBe("OC-2026-0004.pdf");
    });
  });

  describe("getSupplierDisplayLines", () => {
    it("colapsa valores idénticos", () => {
      const result = getSupplierDisplayLines({
        code: "SUP-001",
        name: "Parker",
        businessName: "Parker",
        legalName: "Parker",
        taxId: null,
        email: null,
        phone: null,
        address: null,
        paymentTerms: null,
      });
      
      expect(result.primary).toBe("Parker");
      expect(result.secondary).toBeNull();
    });

    it("muestra valores distintos", () => {
      const result = getSupplierDisplayLines({
        code: "SUP-002",
        name: "Parker México",
        businessName: "Parker Industrial",
        legalName: "Parker México SA de CV",
        taxId: null,
        email: null,
        phone: null,
        address: null,
        paymentTerms: null,
      });
      
      // Function prioritizes businessName > legalName > name for primary
      expect(result.primary).toBe("Parker Industrial");
      // secondary uses legalName when different from primary
      expect(result.secondary).toBe("Parker México SA de CV");
    });
  });

});