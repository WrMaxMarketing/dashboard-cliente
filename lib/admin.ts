import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

// Sessao de admin: cookie httpOnly cujo valor e um hash derivado da
// ADMIN_PASSWORD. Sem saber a senha, ninguem consegue forjar o cookie.
export const ADMIN_COOKIE = "admin_session";

export function adminToken(): string {
  const pwd = process.env.ADMIN_PASSWORD ?? "";
  return crypto.createHash("sha256").update(`wrmax-admin:${pwd}`).digest("hex");
}

export function senhaCorreta(input: string): boolean {
  const pwd = process.env.ADMIN_PASSWORD ?? "";
  if (!pwd) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pwd);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) return false;
  const store = await cookies();
  const val = store.get(ADMIN_COOKIE)?.value;
  if (!val) return false;
  const expected = adminToken();
  const a = Buffer.from(val);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
