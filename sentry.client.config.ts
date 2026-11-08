// Sentry no navegador do cliente. O Next 15.1 ainda nao le
// instrumentation-client.ts (so a partir do 15.3), entao o withSentryConfig
// injeta este arquivo no bundle do cliente.
import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION } from "./src/lib/monitoring";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  // Sem DSN (dev local, CI) o SDK fica desligado e nao manda nada.
  enabled: Boolean(dsn),
  // Separa preview de producao no painel. A Vercel expoe NEXT_PUBLIC_VERCEL_ENV
  // quando "Automatically expose System Environment Variables" esta ligado.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  dataCollection: SENTRY_DATA_COLLECTION,
  // Gravacao da tela so quando acontece erro, nunca da sessao inteira: o
  // plano gratuito tem cota pequena de replays.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    // Texto e imagem mascarados: o replay mostra o que o cliente fez, nao
    // nome, endereco ou CPF digitados.
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
});
