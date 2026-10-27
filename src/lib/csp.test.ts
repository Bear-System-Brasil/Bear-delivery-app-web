import { describe, expect, it } from "vitest";
// @ts-expect-error importing from next.config.mjs
import nextConfig, {
  buildContentSecurityPolicy,
  getApiAndSocketOrigins,
  getCspHeader,
} from "../../next.config.mjs";

describe("Content Security Policy (LDMF-426)", () => {
  describe("getApiAndSocketOrigins", () => {
    it("inclui a origem padrão bearsystem.tech em https e wss", () => {
      const origins = getApiAndSocketOrigins();
      expect(origins).toContain("https://bearsystem.tech");
      expect(origins).toContain("wss://bearsystem.tech");
    });

    it("adiciona http e ws quando apiUrl for http", () => {
      const origins = getApiAndSocketOrigins("http://localhost:3001");
      expect(origins).toContain("http://localhost:3001");
      expect(origins).toContain("ws://localhost:3001");
    });

    it("adiciona https e wss quando apiUrl for https", () => {
      const origins = getApiAndSocketOrigins("https://api.teste.com");
      expect(origins).toContain("https://api.teste.com");
      expect(origins).toContain("wss://api.teste.com");
    });

    it("lida com url malformada mantendo apenas as origens padrão", () => {
      const origins = getApiAndSocketOrigins("not-a-valid-url");
      expect(origins).toEqual(["https://bearsystem.tech", "wss://bearsystem.tech"]);
    });
  });

  describe("buildContentSecurityPolicy", () => {
    it("inclui 'self' e origens essenciais de script e estilo", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toMatch(/script-src [^;]*'self'/);
      expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
      expect(csp).toMatch(/script-src [^;]*https:\/\/vercel\.live/);
      expect(csp).toMatch(/style-src [^;]*'self'/);
      expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/); // Leaflet DOM styles
      expect(csp).toMatch(/style-src [^;]*https:\/\/vercel\.live/);
    });

    it("cobre todas as origens de imagem (Leaflet, R2, S3, unoptimized, previews blob)", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toMatch(/img-src [^;]*'self'/);
      expect(csp).toMatch(/img-src [^;]*data:/);
      expect(csp).toMatch(/img-src [^;]*blob:/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/tile\.openstreetmap\.org/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/\*\.tile\.openstreetmap\.org/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/\*\.r2\.dev/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/\*\.s3\.amazonaws\.com/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/like-delivery\.s3\.us-east-2\.amazonaws\.com/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/images\.unsplash\.com/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/cdn\.casaeculinaria\.com/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/sportlife\.com\.br/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/vercel\.live/);
      expect(csp).toMatch(/img-src [^;]*https:\/\/vercel\.com/);
    });

    it("cobre origens de conexão (Sentry, Nominatim, BigDataCloud, BrasilAPI, ViaCEP, IBGE, socket)", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toMatch(/connect-src [^;]*'self'/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/bearsystem\.tech/);
      expect(csp).toMatch(/connect-src [^;]*wss:\/\/bearsystem\.tech/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.ingest\.sentry\.io/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.sentry\.io/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/sentry\.io/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/nominatim\.openstreetmap\.org/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/api\.bigdatacloud\.net/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.bigdatacloud\.net/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/brasilapi\.com\.br/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.brasilapi\.com\.br/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/viacep\.com\.br/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.viacep\.com\.br/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/servicodados\.ibge\.gov\.br/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/vercel\.live/);
      expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.pusher\.com/);
      expect(csp).toMatch(/connect-src [^;]*wss:\/\/\*\.pusher\.com/);
    });

    it("suporta worker blob para Sentry Replay", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toMatch(/worker-src [^;]*'self'/);
      expect(csp).toMatch(/worker-src [^;]*blob:/);
    });

    it("suporta sons de notificação em media-src", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toMatch(/media-src [^;]*'self'/);
      expect(csp).toMatch(/media-src [^;]*data:/);
      expect(csp).toMatch(/media-src [^;]*blob:/);
    });

    it("controla frame-src e frame-ancestors permitindo preview vercel", () => {
      const csp = buildContentSecurityPolicy();
      expect(csp).toMatch(/frame-src [^;]*'self'/);
      expect(csp).toMatch(/frame-src [^;]*https:\/\/vercel\.live/);
      expect(csp).toMatch(/frame-ancestors [^;]*'self'/);
      expect(csp).toMatch(/frame-ancestors [^;]*https:\/\/vercel\.live/);
    });

    it("omite upgrade-insecure-requests em desenvolvimento e inclui em produção", () => {
      const devCsp = buildContentSecurityPolicy({ isDev: true });
      expect(devCsp).not.toContain("upgrade-insecure-requests");
      expect(devCsp).toContain("http://localhost:*");

      const prodCsp = buildContentSecurityPolicy({ isDev: false });
      expect(prodCsp).toContain("upgrade-insecure-requests");
      expect(prodCsp).not.toContain("http://localhost:*");
    });

    it("adiciona report-uri quando especificado", () => {
      const csp = buildContentSecurityPolicy({
        reportUri: "https://monitoring.example.com/csp-report",
      });
      expect(csp).toContain("report-uri https://monitoring.example.com/csp-report");
    });
  });

  describe("getCspHeader", () => {
    it("inicia em modo Content-Security-Policy-Report-Only por padrão", () => {
      delete process.env.CSP_ENFORCE;
      const { key } = getCspHeader();
      expect(key).toBe("Content-Security-Policy-Report-Only");
    });

    it("alterna para Content-Security-Policy quando CSP_ENFORCE=true", () => {
      process.env.CSP_ENFORCE = "true";
      try {
        const { key } = getCspHeader();
        expect(key).toBe("Content-Security-Policy");
      } finally {
        delete process.env.CSP_ENFORCE;
      }
    });
  });

  describe("nextConfig headers", () => {
    it("retorna o header de CSP junto aos demais headers de segurança", async () => {
      const headerConfigs = await nextConfig.headers();
      const globalHeader = headerConfigs.find((h: { source: string }) => h.source === "/(.*)");
      expect(globalHeader).toBeDefined();

      const headers = globalHeader?.headers ?? [];
      const headerMap = Object.fromEntries(
        headers.map((h: { key: string; value: string }) => [h.key, h.value]),
      );

      expect(headerMap["X-Frame-Options"]).toBe("DENY");
      expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
      expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(headerMap["Permissions-Policy"]).toBe(
        "camera=(), microphone=(), geolocation=(self)",
      );
      expect(headerMap["X-DNS-Prefetch-Control"]).toBe("on");
      expect(headerMap["Content-Security-Policy-Report-Only"]).toBeDefined();
      expect(headerMap["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
    });
  });
});
