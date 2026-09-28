import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Card das telas de autenticação (login do cliente e do admin). Trava a mesma
// hierarquia tipográfica (wordmark eyebrow + título do produto) e largura entre
// telas irmãs, eliminando a duplicação e a inversão de wordmark que existiam.
export function AuthCard({
  title,
  description,
  eyebrow = "WRMAX MARKETING & IA",
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow}
        </p>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
