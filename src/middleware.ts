import { NextRequest, NextResponse } from "next/server";

// Comparação byte-a-byte em tempo constante para mitigar timing attacks
// na verificação de credenciais.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

const UNAUTHORIZED_HEADERS = {
  "WWW-Authenticate": 'Basic realm="Clasen ADM", charset="UTF-8"',
} as const;

export function middleware(req: NextRequest) {
  const expectedUser = process.env.APP_USERNAME;
  const expectedPass = process.env.APP_PASSWORD;

  // Defesa em profundidade: em produção, falta de env vars = bloqueio total.
  // Em dev local, libera (permite desenvolvimento sem precisar setar credenciais).
  if (!expectedUser || !expectedPass) {
    if (process.env.NODE_ENV !== "development") {
      // Diagnóstico: confirma se TURSO_* existe neste contexto. Se sim, é só typo
      // ou problema com APP_*. Se TURSO_* tb não aparece, é problema de runtime
      // (middleware em sandbox isolado).
      const turso = Object.keys(process.env)
        .filter((k) => k.startsWith("TURSO_"))
        .sort()
        .map((k) => `"${k}"`)
        .join(", ");
      const total = Object.keys(process.env).length;
      const sample = Object.keys(process.env).sort().slice(0, 30).join(", ");
      return new NextResponse(
        `Server misconfigured: APP_USERNAME=${expectedUser ? "set" : "missing"} APP_PASSWORD=${expectedPass ? "set" : "missing"}. Total: ${total}. TURSO_* visíveis: [${turso || "none"}]. Primeiras 30 keys: ${sample}`,
        { status: 500 }
      );
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: UNAUTHORIZED_HEADERS,
    });
  }

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return new NextResponse("Invalid auth header", { status: 401 });
  }

  const sepIdx = decoded.indexOf(":");
  if (sepIdx === -1) {
    return new NextResponse("Invalid auth header", { status: 401 });
  }
  const user = decoded.slice(0, sepIdx);
  const pass = decoded.slice(sepIdx + 1);

  if (!safeEqual(user, expectedUser) || !safeEqual(pass, expectedPass)) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: UNAUTHORIZED_HEADERS,
    });
  }

  return NextResponse.next();
}

// Aplica em todas as rotas exceto assets estáticos do Next e arquivos da raiz public.
// Roda em Node runtime (não Edge) pra ter acesso ao mesmo conjunto de env vars
// que Server Actions/Components — Edge runtime tinha env vars não chegando.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
  runtime: "nodejs",
};
