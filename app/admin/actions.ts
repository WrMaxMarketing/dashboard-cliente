"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, senhaCorreta, isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientesOptions } from "@/lib/notion";

export type AdminLoginState = { error?: string };
export type CreateAccessState = { error?: string; success?: string };

export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  if (!process.env.ADMIN_PASSWORD) {
    return { error: "ADMIN_PASSWORD não está configurada no servidor." };
  }
  const senha = String(formData.get("senha") ?? "");
  if (!senhaCorreta(senha)) {
    return { error: "Senha incorreta." };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });

  redirect("/admin");
}

export async function adminLogout() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/admin");
}

export async function createClientAccess(
  _prev: CreateAccessState,
  formData: FormData
): Promise<CreateAccessState> {
  if (!(await isAdmin())) {
    return { error: "Sessão de admin expirada. Recarregue e entre de novo." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const cliente = String(formData.get("cliente") ?? "").trim();

  if (!email || !password || !cliente) {
    return { error: "Preencha email, senha e cliente." };
  }
  if (password.length < 6) {
    return { error: "A senha deve ter ao menos 6 caracteres." };
  }

  // Valida o cliente contra os valores reais do Notion.
  const opcoes = await getClientesOptions();
  if (opcoes.length && !opcoes.includes(cliente)) {
    return { error: `Cliente "${cliente}" não existe no Notion.` };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { cliente },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: `Acesso criado: ${email} → ${cliente}.` };
}
