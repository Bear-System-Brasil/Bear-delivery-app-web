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
  // Sem Session Replay de proposito (LDMF-477). Mesmo so "em caso de erro",
  // o Replay grava a tela o tempo todo em memoria para ter o video quando o
  // erro acontece. Medido em build de producao com CPU limitada: dobrava o
  // travamento na abertura das telas, levava o LCP do cardapio no celular de
  // ~1,4 s para ~4 s e somava 3-4 MB por aba. A captura de erro (stack,
  // navegador, URL) continua igual; so o video sai.
});
