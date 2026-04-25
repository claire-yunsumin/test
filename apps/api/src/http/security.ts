import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";

// Vite가 기본 5173을 쓰지 못해 다른 포트로 뜨는 경우가 흔합니다(예: 5174). 로컬 개발 기본 Origin을 몇 가지 같이 둡니다.
// 운영에서는 `WEB_ORIGIN`으로 명시하세요(쉼표 구분).
const DEFAULT_LOCAL_WEB_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
] as const;

const isProduction = process.env.NODE_ENV === "production";

function isLocalDevHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }
  if (hostname.startsWith("192.168.")) {
    return true;
  }
  if (hostname.startsWith("10.")) {
    return true;
  }
  if (hostname.startsWith("172.")) {
    const second = Number(hostname.split(".")[1] ?? -1);
    if (Number.isInteger(second) && second >= 16 && second <= 31) {
      return true;
    }
  }
  return false;
}

const allowedOrigins = (() => {
  const fromEnv = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (isProduction) {
    return fromEnv;
  }
  if (fromEnv.length > 0) {
    // 로컬에서 `WEB_ORIGIN`이 5173만 잡혀 있으면(기본 Vite) 5173이 점유돼 5174로 뜨는 케이스에 fetch가 막힐 수 있습니다.
    // 개발 환경에서는 `WEB_ORIGIN`을 완전히 대체하기보다 로컬 기본 Origin을 합집합으로 둡니다.
    return Array.from(new Set([...fromEnv, ...DEFAULT_LOCAL_WEB_ORIGINS]));
  }
  return [...DEFAULT_LOCAL_WEB_ORIGINS];
})();

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    if (!isProduction) {
      try {
        const url = new URL(origin);
        if (url.protocol === "http:" && isLocalDevHost(url.hostname)) {
          // Vite --host 0.0.0.0 + LAN IP 접속(http://192.168.x.x:5174) 케이스
          callback(null, true);
          return;
        }
      } catch {
        // ignore
      }
    }
    callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "X-Demo-User-Id", "X-Request-Id"],
  maxAge: 600
};

export function applySecurity(app: Express) {
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    const requestId = String(req.headers["x-request-id"] ?? crypto.randomUUID()).slice(0, 80);
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "64kb", strict: true }));
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = `${req.ip}:${req.path}`;
  const nowMs = Date.now();
  const bucket = rateBuckets.get(key);
  const windowMs = 60_000;
  const limit = req.method === "GET" ? 240 : 60;

  if (!bucket || bucket.resetAt <= nowMs) {
    rateBuckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    next();
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    res.status(429).json({ error: "RATE_LIMITED", requestId: req.requestId });
    return;
  }
  next();
}
