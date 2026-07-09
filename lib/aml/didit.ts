import "server-only";
import { env } from "@/lib/env";
import type {
  AmlProvider,
  AmlSubmitPayload,
  AmlSubmitResult,
} from "@/lib/aml/provider";

/**
 * Proveedor AML real (DIDIT). Endpoints y formato de payload/respuesta
 * están POR DEFINIR — este es el punto de integración. El resultado final
 * suele llegar de forma asíncrona vía webhook (app/api/webhooks/didit).
 */
export class DiditAmlProvider implements AmlProvider {
  readonly name = "didit";

  async submitCheck(payload: AmlSubmitPayload): Promise<AmlSubmitResult> {
    const apiUrl = env.diditApiUrl();
    const apiKey = env.diditApiKey();
    if (!apiUrl || !apiKey) {
      throw new Error(
        "DIDIT no configurado (DIDIT_API_URL / DIDIT_API_KEY). Usa AML_PROVIDER=mock en local.",
      );
    }

    // TODO(DIDIT): ajustar ruta, headers y forma del body al contrato real.
    const res = await fetch(`${apiUrl}/aml/screenings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        reference: payload.requestId,
        subject: payload.subject,
      }),
    });

    if (!res.ok) {
      throw new Error(`DIDIT respondió ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { id?: string; status?: string };
    return {
      externalRef: json.id ?? payload.requestId,
      status: "pending", // resultado definitivo llega por webhook
      result: json as Record<string, unknown>,
    };
  }
}
