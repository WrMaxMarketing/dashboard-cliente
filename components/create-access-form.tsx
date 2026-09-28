"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  createClientAccess,
  type CreateAccessState,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initial: CreateAccessState = {};

export function CreateAccessForm({ clientes }: { clientes: string[] }) {
  const [state, action, pending] = useActionState(createClientAccess, initial);
  const [cliente, setCliente] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa o form depois de criar com sucesso (reset intencional pos-submit).
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCliente("");
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {/* Carrega o cliente selecionado no FormData */}
      <input type="hidden" name="cliente" value={cliente} />

      <div className="space-y-2">
        <Label htmlFor="email">Email do cliente</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          placeholder="contato@cliente.com"
          disabled={pending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="new-password"
            placeholder="mínimo 6 caracteres"
            disabled={pending}
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 m-0.5 flex w-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {mostrarSenha ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Cliente (do Notion)</Label>
        <Select value={cliente} onValueChange={setCliente} disabled={pending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o cliente…" />
          </SelectTrigger>
          <SelectContent>
            {clientes.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm font-medium text-success" role="status">
          {state.success}
        </p>
      )}

      {!cliente && (
        <p className="text-xs text-muted-foreground">
          Selecione um cliente para liberar a criação do acesso.
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending || !cliente}>
        {pending ? "Criando…" : "Criar acesso do cliente"}
      </Button>
    </form>
  );
}
