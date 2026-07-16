import "server-only";
import type { AmlProvider } from "@/lib/aml/provider";
import { MockAmlProvider } from "@/lib/aml/mock";

/**
 * Proveedor AML para el path NO-DIDIT (mock/local). El dispatch real de DIDIT
 * (por-feature, standalone) vive en `lib/didit/verify.ts` y se activa con
 * `AML_PROVIDER=didit` desde `submitRequest`.
 */
export function getAmlProvider(): AmlProvider {
  return new MockAmlProvider();
}

export * from "@/lib/aml/provider";
