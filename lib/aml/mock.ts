import "server-only";
import { createHash } from "crypto";
import type {
  AmlProvider,
  AmlSubmitPayload,
  AmlSubmitResult,
} from "@/lib/aml/provider";

/**
 * Proveedor AML de desarrollo. Determinista: marca 'flagged' si el nombre de la
 * empresa contiene "flag"/"sanction"; de lo contrario 'passed'. Permite probar
 * ambos caminos end-to-end sin DIDIT real.
 */
export class MockAmlProvider implements AmlProvider {
  readonly name = "mock";

  async submitCheck(payload: AmlSubmitPayload): Promise<AmlSubmitResult> {
    const name = String(payload.subject.companyName ?? "").toLowerCase();
    const flagged = /flag|sanction|ofac|blocked/.test(name);
    const ref =
      "mock_" +
      createHash("sha256").update(payload.requestId).digest("hex").slice(0, 16);

    return {
      externalRef: ref,
      status: flagged ? "flagged" : "passed",
      result: {
        provider: "mock",
        screenedName: payload.subject.companyName ?? null,
        matches: flagged
          ? [{ list: "MOCK-SANCTIONS", score: 0.97 }]
          : [],
        note: "Resultado simulado (AML_PROVIDER=mock).",
      },
    };
  }
}
