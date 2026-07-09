"use client";

import { useEffect, useRef, useState } from "react";
import {
  useForm,
  useFieldArray,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  kybSubmitSchema,
  FORM_STEPS,
  type KybFormValues,
} from "@/lib/forms/schema";
import { saveDraftAction, submitAction, uploadDocumentAction } from "./actions";

type Doc = { id: string; doc_type: string; filename: string; uploaded_at: string };

export default function KybForm({
  token,
  initialData,
  initialDocs,
}: {
  token: string;
  initialData: Record<string, unknown>;
  initialDocs: Doc[];
}) {
  const [step, setStep] = useState(0);
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<KybFormValues>({
    resolver: zodResolver(kybSubmitSchema) as unknown as Resolver<KybFormValues>,
    defaultValues: initialData as unknown as KybFormValues,
    mode: "onTouched",
  });
  const { register, control, trigger, handleSubmit, getValues, watch, formState } =
    form;
  const owners = useFieldArray({ control, name: "beneficialOwners" });

  // Autosave con debounce.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sub = watch(() => {
      if (timer.current) clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(async () => {
        await saveDraftAction(token, getValues() as Record<string, unknown>);
        setSaveState("saved");
      }, 1200);
    });
    return () => sub.unsubscribe();
  }, [watch, getValues, token]);

  const current = FORM_STEPS[step];
  const isLast = step === FORM_STEPS.length - 1;

  async function next() {
    const valid = await trigger(
      [...current.fields] as FieldPath<KybFormValues>[],
      { shouldFocus: true },
    );
    if (valid) setStep((s) => Math.min(s + 1, FORM_STEPS.length - 1));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>, docType: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("docType", docType);
    fd.set("file", file);
    const res = await uploadDocumentAction(fd);
    setUploading(false);
    e.target.value = "";
    if (res.ok) {
      setDocs((d) => [
        ...d,
        {
          id: res.path ?? crypto.randomUUID(),
          doc_type: docType,
          filename: res.filename ?? file.name,
          uploaded_at: new Date().toISOString(),
        },
      ]);
    } else {
      setSubmitError(res.error);
    }
  }

  async function onSubmit(values: KybFormValues) {
    setSubmitError(null);
    const res = await submitAction(token, values as Record<string, unknown>);
    if (res.ok) setSubmitted(true);
    else setSubmitError(res.error);
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-semibold">¡Formulario enviado!</h1>
        <p className="text-gray-500">
          Tu información fue recibida y está en revisión. Gracias.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      {/* Progreso */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
          <span>
            Paso {step + 1} de {FORM_STEPS.length}: {current.title}
          </span>
          <span>
            {saveState === "saving"
              ? "Guardando…"
              : saveState === "saved"
                ? "Borrador guardado"
                : ""}
          </span>
        </div>
        <div className="h-1.5 w-full rounded bg-gray-200">
          <div
            className="h-1.5 rounded bg-black transition-all"
            style={{ width: `${((step + 1) / FORM_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {step === 0 && (
          <>
            <Field label="Razón social" error={err("legalName")}>
              <input className={inputCls} {...register("legalName")} />
            </Field>
            <Field label="Nombre comercial">
              <input className={inputCls} {...register("tradeName")} />
            </Field>
            <Field label="Número de registro" error={err("registrationNumber")}>
              <input className={inputCls} {...register("registrationNumber")} />
            </Field>
            <Field label="NIT / Tax ID" error={err("taxId")}>
              <input className={inputCls} {...register("taxId")} />
            </Field>
            <Field label="Fecha de constitución" error={err("incorporationDate")}>
              <input type="date" className={inputCls} {...register("incorporationDate")} />
            </Field>
            <Field label="Forma jurídica" error={err("legalForm")}>
              <input className={inputCls} placeholder="S.R.L., S.A., …" {...register("legalForm")} />
            </Field>
            <Field label="País" error={err("country")}>
              <input className={inputCls} {...register("country")} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Dirección" error={err("addressLine")}>
              <input className={inputCls} {...register("addressLine")} />
            </Field>
            <Field label="Ciudad" error={err("city")}>
              <input className={inputCls} {...register("city")} />
            </Field>
            <Field label="Departamento / Estado">
              <input className={inputCls} {...register("state")} />
            </Field>
            <Field label="Código postal">
              <input className={inputCls} {...register("postalCode")} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Nombres" error={err("repFirstName")}>
              <input className={inputCls} {...register("repFirstName")} />
            </Field>
            <Field label="Apellidos" error={err("repLastName")}>
              <input className={inputCls} {...register("repLastName")} />
            </Field>
            <Field label="Email" error={err("repEmail")}>
              <input type="email" className={inputCls} {...register("repEmail")} />
            </Field>
            <Field label="Teléfono" error={err("repPhone")}>
              <input className={inputCls} {...register("repPhone")} />
            </Field>
            <Field label="Documento de identidad" error={err("repDocumentId")}>
              <input className={inputCls} {...register("repDocumentId")} />
            </Field>
          </>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {owners.fields.map((f, i) => (
              <div key={f.id} className="rounded border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Beneficiario {i + 1}</span>
                  {owners.fields.length > 1 && (
                    <button
                      type="button"
                      className="text-sm text-red-600"
                      onClick={() => owners.remove(i)}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <Field label="Nombre completo" error={err(`beneficialOwners.${i}.fullName`)}>
                  <input className={inputCls} {...register(`beneficialOwners.${i}.fullName`)} />
                </Field>
                <Field label="Documento" error={err(`beneficialOwners.${i}.documentId`)}>
                  <input className={inputCls} {...register(`beneficialOwners.${i}.documentId`)} />
                </Field>
                <Field label="% de participación" error={err(`beneficialOwners.${i}.ownershipPct`)}>
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    {...register(`beneficialOwners.${i}.ownershipPct`, { valueAsNumber: true })}
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              onClick={() =>
                owners.append({ fullName: "", documentId: "", ownershipPct: 0 })
              }
            >
              + Agregar beneficiario
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded border border-gray-200 p-3">
              <p className="mb-2 text-sm font-medium">Documentos</p>
              <input
                type="file"
                disabled={uploading}
                onChange={(e) => onFile(e, "general")}
                className="text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">
                Registro mercantil, poder del representante, etc. (máx 15 MB)
              </p>
              {docs.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {docs.map((d) => (
                    <li key={d.id} className="text-gray-600">
                      ✓ {d.filename}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" {...register("acceptTerms")} />
              <span>
                Confirmo que la información proporcionada es veraz y autorizo su
                verificación.
              </span>
            </label>
            {err("acceptTerms") && (
              <p className="text-sm text-red-600">{err("acceptTerms")}</p>
            )}
          </div>
        )}

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        {/* Navegación */}
        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            className="rounded px-4 py-2 text-sm disabled:opacity-40"
          >
            ← Atrás
          </button>
          {isLast ? (
            <button
              type="submit"
              disabled={formState.isSubmitting}
              className="rounded bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {formState.isSubmitting ? "Enviando…" : "Enviar formulario"}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="rounded bg-black px-5 py-2 text-sm font-medium text-white"
            >
              Continuar →
            </button>
          )}
        </div>
      </form>
    </main>
  );

  function err(name: FieldPath<KybFormValues>): string | undefined {
    const e = name
      .split(".")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce<any>((acc, k) => acc?.[k], formState.errors);
    return e?.message as string | undefined;
  }
}

const inputCls =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
