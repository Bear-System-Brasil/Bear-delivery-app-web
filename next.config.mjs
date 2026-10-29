import { withSentryConfig } from '@sentry/nextjs/config';

/**
 * Constrói as origens de API e WebSocket para a CSP a partir da URL base.
 * @param {string | undefined} apiUrl
 * @returns {string[]}
 */
export function getApiAndSocketOrigins(apiUrl) {
  const origins = new Set([
    'https://bearsystem.tech',
    'wss://bearsystem.tech',
  ]);

  if (apiUrl) {
    try {
      const url = new URL(apiUrl);
      origins.add(url.origin);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      origins.add(`${wsProtocol}//${url.host}`);
    } catch {
      // URL inválida ou relativa: mantém apenas as origens padrão seguras
    }
  }

  return Array.from(origins);
}

/**
 * Monta a diretiva Content-Security-Policy (CSP) com base nas origens levantadas
 * para o Bear Delivery (LDMF-426).
 *
 * Origens cobertas:
 * - O próprio site ('self')
 * - Backend / WebSocket (bearsystem.tech e NEXT_PUBLIC_API_URL em https e wss)
 * - Sentry (*.sentry.io, *.ingest.sentry.io, *.ingest.us.sentry.io)
 * - Imagens R2 (*.r2.dev) e S3 (*.s3.amazonaws.com, like-delivery.s3.us-east-2.amazonaws.com)
 * - Imagens de demonstração (Unsplash, Casa e Culinária, Sportlife)
 * - Leaflet e OpenStreetMap (tile.openstreetmap.org, *.tile.openstreetmap.org, nominatim)
 * - Geocodificação reversa (api.bigdatacloud.net, *.bigdatacloud.net)
 * - Busca de CEP (brasilapi.com.br, *.brasilapi.com.br, viacep.com.br, *.viacep.com.br)
 * - Localidades (servicodados.ibge.gov.br)
 * - Vercel Toolbar / Preview (vercel.live, *.pusher.com, *.vercel.com, etc.)
 *
 * @param {object} [options]
 * @param {boolean} [options.isDev]
 * @param {string} [options.apiUrl]
 * @param {string} [options.reportUri]
 * @returns {string}
 */
export function buildContentSecurityPolicy({
  isDev = process.env.NODE_ENV === 'development',
  apiUrl = process.env.NEXT_PUBLIC_API_URL,
  reportUri = process.env.CSP_REPORT_URI,
} = {}) {
  const apiOrigins = getApiAndSocketOrigins(apiUrl);
  const devConnectOrigins = isDev
    ? ['http://localhost:*', 'ws://localhost:*', 'http://127.0.0.1:*', 'ws://127.0.0.1:*']
    : [];

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'https://vercel.live',
    'https://va.vercel-scripts.com',
  ];

  const styleSrc = [
    "'self'",
    "'unsafe-inline'", // Leaflet injeta estilos inline nos marcadores e tiles (transform/top/left)
    'https://vercel.live',
    'https://fonts.googleapis.com',
  ];

  const imgSrc = [
    "'self'",
    'data:', // Marcadores Leaflet e ícones base64
    'blob:', // Previews de upload de imagem (createObjectURL)
    'https://images.unsplash.com',
    'https://cdn.casaeculinaria.com',
    'https://sportlife.com.br',
    'https://like-delivery.s3.us-east-2.amazonaws.com',
    'https://*.s3.us-east-2.amazonaws.com',
    'https://*.s3.amazonaws.com',
    'https://pub-e75b88e293b14bb3978db5a6fe91a9bd.r2.dev',
    'https://*.r2.dev',
    'https://tile.openstreetmap.org',
    'https://*.tile.openstreetmap.org',
    'https://*.openstreetmap.org',
    'https://vercel.live',
    'https://vercel.com',
  ];

  const fontSrc = [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',
    'https://assets.vercel.com',
    'https://vercel.live',
  ];

  const connectSrc = [
    "'self'",
    ...apiOrigins,
    ...devConnectOrigins,
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://*.sentry.io',
    'https://sentry.io',
    'https://nominatim.openstreetmap.org',
    'https://api.bigdatacloud.net',
    'https://*.bigdatacloud.net',
    'https://brasilapi.com.br',
    'https://*.brasilapi.com.br',
    'https://viacep.com.br',
    'https://*.viacep.com.br',
    'https://servicodados.ibge.gov.br',
    'https://vercel.live',
    'https://*.pusher.com',
    'wss://*.pusher.com',
    'https://vitals.vercel-insights.com',
  ];

  const mediaSrc = [
    "'self'",
    'data:',
    'blob:',
  ];

  const workerSrc = [
    "'self'",
    'blob:', // Sentry Session Replay usa Web Worker via blob URL
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src ${fontSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    `media-src ${mediaSrc.join(' ')}`,
    `worker-src ${workerSrc.join(' ')}`,
    `child-src 'self' blob:`,
    `frame-src 'self' https://vercel.live`,
    `frame-ancestors 'self' https://vercel.live`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }

  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join('; ');
}

/**
 * Retorna o nome e o valor do header de CSP.
 * Por padrão, inicia em modo Report-Only (LDMF-426) para observação em preview
 * sem derrubar telas. Pode ser promovido a bloqueio setando CSP_ENFORCE=true.
 */
export function getCspHeader() {
  const isEnforce = process.env.CSP_ENFORCE === 'true';
  const key = isEnforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  const value = buildContentSecurityPolicy();
  return { key, value };
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.casaeculinaria.com',
      },
      {
        protocol: 'https',
        hostname: 'sportlife.com.br',
      },
      {
        protocol: 'https',
        hostname: 'like-delivery.s3.us-east-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'pub-e75b88e293b14bb3978db5a6fe91a9bd.r2.dev',
      }
    ],
  },
  async headers() {
    const { key: cspKey, value: cspValue } = getCspHeader();
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: cspKey,
            value: cspValue,
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/',
        permanent: false,
      }
    ]
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Segredo: so existe no build da Vercel. Sem ele o build passa, so nao
  // sobe source map (a stack no painel fica minificada).
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Sobe mais arquivos do bundle do cliente: stack legivel tambem em chunk
  // de dependencia.
  widenClientFileUpload: true,
  // Source map vai pro Sentry e sai do deploy: o codigo-fonte nao fica
  // publico no site.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Eventos passam por /monitoring no proprio dominio, senao bloqueador de
  // anuncio derruba a requisicao pro sentry.io e o erro some.
  tunnelRoute: '/monitoring',
});