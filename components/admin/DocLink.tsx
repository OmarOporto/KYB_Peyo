"use client";

import { useState } from "react";
import { getDocUrlAction } from "@/app/admin/actions";

export function DocLink({
  path,
  filename,
}: {
  path: string;
  filename: string;
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const url = await getDocUrlAction(path);
    setLoading(false);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <button
      onClick={open}
      disabled={loading}
      // Un `<button>` centra su texto y no cede ancho: sin esto, un nombre de
      // archivo largo empuja el max-content de su caja y aplasta lo que tenga al
      // lado —o se sale de la tarjeta si no hay espacios donde partir—.
      className="max-w-full break-words text-left text-brand hover:underline disabled:opacity-50"
    >
      {loading ? "…" : filename}
    </button>
  );
}
