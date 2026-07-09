export type KybStatus =
  | "created"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired";

export type KybDecision = "approved" | "rejected";

export type AmlStatus = "pending" | "passed" | "flagged" | "error";

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
