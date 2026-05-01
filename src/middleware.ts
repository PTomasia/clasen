import { NextRequest, NextResponse } from "next/server";

// ─── Credenciais hardcoded (PBKDF2-SHA256, 100k iterations) ───────────────────
//
// Decisão de arquitetura: env vars do Vercel não estavam chegando ao runtime
// do middleware nesse projeto (TURSO_* funciona, mas APP_*/BASIC_* nunca foi
// exposto). Como workaround, salt+hash ficam hardcoded no código. A senha em
// si nunca é versionada — só o hash, que é resistente a brute force mesmo
// com o repo público.
//
// Pra trocar a senha:
//   1. node scripts/generate-auth-hash.mjs
//   2. Substitua AUTH_SALT_HEX e AUTH_HASH_HEX abaixo.
//   3. Commit + push (Vercel deploya automático).

const AUTH_USER = "pedro";
const AUTH_SALT_HEX = "01950d4151fe78fed2ac08754a038d30";
const AUTH_HASH_HEX =
  "467c970a7d0b3623f7742a0f63293258b0f00be08692a55c3716349654e7abbf";
const AUTH_ITERATIONS = 100000;

const UNAUTHORIZED_HEADERS = {
  "WWW-Authenticate": 'Basic realm="Clasen ADM", charset="UTF-8"',
} as const;

// ─── Rate limiting por IP (in-memory) ─────────────────────────────────────────
//
// Map em escopo de módulo — sobrevive entre requests da mesma instância da
// função. Reseta em cold start, o que é aceitável pra app de 1 usuário; pra
// uso intenso ou multi-região, migrar pra Upstash KV.

type RateEntry = { count: number; firstAt: number; blockedUntil: number };
const failedAttempts = new Map<string, RateEntry>();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000; // 15 min após estourar

function getClientIp(req: NextRequest): string {
  // Vercel popula `x-forwarded-for`; o primeiro IP da lista é o cliente real.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function isBlocked(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  const now = Date.now();
  if (entry.blockedUntil > now) return true;
  // Janela expirada — limpa entrada pra não acumular memória
  if (now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.delete(ip);
  }
  return false;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(ip) ?? {
    count: 0,
    firstAt: now,
    blockedUntil: 0,
  };
  // Janela expirou → reset contador
  if (now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.firstAt = now;
  }
  entry.count++;
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    entry.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
  }
  failedAttempts.set(ip, entry);
}

function recordSuccess(ip: string): void {
  failedAttempts.delete(ip);
}

// Comparação byte-a-byte em tempo constante para mitigar timing attacks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2Hex(
  password: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  // Constrói os buffers em ArrayBuffer puro pra satisfazer BufferSource (TS strict).
  const saltBytes = hexToBytes(saltHex);
  const salt = new Uint8Array(saltBytes); // cópia em ArrayBuffer puro
  const passwordBytes = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(passwordBytes),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function middleware(req: NextRequest) {
  // Em dev local, sem hash configurado, libera tudo (não bloqueia desenvolvimento).
  // Em produção, hash sempre estará configurado (se não estiver, erra fechado).
  if (
    (AUTH_HASH_HEX as string) === "REPLACE_WITH_HASH" ||
    (AUTH_SALT_HEX as string) === "REPLACE_WITH_SALT"
  ) {
    if (process.env.NODE_ENV !== "development") {
      return new NextResponse(
        "Server misconfigured: AUTH_HASH_HEX / AUTH_SALT_HEX não foram preenchidos.",
        { status: 500 }
      );
    }
    return NextResponse.next();
  }

  const ip = getClientIp(req);

  // Bloqueio antes de qualquer trabalho (não roda PBKDF2 se IP travado).
  if (isBlocked(ip)) {
    return new NextResponse("Too many failed attempts. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)) },
    });
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

  // Hash a senha enviada e compara (timing-safe) com o hash hardcoded.
  let inputHash: string;
  try {
    inputHash = await pbkdf2Hex(pass, AUTH_SALT_HEX, AUTH_ITERATIONS);
  } catch {
    return new NextResponse("Auth error", { status: 500 });
  }

  if (!safeEqual(user, AUTH_USER) || !safeEqual(inputHash, AUTH_HASH_HEX)) {
    recordFailure(ip);
    return new NextResponse("Auth required", {
      status: 401,
      headers: UNAUTHORIZED_HEADERS,
    });
  }

  recordSuccess(ip);
  return NextResponse.next();
}

// Aplica em todas as rotas exceto assets estáticos.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
  runtime: "nodejs",
};
