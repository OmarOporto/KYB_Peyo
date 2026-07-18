"use client";

import { useEffect, useRef, useState } from "react";
import {
  useForm,
  useFieldArray,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  kybSubmitSchema,
  FORM_STEPS,
  type KybFormValues,
} from "@/lib/forms/schema";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputCls } from "@/components/ui/Field";
import {
  saveDraftAction,
  submitAction,
  uploadDocumentAction,
  deleteDocumentAction,
} from "./actions";

type Doc = {
  id: string;
  doc_type: string;
  filename: string;
  uploaded_at: string;
  storagePath: string;
};

export default function KybForm({
  token,
  initialData,
  initialDocs,
  returnUrl,
}: {
  token: string;
  initialData: Record<string, unknown>;
  initialDocs: Doc[];
  returnUrl?: string;
}) {
  const t = useTranslations("form");
  const [step, setStep] = useState(0);
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Tras enviar, redirige de vuelta a la app del cliente (si hay return_url).
  useEffect(() => {
    if (submitted && returnUrl) {
      const timer = setTimeout(() => {
        window.location.href = returnUrl;
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [submitted, returnUrl]);

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
          storagePath: res.path ?? "",
        },
      ]);
    } else {
      setSubmitError(res.error);
    }
  }

  async function removeDoc(doc: Doc) {
    setSubmitError(null);
    setRemovingId(doc.id);
    try {
      if (doc.storagePath) {
        const res = await deleteDocumentAction(token, doc.storagePath);
        if (!res.ok) {
          setSubmitError(res.error);
          return;
        }
      }
      setDocs((d) => d.filter((x) => x.id !== doc.id));
    } finally {
      setRemovingId(null);
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
      <>
        <AppHeader />
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center p-8">
          <Card className="w-full p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-2xl text-success">
              ✓
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {t("submittedTitle")}
            </h1>
            <p className="mt-2 text-muted">{t("submittedBody")}</p>
            {returnUrl && (
              <div className="mt-6">
                <a
                  href={returnUrl}
                  className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
                >
                  {t("returnCta")}
                </a>
                <p className="mt-2 text-xs text-muted">{t("redirecting")}</p>
              </div>
            )}
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        {/* Progreso */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {t("stepLabel", { current: step + 1, total: FORM_STEPS.length })}:{" "}
              <span className="text-muted">{t(`steps.${current.id}`)}</span>
            </span>
            <span className="text-muted">
              {saveState === "saving"
                ? t("saving")
                : saveState === "saved"
                  ? t("draftSaved")
                  : ""}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-1.5 rounded-full bg-linear-to-r from-brand to-accent transition-all"
              style={{ width: `${((step + 1) / FORM_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {step === 0 && (
              <>
                <Field label={t("fields.legalName")} error={err("legalName")}>
                  <input className={inputCls} {...register("legalName")} />
                </Field>
                <Field label={t("fields.tradeName")}>
                  <input className={inputCls} {...register("tradeName")} />
                </Field>
                <Field label={t("fields.registrationNumber")} error={err("registrationNumber")}>
                  <input className={inputCls} {...register("registrationNumber")} />
                </Field>
                <Field label={t("fields.taxId")} error={err("taxId")}>
                  <input className={inputCls} {...register("taxId")} />
                </Field>
                <Field label={t("fields.incorporationDate")} error={err("incorporationDate")}>
                  <input type="date" className={inputCls} {...register("incorporationDate")} />
                </Field>
                <Field label={t("fields.legalForm")} error={err("legalForm")}>
                  <input className={inputCls} placeholder={t("legalFormPlaceholder")} {...register("legalForm")} />
                </Field>
                <Field label={t("fields.country")} error={err("country")}>
                  <input className={inputCls} {...register("country")} />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field label={t("fields.addressLine")} error={err("addressLine")}>
                  <input className={inputCls} {...register("addressLine")} />
                </Field>
                <Field label={t("fields.city")} error={err("city")}>
                  <input className={inputCls} {...register("city")} />
                </Field>
                <Field label={t("fields.state")}>
                  <input className={inputCls} {...register("state")} />
                </Field>
                <Field label={t("fields.postalCode")}>
                  <input className={inputCls} {...register("postalCode")} />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field label={t("fields.repFirstName")} error={err("repFirstName")}>
                  <input className={inputCls} {...register("repFirstName")} />
                </Field>
                <Field label={t("fields.repLastName")} error={err("repLastName")}>
                  <input className={inputCls} {...register("repLastName")} />
                </Field>
                <Field label={t("fields.repEmail")} error={err("repEmail")}>
                  <input type="email" className={inputCls} {...register("repEmail")} />
                </Field>
                <Field label={t("fields.repPhone")} error={err("repPhone")}>
                  <input className={inputCls} {...register("repPhone")} />
                </Field>
                <Field label={t("fields.repDocumentId")} error={err("repDocumentId")}>
                  <input className={inputCls} {...register("repDocumentId")} />
                </Field>
              </>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {owners.fields.map((f, i) => (
                  <div key={f.id} className="rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {t("beneficiary", { n: i + 1 })}
                      </span>
                      {owners.fields.length > 1 && (
                        <button
                          type="button"
                          className="text-sm text-danger hover:underline"
                          onClick={() => owners.remove(i)}
                        >
                          {t("remove")}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <Field label={t("fields.boFullName")} error={err(`beneficialOwners.${i}.fullName`)}>
                        <input className={inputCls} {...register(`beneficialOwners.${i}.fullName`)} />
                      </Field>
                      <Field label={t("fields.boDocumentId")} error={err(`beneficialOwners.${i}.documentId`)}>
                        <input className={inputCls} {...register(`beneficialOwners.${i}.documentId`)} />
                      </Field>
                      <Field label={t("fields.boOwnershipPct")} error={err(`beneficialOwners.${i}.ownershipPct`)}>
                        <input
                          type="number"
                          step="0.01"
                          className={inputCls}
                          {...register(`beneficialOwners.${i}.ownershipPct`, { valueAsNumber: true })}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    owners.append({ fullName: "", documentId: "", ownershipPct: 0 })
                  }
                >
                  {t("addBeneficiary")}
                </Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border p-4">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {t("documentsTitle")}
                  </p>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <span className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
                      {uploading ? "…" : t("chooseFile")}
                    </span>
                    <input
                      type="file"
                      disabled={uploading}
                      onChange={(e) => onFile(e, "general")}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-1 text-xs text-muted">{t("documentsHint")}</p>
                  {docs.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {docs.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-muted">
                          <span className="text-success">✓</span>
                          <span className="min-w-0 flex-1 truncate">{d.filename}</span>
                          <button
                            type="button"
                            className="shrink-0 cursor-pointer text-xs text-danger hover:underline disabled:opacity-50"
                            onClick={() => removeDoc(d)}
                            disabled={removingId !== null || uploading}
                          >
                            {removingId === d.id ? "…" : t("remove")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[color:var(--brand)]"
                    {...register("acceptTerms")}
                  />
                  <span>{t("acceptTerms")}</span>
                </label>
                {err("acceptTerms") && (
                  <p className="text-sm text-danger">{err("acceptTerms")}</p>
                )}
              </div>
            )}

            {submitError && <p className="text-sm text-danger">{submitError}</p>}

            {/* Navegación */}
            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(s - 1, 0))}
              >
                ← {t("back")}
              </Button>
              {isLast ? (
                <Button type="submit" disabled={formState.isSubmitting}>
                  {formState.isSubmitting ? t("submitting") : t("submit")}
                </Button>
              ) : (
                <Button type="button" onClick={next}>
                  {t("continue")} →
                </Button>
              )}
            </div>
          </form>
        </Card>
      </main>
    </>
  );

  function err(name: FieldPath<KybFormValues>): string | undefined {
    const e = name
      .split(".")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce<any>((acc, k) => acc?.[k], formState.errors);
    return e?.message as string | undefined;
  }
}
