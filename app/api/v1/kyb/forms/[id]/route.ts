import { NextRequest, NextResponse } from "next/server";
import { apiGuard } from "@/lib/auth/apiGuard";
import { createServiceClient } from "@/lib/supabase/service";
import { formDefinitionSchema } from "@/lib/forms/definition";

export const runtime = "nodejs";

/**
 * GET /api/v1/kyb/forms/:id
 *
 * Contrato del formulario PUBLICADO: las claves que el cliente consume, con su
 * tipo, obligatoriedad, etiquetas y opciones. Existe para que el cliente monte
 * un chequeo en CI que compare este esquema contra las claves que su código lee
 * y falle antes de desplegar.
 *
 * Se excluyen a propósito `visibleIf`, `review` (metadata de DIDIT), imágenes e
 * ids internos: cuanto menos superficie, menos contrato público que sostener.
 *
 * Solo formularios `published` (404 si no). No hay chequeo de pertenencia
 * porque los formularios no tienen dueño, a diferencia de las solicitudes: al
 * cliente se le entrega su `FORM_ID` al integrar.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await apiGuard(req.headers.get("authorization"));
  if ("response" in g) return g.response;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("forms")
    .select("id, version, definition")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = formDefinitionSchema.safeParse(data.definition);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_definition" }, { status: 500 });
  }
  const def = parsed.data;

  // Las etiquetas viajan como `LocalizedText` crudo (todos los locales) para que
  // el consumidor compare sin ambigüedad de idioma.
  const fields = def.sections.flatMap((section) =>
    section.fields
      .filter((f) => f.type !== "note")
      .map((f) => ({
        key: f.key,
        type: f.type,
        required: Boolean(f.required),
        section: section.id,
        label: f.label,
        ...(f.options
          ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) }
          : {}),
      })),
  );

  return NextResponse.json({
    id: data.id,
    revision: (data.version as number | null) ?? 1,
    locales: def.locales,
    defaultLocale: def.defaultLocale,
    fields,
  });
}
