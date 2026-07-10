import "server-only";
import { env } from "@/lib/env";

// ============================================================
// Tipos
// ============================================================
export type LocalizedText = string | Record<string, string>;

export interface WorkflowListItem {
  uuid: string;
  workflow_id: string | null;
  workflow_label: string | null;
  workflow_type: string | null;
  features: string | null;
  version: number | null;
  status: string | null;
  hasQuestionnaire: boolean;
}

export interface QuestionnaireListItem {
  uuid: string;
  title: string | null;
  languages: string[] | null;
  default_language: string | null;
  question_types: string[] | null;
  version: number | null;
  status: string | null;
  workflow_names: string[] | null;
}

export interface NormalizedOption {
  value: string;
  label: LocalizedText;
}

export interface NormalizedQuestion {
  id: string | null;
  type: string | null;
  required: boolean;
  label: LocalizedText;
  placeholder?: LocalizedText;
  options?: NormalizedOption[];
}

export interface NormalizedSection {
  title: LocalizedText;
  questionnaireUuid?: string;
  questions: NormalizedQuestion[];
}

export interface NormalizedQuestionnaire {
  source: {
    kind: "questionnaire";
    uuid: string | null;
    title: string | null;
    version: number | null;
    languages: string[] | null;
    defaultLanguage: string | null;
    status: string | null;
  };
  sections: NormalizedSection[];
  questionCount: number;
}

export interface NormalizedWorkflowForm {
  source: {
    kind: "workflow";
    workflowUuid: string;
    label: string | null;
    type: string | null;
    languages: string[] | null;
    defaultLanguage: string | null;
  };
  questionnaires: {
    uuid: string;
    title: string | null;
    sections: NormalizedSection[];
  }[];
  sections: NormalizedSection[]; // fusionadas en orden
  questionCount: number;
}

export class DiditNotConfiguredError extends Error {}

// ============================================================
// Helpers de idioma
// ============================================================
/** Resuelve un LocalizedText al locale pedido, con fallbacks razonables. */
export function text(
  v: LocalizedText | null | undefined,
  locale = "es",
  fallbacks: string[] = ["es", "en"],
): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v[locale]) return v[locale];
  for (const f of fallbacks) if (v[f]) return v[f];
  const first = Object.values(v)[0];
  return typeof first === "string" ? first : "";
}

// ============================================================
// Fetch
// ============================================================
function base() {
  return (env.diditApiUrl() || "https://verification.didit.me").replace(/\/+$/, "");
}

async function diditGet(path: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const apiKey = env.diditApiKey();
  if (!apiKey) throw new DiditNotConfiguredError("DIDIT_API_KEY no configurada");
  const res = await fetch(`${base()}${path}`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    cache: "no-store",
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* respuesta no-JSON */
  }
  return { ok: res.ok, status: res.status, json };
}

async function getPaginated<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await diditGet(`${path}${sep}limit=${limit}&offset=${offset}`);
    if (!r.ok) throw new Error(`DIDIT ${path} ${r.status}`);
    const data = r.json as { results?: T[]; count?: number };
    const results = data.results ?? [];
    all.push(...results);
    const total = data.count ?? all.length;
    offset += limit;
    if (all.length >= total || results.length === 0) break;
  }
  return all;
}

// ============================================================
// Workflows
// ============================================================
export async function listWorkflows(): Promise<WorkflowListItem[]> {
  type Raw = {
    uuid: string;
    workflow_id?: string;
    workflow_label?: string;
    workflow_type?: string;
    features?: string;
    version?: number;
    status?: string;
  };
  const raw = await getPaginated<Raw>("/v3/workflows/");
  return raw.map((w) => ({
    uuid: w.uuid,
    workflow_id: w.workflow_id ?? null,
    workflow_label: w.workflow_label ?? null,
    workflow_type: w.workflow_type ?? null,
    features: w.features ?? null,
    version: w.version ?? null,
    status: w.status ?? null,
    hasQuestionnaire: /QUESTIONNAIRE/i.test(w.features ?? ""),
  }));
}

export async function retrieveWorkflowRaw(uuid: string): Promise<unknown> {
  const r = await diditGet(`/v3/workflows/${uuid}/`);
  if (!r.ok) throw new Error(`DIDIT workflow retrieve ${r.status}`);
  return r.json;
}

/** Recolecta los questionnaire_uuid del workflow en orden de aparición (sin duplicar). */
export function extractQuestionnaireUuids(raw: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "questionnaire_uuid" && typeof v === "string" && !seen.has(v)) {
        seen.add(v);
        found.push(v);
      } else if (v && typeof v === "object") {
        walk(v);
      }
    }
  };
  walk(raw);
  return found;
}

// ============================================================
// Questionnaires
// ============================================================
export async function listQuestionnaires(): Promise<QuestionnaireListItem[]> {
  return getPaginated<QuestionnaireListItem>("/v3/questionnaires/");
}

export async function retrieveQuestionnaireRaw(uuid: string): Promise<unknown> {
  const r = await diditGet(`/v3/questionnaires/${uuid}/`);
  if (!r.ok) throw new Error(`DIDIT questionnaire retrieve ${r.status}`);
  return r.json;
}

interface RawQuestionnaire {
  questionnaire_id?: string;
  uuid?: string;
  title?: string;
  version?: number;
  languages?: string[];
  default_language?: string;
  status?: string;
  sections?: RawSection[];
}
interface RawSection {
  title?: LocalizedText;
  description?: LocalizedText | null;
  items?: RawItem[];
}
interface RawItem {
  uuid?: string;
  element_type?: string;
  is_required?: boolean;
  title?: LocalizedText;
  label?: LocalizedText;
  placeholder?: LocalizedText | null;
  choices?: { id?: string; label?: LocalizedText; value?: string }[];
}

function normalizeSections(raw: RawQuestionnaire): NormalizedSection[] {
  return (raw.sections ?? []).map((s) => ({
    title: s.title ?? "",
    questions: (s.items ?? []).map((it) => {
      const q: NormalizedQuestion = {
        id: it.uuid ?? null,
        type: it.element_type ?? null,
        required: Boolean(it.is_required),
        label: it.title ?? it.label ?? "",
      };
      if (it.placeholder) q.placeholder = it.placeholder;
      if (Array.isArray(it.choices) && it.choices.length) {
        q.options = it.choices.map((c) => ({
          value: c.value ?? c.id ?? "",
          label: c.label ?? c.value ?? "",
        }));
      }
      return q;
    }),
  }));
}

export function normalizeQuestionnaire(raw: unknown): NormalizedQuestionnaire {
  const q = (raw ?? {}) as RawQuestionnaire;
  const sections = normalizeSections(q);
  return {
    source: {
      kind: "questionnaire",
      uuid: q.questionnaire_id ?? q.uuid ?? null,
      title: q.title ?? null,
      version: q.version ?? null,
      languages: q.languages ?? null,
      defaultLanguage: q.default_language ?? null,
      status: q.status ?? null,
    },
    sections,
    questionCount: sections.reduce((n, s) => n + s.questions.length, 0),
  };
}

// ============================================================
// Ensamblado de un workflow completo
// ============================================================
export async function assembleWorkflow(uuid: string): Promise<NormalizedWorkflowForm> {
  const workflowRaw = (await retrieveWorkflowRaw(uuid)) as Record<string, unknown>;
  const qUuids = extractQuestionnaireUuids(workflowRaw);

  const questionnaires: NormalizedWorkflowForm["questionnaires"] = [];
  const langs = new Set<string>();
  let defaultLanguage: string | null = null;

  for (const qUuid of qUuids) {
    try {
      const qRaw = await retrieveQuestionnaireRaw(qUuid);
      const norm = normalizeQuestionnaire(qRaw);
      (norm.source.languages ?? []).forEach((l) => langs.add(l));
      if (!defaultLanguage) defaultLanguage = norm.source.defaultLanguage;
      questionnaires.push({
        uuid: qUuid,
        title: norm.source.title,
        sections: norm.sections.map((s) => ({ ...s, questionnaireUuid: qUuid })),
      });
    } catch {
      /* omite un questionnaire que falle */
    }
  }

  const sections = questionnaires.flatMap((q) => q.sections);

  return {
    source: {
      kind: "workflow",
      workflowUuid: uuid,
      label: (workflowRaw.workflow_label as string) ?? null,
      type: (workflowRaw.workflow_type as string) ?? null,
      languages: langs.size ? [...langs] : null,
      defaultLanguage,
    },
    questionnaires,
    sections,
    questionCount: sections.reduce((n, s) => n + s.questions.length, 0),
  };
}
