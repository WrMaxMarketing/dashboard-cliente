import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE_MS, SESSION_START_COOKIE } from "@/lib/session";

// Refresca a sessao a cada request e protege as rotas: sem usuario => /login.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: nao rodar codigo entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith("/login");
  // /admin tem auth propria (senha de admin), nao usa a sessao de cliente.
  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");
  // /api faz a propria checagem (sessao ou segredo de webhook); nao redireciona.
  const isApi = request.nextUrl.pathname.startsWith("/api");

  // Sessao expirada (ou sem o marcador de inicio) => desloga.
  if (user && !isAdminPath && !isApi) {
    const startedAtRaw = request.cookies.get(SESSION_START_COOKIE)?.value;
    const startedAt = startedAtRaw ? Number(startedAtRaw) : NaN;
    const expired =
      !startedAtRaw ||
      Number.isNaN(startedAt) ||
      Date.now() - startedAt > SESSION_MAX_AGE_MS;

    if (expired) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const response = NextResponse.redirect(url);
      // Limpa a sessao do Supabase (cookies sb-*) e o marcador de inicio.
      for (const cookie of request.cookies.getAll()) {
        if (
          cookie.name.startsWith("sb-") ||
          cookie.name === SESSION_START_COOKIE
        ) {
          response.cookies.delete(cookie.name);
        }
      }
      return response;
    }
  }

  // Sem sessao e fora do /login, /admin e /api => manda pro login.
  if (!user && !isLogin && !isAdminPath && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Ja logado tentando acessar /login => manda pra home.
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
