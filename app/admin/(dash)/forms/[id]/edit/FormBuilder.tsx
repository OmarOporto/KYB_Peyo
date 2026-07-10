"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FIELD_TYPES,
  isChoiceType,
  newField,
  newSection,
  resolveText,
  type Condition,
  type ConditionOp,
  type Field,
  type FieldType,
  type FormDefinition,
  type LocalizedText,
  type Section,
} from "@/lib/forms/definition";
import { Button } from "@/components/ui/Button";
import { DynamicForm } from "@/components/forms/DynamicForm";
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

  const allFieldKeys = def.sections.flatMap((s) =>
    s.fields.map((f) => ({ key: f.key, label: resolveText(f.label, locale) || f.key, field: f })),
  );

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
          {def.sections.map((section, si) => (
            <SectionCard
              key={section.id}
              section={section}
              index={si}
              total={def.sections.length}
              locale={locale}
              allFieldKeys={allFieldKeys}
              sections={def.sections}
              t={t}
              update={update}
            />
          ))}
          <Button
            variant="outline"
            onClick={() => update((d) => d.sections.push(newSection()))}
          >
            + {t("addSection")}
          </Button>

          <div className="pt-4">
            <form
              action={deleteForm.bind(null, id)}
              onSubmit={(e) => {
                if (!confirm(t("confirmDelete"))) e.preventDefault();
              }}
            >
              <button className="text-sm text-danger hover:underline">{t("deleteForm")}</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );

  // ----- render helpers use closures over update/locale -----
}

type TFn = ReturnType<typeof useTranslations>;
type KeyInfo = { key: string; label: string; field: Field };

function SectionCard({
  section,
  index,
  total,
  locale,
  allFieldKeys,
  sections,
  t,
  update,
}: {
  section: Section;
  index: number;
  total: number;
  locale: string;
  allFieldKeys: KeyInfo[];
  sections: Section[];
  t: TFn;
  update: (mut: (d: FormDefinition) => void) => void;
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
            onClick={() =>
              update((d) => {
                const [s] = d.sections.splice(index, 1);
                d.sections.splice(index - 1, 0, s);
              })
            }
          />
          <IconBtn
            label="↓"
            disabled={index === total - 1}
            onClick={() =>
              update((d) => {
                const [s] = d.sections.splice(index, 1);
                d.sections.splice(index + 1, 0, s);
              })
            }
          />
          <IconBtn
            label="✕"
            danger
            onClick={() => update((d) => d.sections.splice(index, 1))}
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

function FieldCard({
  field,
  si,
  fi,
  fieldCount,
  locale,
  allFieldKeys,
  t,
  update,
}: {
  field: Field;
  si: number;
  fi: number;
  fieldCount: number;
  locale: string;
  allFieldKeys: KeyInfo[];
  t: TFn;
  update: (mut: (d: FormDefinition) => void) => void;
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
            onClick={() => update((d) => d.sections[si].fields.splice(fi, 1))}
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
          <div key={oi} className="flex items-center gap-2">
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
