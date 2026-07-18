import { NextRequest, NextResponse } from "next/server";
import { apiGuard } from "@/lib/auth/apiGuard";
import { getOwnedRequest } from "@/lib/kyb/apiRequests";
import { createServiceClient } from "@/lib/supabase/service";
import { createSignedDocUrls } from "@/lib/kyb/service";

export const runtime = "nodejs";

/**
 * GET /api/v1/kyb/requests/:id/documents
 * Documentos subidos de la solicitud, con URLs firmadas temporales.
 * Query: expires_in? (segundos, def 3600, 60..86400).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await apiGuard(req.headers.get("authorization"), { failClosed: true });
  if ("response" in g) return g.response;
  const { id } = await params;

  const request = await getOwnedRequest(g.keyId, id, "id");
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const expiresIn = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("expires_in")) || 3600, 60),
    86400,
  );

  const supabase = createServiceClient();
  const { data: docs } = await supabase
    .from("kyb_documents")
    .select("doc_type, filename, mime, size, storage_path, uploaded_at")
    .eq("request_id", id)
    .order("uploaded_at", { ascending: true });

  const signedUrls = await createSignedDocUrls(
    (docs ?? []).map((d) => d.storage_path as string),
    expiresIn,
  );

  return NextResponse.json({
    documents: (docs ?? []).map((d) => ({
      doc_type: d.doc_type,
      filename: d.filename,
      mime: d.mime,
      size: d.size,
      uploaded_at: d.uploaded_at,
      url: signedUrls[d.storage_path as string] ?? null,
    })),
  });
}
