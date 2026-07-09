import type { AmlStatus } from "@/lib/kyb/types";

/** Payload que se envía al proveedor AML (campos por definir con DIDIT). */
export interface AmlSubmitPayload {
  requestId: string;
  externalRef: string;
  subject: Record<string, unknown>;
}

export interface AmlSubmitResult {
  externalRef: string; // referencia del proveedor
  status: AmlStatus; // estado inicial (normalmente 'pending')
  result?: Record<string, unknown>;
}

export interface AmlProvider {
  readonly name: string;
  /** Envía un check AML y devuelve la referencia + estado inicial. */
  submitCheck(payload: AmlSubmitPayload): Promise<AmlSubmitResult>;
  /** Consulta el resultado por referencia (para polling, opcional). */
  getResult?(externalRef: string): Promise<AmlSubmitResult>;
}
