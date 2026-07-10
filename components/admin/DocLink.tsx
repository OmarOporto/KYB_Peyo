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
      className="text-brand hover:underline disabled:opacity-50"
    >
      {loading ? "…" : filename}
    </button>
  );
}
