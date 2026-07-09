const COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  submitted: "bg-indigo-100 text-indigo-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-400",
};

const LABELS: Record<string, string> = {
  created: "Creada",
  in_progress: "En progreso",
  submitted: "Enviada",
  under_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Expirada",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        COLORS[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
