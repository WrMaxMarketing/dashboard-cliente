import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";
import { AppHeader } from "@/components/app-header";
import { AuthCard } from "@/components/auth-card";
import { AdminLogin } from "@/components/admin-login";
import { CreateAccessForm } from "@/components/create-access-form";
import { isAdmin } from "@/lib/admin";
import { adminLogout } from "@/app/admin/actions";
import { getClientesOptions } from "@/lib/notion";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await isAdmin();

  if (!admin) {
    return (
      <main className="relative flex min-h-dvh flex-1 items-center justify-center px-4">
        <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))]">
          <ModeToggle />
        </div>
        <AuthCard
          eyebrow="WRMAX MARKETING & IA · Admin"
          title="Painel do administrador"
          description="Acesso restrito."
        >
          <AdminLogin />
        </AuthCard>
      </main>
    );
  }

  const clientes = await getClientesOptions();

  return (
    <main className="flex-1">
      <AppHeader
        eyebrow="WRMAX MARKETING & IA · Admin"
        title="Gerenciar acessos"
        signOutAction={adminLogout}
        maxWidth="2xl"
      />

      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Criar novo acesso do cliente</CardTitle>
            <CardDescription>
              Defina email e senha, e selecione a qual cliente do Notion este
              login terá acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateAccessForm clientes={clientes} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
