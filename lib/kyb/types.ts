export type KybStatus =
  | "created"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "expired";

export type KybDecision = "approved" | "rejected";

export type AmlStatus = "pending" | "passed" | "flagged" | "error";

/** Una pregunta marcada para corregir, con la nota que ve el solicitante. */
export interface KybCorrectionField {
  key: string;
  note: string;
}

/** Set ABIERTO de correcciones de la ronda vigente (se limpia al reenviar). */
export interface KybCorrections {
  round: number;
  requested_at: string;
  source: "admin" | "api";
  requested_by: string;
  fields: KybCorrectionField[];
}

export interface KybRequest {
  id: string;
  external_ref: string;
  status: KybStatus;
  invitation_token_hash: string;
  token_expires_at: string | null;
  form_version: string;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  decision: KybDecision | null;
  decided_by: string | null;
  corrections: KybCorrections | null;
  decision_reason: string | null;
  expiring_notified_at: string | null;
}

export interface KybFormResponse {
  request_id: string;
  data: Record<string, unknown>;
  form_version: string;
  updated_at: string;
}

export interface KybDocument {
  id: string;
  request_id: string;
  doc_type: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  size: number | null;
  uploaded_at: string;
}

export interface AmlCheck {
  id: string;
  request_id: string;
  provider: string;
  external_ref: string | null;
  status: AmlStatus;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
