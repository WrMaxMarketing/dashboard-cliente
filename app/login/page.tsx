import { LoginForm } from "@/components/login-form";
import { ModeToggle } from "@/components/mode-toggle";
import { AuthCard } from "@/components/auth-card";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center px-4">
      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))]">
        <ModeToggle />
      </div>
      <AuthCard
        title="Aprovação de Conteúdos"
        description="Entre com seu email e senha."
      >
        <LoginForm />
      </AuthCard>
    </main>
  );
}
