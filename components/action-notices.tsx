"use client";

import { Notice } from "@/components/ui/notice";
import type { ColunaModo } from "@/lib/board";

// Avisos exibidos nas etapas em que o cliente toma alguma acao (editar/aprovar).
// Sao apenas informativos — nao bloqueiam nem enfileiram nada.
export function ActionNotices({ modo }: { modo: ColunaModo }) {
  if (modo === "leitura") return null;

  if (modo !== "aprovar") return null;

  return (
    <div className="space-y-2">
      <Notice tone="warning">
        Atenção: são aceitas apenas <strong>2 alterações</strong>. Alterações
        adicionais serão cobradas como taxa extra.
      </Notice>
    </div>
  );
}
