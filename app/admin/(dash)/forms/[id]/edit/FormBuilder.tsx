"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FIELD_TYPES,
  DIDIT_FEATURES,
  DIDIT_FEATURE_COMPAT,
  isChoiceType,
  isDiditCompatible,
  newField,
  newSection,
  resolveText,
  type Condition,
  type ConditionOp,
  type Field,
  type FieldReview,
  type FieldType,
  type FormDefinition,
  type LocalizedText,
  type Section,
} from "@/lib/forms/definition";
import {
  FIELD_PRESETS,
  presetCategories,
  buildInsertFields,
  type FieldPreset,
  type PresetCategory,
} from "@/lib/forms/presets";
import { Button } from "@/components/ui/Button";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { ImageUpload } from "@/components/forms/ImageUpload";
import { saveForm, setFormStatus, deleteForm } from "../../actions";

// ---------- helpers de LocalizedText ----------
function getLoc(v: LocalizedText | undefined, locale: string): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v[locale] ?? "";
}
function setLoc(
  v: LocalizedText | undefined,
  locale: string,
  val: string,
): Record<string, string> {
  const base = typeof v === "object" && v ? { ...v } : {};
  base[locale] = val;
  return base;
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const smallInput =
  "rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-brand";
// Selects con etiquetas largas (preguntas/opciones): acotados para no desbordar.
const smallSelect = `${smallInput} min-w-0 max-w-[12rem] truncate`;

export function FormBuilder({
  id,
  initialName,
  initialStatus,
  initialDef,
}: {
  id: string;
  initialName: string;
  initialStatus: "draft" | "published";
  initialDef: FormDefinition;
}) {
  const t = useTranslations("builder");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [def, setDef] = useState<FormDefinition>(initialDef);
  const [status, setStatus] = useState(initialStatus);
  const [locale, setActiveLocale] = useState(def.defaultLocale || "es");
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerPresetId, setPickerPresetId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  function askConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmState({ message, resolve }));
  }
  const deleteFormRef = useRef<HTMLFormElement | null>(null);

  function update(mut: (d: FormDefinition) => void) {
    setDef((prev) => {
      const d = structuredClone(prev);
      mut(d);
      return d;
    });
  }

  async function onSave() {
    setBusy(true);
    setMsg(null);
    const res = await saveForm(id, { name, definition: def });
    setBusy(false);
    setMsg(res.ok ? t("saved") : res.error);
    if (res.ok) router.refresh();
  }

  async function onTogglePublish() {
    const next = status === "published" ? "draft" : "published";
    const res = await setFormStatus(id, next);
    if (res.ok) {
      setStatus(next);
      setMsg(next === "published" ? t("published") : t("unpublished"));
    } else setMsg(res.error);
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "form"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function insertPreset(presetId: string, selected: string[], target: string) {
    const preset = FIELD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const existingKeys = def.sections.flatMap((s) => s.fields.map((f) => f.key));
    const { fields, autoAdded, skipped } = buildInsertFields(preset, selected, existingKeys);
    if (!fields.length) {
      setMsg(t("presetNoneSelected"));
      return;
    }
    update((d) => {
      if (target === "__new__") {
        const s = newSection();
        s.title = preset.label;
        s.fields.push(...fields);
        d.sections.push(s);
        return;
      }
      let idx = d.sections.findIndex((x) => x.id === target);
      if (idx === -1) {
        if (d.sections.length === 0) d.sections.push(newSection());
        idx = 0;
      }
      d.sections[idx].fields.push(...fields);
    });
    let m = t("presetInserted");
    if (autoAdded.length) m += ` (+${autoAdded.length} ${t("presetDepsNote")})`;
    if (skipped.length) m += ` — ${t("presetDuplicateKeys")}: ${skipped.join(", ")}`;
    setMsg(m);
    setPickerPresetId(null);
  }

  function moveSection(from: number, to: number) {
    if (from === to) return;
    update((d) => {
      if (from < 0 || to < 0 || from >= d.sections.length || to >= d.sections.length) return;
      const [s] = d.sections.splice(from, 1);
      d.sections.splice(to, 0, s);
    });
    setActiveSection(to);
  }

  const allFieldKeys = def.sections.flatMap((s) =>
    s.fields.map((f) => ({ key: f.key, label: resolveText(f.label, locale) || f.key, field: f })),
  );
  const activeIdx = Math.min(Math.max(activeSection, 0), Math.max(def.sections.length - 1, 0));

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} max-w-xs`}
          placeholder={t("formName")}
        />
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            status === "published" ? "bg-success/15 text-success" : "bg-surface-2 text-muted"
          }`}
        >
          {status === "published" ? t("published") : t("draft")}
        </span>
        {status === "published" && (
          <a
            href={`/forms/${id}`}
            target="_blank"
            rel="noopener"
            className="text-xs font-medium text-brand hover:underline"
          >
            {t("viewPublic")}
          </a>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Locale tabs */}
          <div className="flex overflow-hidden rounded-lg border border-border">
            {def.locales.map((l) => (
              <button
                key={l}
                onClick={() => setActiveLocale(l)}
                className={`px-2.5 py-1 text-xs font-medium ${
                  locale === l ? "bg-brand text-white" : "bg-surface text-muted"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? t("edit") : t("preview")}
          </Button>
          <Button variant="outline" size="sm" onClick={onExport}>
            {t("exportJson")}
          </Button>
          <Button variant="outline" size="sm" onClick={onTogglePublish}>
            {status === "published" ? t("unpublish") : t("publish")}
          </Button>
          <Button size="sm" onClick={onSave} disabled={busy}>
            {busy ? "…" : t("save")}
          </Button>
        </div>
      </div>
      {msg && <p className="mb-3 text-sm text-muted">{msg}</p>}

      {preview ? (
        <div className="mx-auto max-w-2xl">
          <DynamicForm definition={def} locale={locale} mode="preview" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selector de packs de campos prearmados */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2/40 p-3">
            <span className="text-xs font-semibold uppercase text-muted">
              {t("addPreset")}
            </span>
            <select
              className={smallInput}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                e.currentTarget.value = "";
                if (v) setPickerPresetId(v);
              }}
            >
              <option value="">{t("presetPlaceholder")}</option>
              {FIELD_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {resolveText(p.label, locale)}
                </option>
              ))}
            </select>
          </div>
          {pickerPresetId && (
            <PresetPicker
              key={pickerPresetId}
              preset={FIELD_PRESETS.find((p) => p.id === pickerPresetId)!}
              sections={def.sections}
              locale={locale}
              t={t}
              onCancel={() => setPickerPresetId(null)}
              onInsert={(selected, target) => insertPreset(pickerPresetId, selected, target)}
            />
          )}
          {/* Paginador de secciones (clic para ver, arrastrar para reordenar) */}
          {def.sections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {def.sections.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  draggable
                  onClick={() => setActiveSection(i)}
                  onDragStart={() => {
                    dragFrom.current = i;
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(i);
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                    setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom.current !== null) moveSection(dragFrom.current, i);
                    dragFrom.current = null;
                    setDragOver(null);
                  }}
                  title={resolveText(s.title, locale) || `${t("section")} ${i + 1}`}
                  className={`h-9 min-w-9 cursor-grab rounded-lg border px-2 text-sm font-medium transition-colors active:cursor-grabbing ${
                    i === activeIdx
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-surface text-foreground hover:bg-surface-2"
                  } ${dragOver === i ? "ring-2 ring-brand/50" : ""}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          {def.sections[activeIdx] && (
            <SectionCard
              key={def.sections[activeIdx].id}
              section={def.sections[activeIdx]}
              index={activeIdx}
              total={def.sections.length}
              locale={locale}
              allFieldKeys={allFieldKeys}
              sections={def.sections}
              t={t}
              update={update}
              onMove={moveSection}
              askConfirm={askConfirm}
            />
          )}
          <Button
            variant="outline"
            onClick={() => {
              const n = def.sections.length;
              update((d) => d.sections.push(newSection()));
              setActiveSection(n);
            }}
          >
            + {t("addSection")}
          </Button>

          <div className="pt-4">
            <form ref={deleteFormRef} action={deleteForm.bind(null, id)}>
              <button
                type="button"
                className="text-sm text-danger hover:underline"
                onClick={async () => {
                  if (await askConfirm(t("confirmDelete"))) deleteFormRef.current?.requestSubmit();
                }}
              >
                {t("deleteForm")}
              </button>
            </form>
          </div>
        </div>
      )}
      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          confirmLabel={t("delete")}
          cancelLabel={t("cancel")}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        />
      )}
    </main>
  );

  // ----- render helpers use closures over update/locale -----
}

type TFn = ReturnType<typeof useTranslations>;
type KeyInfo = { key: string; label: string; field: Field };

// ---------- Picker de campos prearmados ----------
function PresetPicker({
  preset,
  sections,
  locale,
  t,
  onCancel,
  onInsert,
}: {
  preset: FieldPreset;
  sections: Section[];
  locale: string;
  t: TFn;
  onCancel: () => void;
  onInsert: (selected: string[], target: string) => void;
}) {
  const categories = useMemo(() => presetCategories(preset), [preset]);
  const existingKeys = useMemo(
    () => sections.flatMap((s) => s.fields.map((f) => f.key)),
    [sections],
  );
  const existingSet = useMemo(() => new Set(existingKeys), [existingKeys]);
  const isEmpty =
    sections.length === 0 || (sections.length === 1 && sections[0].fields.length === 0);

  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(sections[0]?.id ?? "__new__");

  const preview = useMemo(
    () => buildInsertFields(preset, selected, existingKeys),
    [preset, selected, existingKeys],
  );

  function toggle(key: string) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }
  function toggleCategory(cat: PresetCategory) {
    const keys = cat.items.map((i) => i.key).filter((k) => !existingSet.has(k));
    const allOn = keys.length > 0 && keys.every((k) => selected.includes(k));
    setSelected((s) =>
      allOn ? s.filter((k) => !keys.includes(k)) : Array.from(new Set([...s, ...keys])),
    );
  }

  return (
    <div className="rounded-2xl border border-brand/40 bg-surface-card p-4 shadow-md ring-1 ring-brand/10">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold">
          {t("addPreset")}: {resolveText(preset.label, locale)}
        </span>
        <button onClick={onCancel} className="ml-auto text-sm text-muted hover:underline">
          {t("presetCancel")}
        </button>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => {
          const keys = cat.items.map((i) => i.key).filter((k) => !existingSet.has(k));
          const allOn = keys.length > 0 && keys.every((k) => selected.includes(k));
          const someOn = keys.some((k) => selected.includes(k));
          return (
            <div key={cat.id} className="rounded-xl border border-border bg-surface p-3">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn && !allOn;
                  }}
                  disabled={keys.length === 0}
                  onChange={() => toggleCategory(cat)}
                />
                {resolveText(cat.label, locale)}
              </label>
              <div className="grid gap-1 sm:grid-cols-2">
                {cat.items.map((it) => {
                  const exists = existingSet.has(it.key);
                  return (
                    <label
                      key={it.key}
                      className={`flex items-center gap-2 text-xs ${exists ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="accent-brand"
                        checked={exists || selected.includes(it.key)}
                        disabled={exists}
                        onChange={() => toggle(it.key)}
                      />
                      <span className="truncate">{resolveText(it.label, locale) || it.key}</span>
                      {exists && <span className="text-muted">({t("presetAlreadyExists")})</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {isEmpty ? (
          <span className="text-xs text-muted">{t("presetEmptyTargetHint")}</span>
        ) : (
          <label className="flex items-center gap-2 text-xs text-muted">
            {t("presetTarget")}
            <select className={smallInput} value={target} onChange={(e) => setTarget(e.target.value)}>
              {sections.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {resolveText(s.title, locale) || t("section")}
                </option>
              ))}
              <option value="__new__">{t("presetNewSection")}</option>
            </select>
          </label>
        )}
        <span className="text-xs text-muted">
          {selected.length} {t("presetSelectedCount")}
          {preview.autoAdded.length > 0 && ` · +${preview.autoAdded.length} ${t("presetDepsNote")}`}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={preview.fields.length === 0}
          onClick={() => onInsert(selected, isEmpty ? (sections[0]?.id ?? "__new__") : target)}
        >
          {t("presetInsertSelected")}
        </Button>
      </div>
    </div>
  );
}

function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface-card p-5 shadow-xl">
        <p className="text-sm text-foreground">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  index,
  total,
  locale,
  allFieldKeys,
  sections,
  t,
  update,
  onMove,
  askConfirm,
}: {
  section: Section;
  index: number;
  total: number;
  locale: string;
  allFieldKeys: KeyInfo[];
  sections: Section[];
  t: TFn;
  update: (mut: (d: FormDefinition) => void) => void;
  onMove: (from: number, to: number) => void;
  askConfirm: (message: string) => Promise<boolean>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-card p-4 shadow-md ring-1 ring-black/5 dark:ring-white/10">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase text-muted">
          {t("section")} {index + 1}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn
            label="↑"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
          />
          <IconBtn
            label="↓"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
          />
          <IconBtn
            label="✕"
            danger
            onClick={async () => {
              if (await askConfirm(t("confirmDeleteSection")))
                update((d) => d.sections.splice(index, 1));
            }}
          />
        </div>
      </div>

      <input
        className={inputCls}
        placeholder={t("sectionTitle")}
        value={getLoc(section.title, locale)}
        onChange={(e) =>
          update((d) => {
            d.sections[index].title = setLoc(d.sections[index].title, locale, e.target.value);
          })
        }
      />
      <input
        className={`${inputCls} mt-2`}
        placeholder={t("sectionDescription")}
        value={getLoc(section.description, locale)}
        onChange={(e) =>
          update((d) => {
            d.sections[index].description = setLoc(
              d.sections[index].description,
              locale,
              e.target.value,
            );
          })
        }
      />

      {/* visibleIf de sección */}
      <ConditionRow
        label={t("showSectionIf")}
        condition={section.visibleIf}
        fieldKeys={allFieldKeys}
        locale={locale}
        t={t}
        onChange={(c) => update((d) => (d.sections[index].visibleIf = c))}
      />

      {/* Campos */}
      <div className="mt-4 space-y-3">
        {section.fields.map((field, fi) => (
          <FieldCard
            key={field.id}
            field={field}
            si={index}
            fi={fi}
            fieldCount={section.fields.length}
            locale={locale}
            allFieldKeys={allFieldKeys}
            t={t}
            update={update}
            askConfirm={askConfirm}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          className={smallInput}
          value=""
          onChange={(e) => {
            const type = e.target.value as FieldType;
            if (type) update((d) => d.sections[index].fields.push(newField(type)));
            e.target.value = "";
          }}
        >
          <option value="">+ {t("addField")}</option>
          {FIELD_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(`type_${ft}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Saltos de sección */}
      <NavRulesEditor
        section={section}
        si={index}
        sections={sections}
        fieldKeys={allFieldKeys}
        locale={locale}
        t={t}
        update={update}
      />
    </div>
  );
}

// ---------- Editor de revisión DIDIT (popover por campo) ----------
function DiditReviewEditor({
  field,
  t,
  onChange,
}: {
  field: Field;
  t: TFn;
  onChange: (review: FieldReview | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = field.review?.feature;
  const compatible = current ? isDiditCompatible(current, field.type) : true;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
          current
            ? compatible
              ? "border-brand/40 bg-brand/10 text-brand"
              : "border-danger/40 bg-danger/10 text-danger"
            : "border-border bg-surface text-muted hover:bg-surface-2"
        }`}
      >
        {current ? `DIDIT: ${t(`didit_${current}`)}${compatible ? "" : " ⚠"}` : `+ ${t("diditReview")}`}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-border bg-surface-card p-2 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
            <p className="mb-1 px-1 text-xs font-semibold text-muted">{t("diditReview")}</p>
            {current && !compatible && (
              <p className="mb-1 px-1 text-[10px] text-danger">{t("diditIncompatible")}</p>
            )}
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className={`block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-2 ${
                !current ? "font-semibold text-foreground" : "text-muted"
              }`}
            >
              {t("diditNone")}
            </button>
            {DIDIT_FEATURES.map((f) => {
              const ok = isDiditCompatible(f, field.type);
              return (
                <button
                  key={f}
                  type="button"
                  disabled={!ok}
                  onClick={() => {
                    onChange({ provider: "didit", feature: f });
                    setOpen(false);
                  }}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${
                    ok ? "hover:bg-surface-2" : "cursor-not-allowed opacity-40"
                  } ${current === f ? "font-semibold text-brand" : "text-foreground"}`}
                >
                  {t(`didit_${f}`)}
                  {!ok && (
                    <span className="mt-0.5 block text-[10px] text-muted">
                      {t("diditRequiresType")}:{" "}
                      {DIDIT_FEATURE_COMPAT[f].map((ty) => t(`type_${ty}`)).join(", ")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function FieldCard({
  field,
  si,
  fi,
  fieldCount,
  locale,
  allFieldKeys,
  t,
  update,
  askConfirm,
}: {
  field: Field;
  si: number;
  fi: number;
  fieldCount: number;
  locale: string;
  allFieldKeys: KeyInfo[];
  t: TFn;
  update: (mut: (d: FormDefinition) => void) => void;
  askConfirm: (message: string) => Promise<boolean>;
}) {
  const mut = (fn: (f: Field) => void) =>
    update((d) => fn(d.sections[si].fields[fi]));

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <select
          className={smallInput}
          value={field.type}
          onChange={(e) => mut((f) => (f.type = e.target.value as FieldType))}
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(`type_${ft}`)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-brand"
            checked={field.required}
            onChange={(e) => mut((f) => (f.required = e.target.checked))}
          />
          {t("required")}
        </label>
        {field.type !== "note" && (
          <DiditReviewEditor
            field={field}
            t={t}
            onChange={(review) =>
              mut((f) => {
                if (review) f.review = review;
                else delete f.review;
              })
            }
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconBtn
            label="↑"
            disabled={fi === 0}
            onClick={() =>
              update((d) => {
                const arr = d.sections[si].fields;
                const [f] = arr.splice(fi, 1);
                arr.splice(fi - 1, 0, f);
              })
            }
          />
          <IconBtn
            label="↓"
            disabled={fi === fieldCount - 1}
            onClick={() =>
              update((d) => {
                const arr = d.sections[si].fields;
                const [f] = arr.splice(fi, 1);
                arr.splice(fi + 1, 0, f);
              })
            }
          />
          <IconBtn
            label="✕"
            danger
            onClick={async () => {
              if (await askConfirm(t("confirmDeleteField")))
                update((d) => d.sections[si].fields.splice(fi, 1));
            }}
          />
        </div>
      </div>

      <input
        className={inputCls}
        placeholder={t("fieldLabel")}
        value={getLoc(field.label, locale)}
        onChange={(e) => mut((f) => (f.label = setLoc(f.label, locale, e.target.value)))}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className={`${smallInput} flex-1`}
          placeholder={t("fieldKey")}
          value={field.key}
          onChange={(e) => mut((f) => (f.key = e.target.value.replace(/\s+/g, "_")))}
        />
        <input
          className={`${smallInput} flex-1`}
          placeholder={t("placeholder")}
          value={getLoc(field.placeholder, locale)}
          onChange={(e) =>
            mut((f) => (f.placeholder = setLoc(f.placeholder, locale, e.target.value)))
          }
        />
      </div>

      {/* Imagen de ayuda de la pregunta */}
      <ImageUpload
        value={field.image}
        onChange={(url) => mut((f) => (f.image = url))}
        label={t("helpImage")}
      />

      {/* Opciones */}
      {isChoiceType(field.type) && (
        <OptionsEditor field={field} si={si} fi={fi} locale={locale} t={t} update={update} />
      )}

      {/* Config de archivo */}
      {field.type === "file" && (
        <FileConfigEditor field={field} mut={mut} t={t} />
      )}

      {/* visibleIf del campo */}
      <ConditionRow
        label={t("showFieldIf")}
        condition={field.visibleIf}
        fieldKeys={allFieldKeys.filter((k) => k.key !== field.key)}
        locale={locale}
        t={t}
        onChange={(c) => mut((f) => (f.visibleIf = c))}
      />
    </div>
  );
}

function OptionsEditor({
  field,
  si,
  fi,
  locale,
  t,
  update,
}: {
  field: Field;
  si: number;
  fi: number;
  locale: string;
  t: TFn;
  update: (mut: (d: FormDefinition) => void) => void;
}) {
  const options = field.options ?? [];
  return (
    <div className="mt-2 rounded-lg bg-surface-2 p-2">
      <p className="mb-1 text-xs font-medium text-muted">{t("options")}</p>
      <div className="space-y-1.5">
        {options.map((o, oi) => (
          <div key={oi} className="rounded-md border border-border/60 p-1.5">
            <div className="flex items-center gap-2">
            <input
              className={`${smallInput} min-w-0 flex-1`}
              placeholder={t("optionLabel")}
              value={getLoc(o.label, locale)}
              onChange={(e) =>
                update((d) => {
                  const opt = d.sections[si].fields[fi].options![oi];
                  opt.label = setLoc(opt.label, locale, e.target.value);
                  if (!opt.value) opt.value = e.target.value.trim().slice(0, 40) || `opt_${oi}`;
                })
              }
            />
            <input
              className={`${smallInput} w-32`}
              placeholder="value"
              value={o.value}
              onChange={(e) =>
                update((d) => (d.sections[si].fields[fi].options![oi].value = e.target.value))
              }
            />
            <IconBtn
              label="✕"
              danger
              onClick={() =>
                update((d) => d.sections[si].fields[fi].options!.splice(oi, 1))
              }
            />
            </div>
            <ImageUpload
              size="sm"
              value={o.image}
              onChange={(url) =>
                update((d) => {
                  d.sections[si].fields[fi].options![oi].image = url;
                })
              }
            />
          </div>
        ))}
      </div>
      <button
        className="mt-1.5 text-xs text-brand hover:underline"
        onClick={() =>
          update((d) => {
            const arr = (d.sections[si].fields[fi].options ??= []);
            arr.push({ value: `opt_${arr.length + 1}`, label: { es: "", en: "" } });
          })
        }
      >
        + {t("addOption")}
      </button>
    </div>
  );
}

function FileConfigEditor({
  field,
  mut,
  t,
}: {
  field: Field;
  mut: (fn: (f: Field) => void) => void;
  t: TFn;
}) {
  const cfg = field.file ?? { accept: [], multiple: false, maxSizeMB: 15 };
  return (
    <div className="mt-2 rounded-lg bg-surface-2 p-2">
      <p className="mb-1 text-xs font-medium text-muted">{t("fileConfig")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${smallInput} flex-1`}
          placeholder=".pdf,.png,image/*"
          value={cfg.accept.join(",")}
          onChange={(e) =>
            mut(
              (f) =>
                (f.file = {
                  ...cfg,
                  accept: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
            )
          }
        />
        <input
          type="number"
          className={`${smallInput} w-20`}
          value={cfg.maxSizeMB}
          onChange={(e) => mut((f) => (f.file = { ...cfg, maxSizeMB: Number(e.target.value) || 15 }))}
        />
        <span className="text-xs text-muted">MB</span>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-brand"
            checked={cfg.multiple}
            onChange={(e) => mut((f) => (f.file = { ...cfg, multiple: e.target.checked }))}
          />
          {t("multiple")}
        </label>
      </div>
    </div>
  );
}

function ConditionRow({
  label,
  condition,
  fieldKeys,
  locale,
  t,
  onChange,
}: {
  label: string;
  condition?: Condition;
  fieldKeys: KeyInfo[];
  locale: string;
  t: TFn;
  onChange: (c: Condition | undefined) => void;
}) {
  const leaf =
    condition && "field" in condition
      ? condition
      : undefined;
  const enabled = !!leaf;
  const selField = fieldKeys.find((k) => k.key === leaf?.field);
  const selValue = selField?.field.options?.find(
    (o) => o.value === String(leaf?.value ?? ""),
  );
  const selValueLabel = selValue ? resolveText(selValue.label, locale) : undefined;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          className="accent-brand"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { field: fieldKeys[0]?.key ?? "", op: "eq", value: "" }
                : undefined,
            )
          }
        />
        {label}
      </label>
      {enabled && (
        <>
          <select
            className={smallSelect}
            title={selField?.label}
            value={leaf!.field}
            onChange={(e) => onChange({ ...leaf!, field: e.target.value })}
          >
            {fieldKeys.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            className={smallInput}
            value={leaf!.op}
            onChange={(e) => onChange({ ...leaf!, op: e.target.value as ConditionOp })}
          >
            {(["eq", "neq", "in", "not_in", "gt", "lt", "answered"] as ConditionOp[]).map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {leaf!.op !== "answered" &&
            (selField && selField.field.options?.length ? (
              <select
                className={smallSelect}
                title={selValueLabel}
                value={String(leaf!.value ?? "")}
                onChange={(e) => onChange({ ...leaf!, value: e.target.value })}
              >
                <option value="">—</option>
                {selField.field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {resolveText(o.label, locale)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={smallInput}
                placeholder={t("value")}
                value={String(leaf!.value ?? "")}
                onChange={(e) => onChange({ ...leaf!, value: e.target.value })}
              />
            ))}
        </>
      )}
    </div>
  );
}

function NavRulesEditor({
  section,
  si,
  sections,
  fieldKeys,
  locale,
  t,
  update,
}: {
  section: Section;
  si: number;
  sections: Section[];
  fieldKeys: KeyInfo[];
  locale: string;
  t: TFn;
  update: (mut: (d: FormDefinition) => void) => void;
}) {
  const rules = section.next ?? [];
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1 text-xs font-medium text-muted">{t("jumps")}</p>
      {rules.map((rule, ri) => {
        const leaf = "field" in rule.when ? rule.when : undefined;
        const selField = fieldKeys.find((k) => k.key === leaf?.field);
        const selValue = selField?.field.options?.find(
          (o) => o.value === String(leaf?.value ?? ""),
        );
        const selValueLabel = selValue ? resolveText(selValue.label, locale) : undefined;
        return (
          <div key={ri} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{t("if")}</span>
            <select
              className={smallSelect}
              title={selField?.label}
              value={leaf?.field ?? ""}
              onChange={(e) =>
                update((d) => (d.sections[si].next![ri].when = { field: e.target.value, op: leaf?.op ?? "eq", value: leaf?.value }))
              }
            >
              {fieldKeys.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
            <span>=</span>
            {selField && selField.field.options?.length ? (
              <select
                className={smallSelect}
                title={selValueLabel}
                value={String(leaf?.value ?? "")}
                onChange={(e) =>
                  update((d) => (d.sections[si].next![ri].when = { field: leaf!.field, op: "eq", value: e.target.value }))
                }
              >
                <option value="">—</option>
                {selField.field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {resolveText(o.label, locale)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={smallInput}
                value={String(leaf?.value ?? "")}
                onChange={(e) =>
                  update((d) => (d.sections[si].next![ri].when = { field: leaf?.field ?? "", op: "eq", value: e.target.value }))
                }
              />
            )}
            <span>→</span>
            <select
              className={smallSelect}
              value={rule.goTo}
              onChange={(e) => update((d) => (d.sections[si].next![ri].goTo = e.target.value))}
            >
              <option value="SUBMIT">{t("submitEnd")}</option>
              {sections.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {t("section")} {i + 1}
                </option>
              ))}
            </select>
            <IconBtn
              label="✕"
              danger
              onClick={() => update((d) => d.sections[si].next!.splice(ri, 1))}
            />
          </div>
        );
      })}
      <button
        className="text-xs text-brand hover:underline"
        onClick={() =>
          update((d) => {
            const arr = (d.sections[si].next ??= []);
            arr.push({ when: { field: fieldKeys[0]?.key ?? "", op: "eq", value: "" }, goTo: "SUBMIT" });
          })
        }
      >
        + {t("addJump")}
      </button>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-6 w-6 items-center justify-center rounded border border-border text-xs disabled:opacity-30 ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-surface-2"
      }`}
    >
      {label}
    </button>
  );
}
