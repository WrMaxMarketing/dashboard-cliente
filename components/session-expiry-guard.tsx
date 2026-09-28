"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";

// Dispara no instante exato em que a janela de sessao (1h) encerra, com a tela
// aberta: exibe um popup nao dispensavel. Se houver edicao em aberto, deixa o
// cliente salvar ou descartar antes de voltar ao login (para nao perder nem
// gravar rascunho sem querer). Sem edicoes, apenas leva de volta ao login.
export function SessionExpiryGuard({
  expiresAt,
  hasPendingEdits,
  onSave,
  onDiscard,
}: {
  // Timestamp (ms) em que a sessao expira; null se desconhecido (sem timer).
  expiresAt: number | null;
  // Havia alteracoes nao salvas no momento em que a sessao expirou?
  hasPendingEdits?: () => boolean;
  // Persiste as alteracoes pendentes; retorna se salvou com sucesso.
  onSave?: () => Promise<boolean>;
  // Descarta as alteracoes pendentes.
  onDiscard?: () => void;
}) {
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!expiresAt) return;

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      // Congela se havia edicao em aberto no instante da expiracao.
      setPending(hasPendingEdits ? hasPendingEdits() : false);
      setExpired(true);
    };

    const ms = expiresAt - Date.now();
    // Ja expirada ao montar => dispara na hora; senao agenda para o fim da janela.
    if (ms <= 0) {
      fire();
      return;
    }
    const timer = setTimeout(fire, ms);
    return () => clearTimeout(timer);
  }, [expiresAt, hasPendingEdits]);

  // signOut limpa os cookies da sessao e redireciona para /login.
  const goLogin = async () => {
    setBusy(true);
    await signOut();
  };

  const handleSave = async () => {
    setBusy(true);
    setSaveError(false);
    try {
      const ok = onSave ? await onSave() : true;
      if (!ok) {
        setSaveError(true);
        setBusy(false);
        return;
      }
      await signOut();
    } catch {
      setSaveError(true);
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    onDiscard?.();
    await goLogin();
  };

  return (
    <AlertDialog open={expired}>
      <AlertDialogContent
        // Popup obrigatorio: nao fecha por ESC nem por clique fora.
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Sua sessão expirou</AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? "Sua sessão de 1 hora chegou ao fim e você tem alterações não salvas. Salve ou descarte-as antes de entrar novamente."
              : "Sua sessão de 1 hora chegou ao fim. Para manter a consistência dos dados, entre novamente para continuar."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {saveError && (
          <p className="text-sm text-destructive" role="alert">
            Não foi possível salvar. Tente novamente ou descarte as alterações.
          </p>
        )}

        <AlertDialogFooter>
          {pending ? (
            <>
              <Button
                variant="ghost"
                size="lg"
                onClick={handleDiscard}
                disabled={busy}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Descartar e sair
              </Button>
              <Button size="lg" onClick={handleSave} disabled={busy}>
                {busy ? "Salvando…" : "Salvar e entrar novamente"}
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={goLogin} disabled={busy}>
              {busy ? "Saindo…" : "Entrar novamente"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
