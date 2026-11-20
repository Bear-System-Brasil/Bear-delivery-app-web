import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/components/theme-provider";
import { AppFrame } from "@/components/ui/app-frame";
import { AuthProvider } from "@/contexts/auth-provider";
import { Providers } from "@/providers";
import { NotificationsProvider } from "@/providers/notifications-provider";
import { GeistMono } from "geist/font/mono";
import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import type React from "react";
import { Suspense } from "react";
import "./globals.css";

// Fonte dos mocks de UI (Lojas/Novidades): geométrica e arredondada, fica
// mais leve que a do sistema nos títulos em peso alto. Variável, então
// cobre 400-800 num arquivo só.
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Beara Delivery - O delivery mais fofo",
    template: "%s | Beara Delivery",
  },
  description:
    "O delivery mais fofo e rápido da sua cidade. Peça em até 30 minutos.",
  icons: {
    icon: [
      { url: "/icons/favicon.ico" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/icons/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Beara Delivery",
    title: "Beara Delivery - O delivery mais fofo",
    description: "O delivery mais fofo e rápido da sua cidade",
    images: [
      {
        url: "/icons/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beara Delivery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beara Delivery",
    description: "O delivery mais fofo e rápido",
    images: ["/icons/twitter-card.png"],
  },
};
export const viewport: Viewport = {
  themeColor: "#FF7A00",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`font-sans ${figtree.variable} ${GeistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ErrorBoundary>
            <Providers>
              <AuthProvider>
                <NotificationsProvider>
                  <AppFrame>
                    <Suspense fallback={null}>{children}</Suspense>
                  </AppFrame>
                </NotificationsProvider>
              </AuthProvider>
            </Providers>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
