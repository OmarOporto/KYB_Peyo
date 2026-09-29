import type { OrgOption } from "@/lib/auth/tenant";

/**
 * Selector de organización para CREAR algo (formulario, API key, importación),
 * solo para el admin: un miembro siempre crea en su org y el server ignora el
 * campo (ver resolveCreationOrg). Viaja como campo `org` del `<form>`, o
 * controlado con `value`/`onChange` desde un componente cliente.
 */
export function OrgSelect({
  orgs,
  label,
  defaultValue,
  value,
  onChange,
  className = "",
}: {
  orgs: OrgOption[];
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (orgId: string) => void;
  className?: string;
}) {
  const active = orgs.filter((o) => !o.disabled);
  if (active.length === 0) return null;
  return (
    <label className={`flex flex-col text-xs text-muted ${className}`}>
      {label}
      <select
        name="org"
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="mt-1 h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-brand"
      >
        {active.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
