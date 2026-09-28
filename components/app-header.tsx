import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

// Cabeçalho único das áreas logadas (app e admin). Padroniza wordmark (eyebrow),
// título contextual, elevação (sticky + translúcido), safe-area e o botão Sair —
// que antes divergiam entre as duas telas.
const WIDTHS = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
} as const;

export function AppHeader({
  title,
  eyebrow = "WRMAX MARKETING & IA",
  signOutAction,
  maxWidth = "5xl",
}: {
  title: string;
  eyebrow?: string;
  // Server action de logout (difere entre cliente e admin).
  signOutAction: () => void | Promise<void>;
  maxWidth?: keyof typeof WIDTHS;
}) {
  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div
        className={`mx-auto flex ${WIDTHS[maxWidth]} items-center justify-between px-4 py-3 sm:px-6 sm:py-4`}
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </p>
          <p className="truncate text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
