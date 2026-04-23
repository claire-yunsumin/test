import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";

const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "X-Demo-User-Id", "X-Request-Id"],
  maxAge: 600
};

export function applySecurity(app: Express) {
  const isProduction = process.env.NODE_ENV === "production";

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
