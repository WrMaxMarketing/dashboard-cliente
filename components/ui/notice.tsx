import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// Caixa de aviso padronizada (uma escala de cor/peso/ícone para todo o app),
// evitando as variações ad-hoc de âmbar/vermelho que existiam espalhadas.
type NoticeTone = "warning" | "info" | "success" | "destructive";

const TONES: Record<NoticeTone, { icon: LucideIcon; cls: string }> = {
  warning: {
    icon: AlertTriangle,
    cls: "border-warning/40 bg-warning/10 text-warning",
  },
  info: { icon: Info, cls: "border-info/30 bg-info/10 text-info" },
  success: {
    icon: CheckCircle2,
    cls: "border-success/30 bg-success/10 text-success",
  },
  destructive: {
    icon: XCircle,
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

export function Notice({
  tone = "warning",
  icon,
  children,
  className,
}: {
  tone?: NoticeTone;
  // Permite trocar o ícone padrão do tom (ex.: Clock para "fora do horário").
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: DefaultIcon, cls } = TONES[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm font-medium",
        cls,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
