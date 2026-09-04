/**
 * Origen de una solicitud: intake web público vs. creada por un cliente vía API.
 * La señal es `kyb_requests.api_key_id` (NULL ⇔ web), no el prefijo de
 * `external_ref`: ese texto lo elige el cliente y puede imitar al del intake web.
 */
export function OriginBadge({ label, api }: { label: string; api: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        api ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted"
      }`}
    >
      {label}
    </span>
  );
}
