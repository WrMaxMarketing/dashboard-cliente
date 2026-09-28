"use client";

import { FileDown } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="t-pill inline-flex items-center gap-1.5" aria-current="true">
      <FileDown className="h-3.5 w-3.5" aria-hidden /> Exportar PDF
    </button>
  );
}
