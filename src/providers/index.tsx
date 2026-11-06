'use client'

import { ConfirmProvider } from '@/contexts/confirm-provider'
import { Toaster } from '@/components/ui/sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { bindQueryCacheToUser } from '@/lib/query-cache-session'

const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@tanstack/react-query-devtools').then((mod) => ({
            default: mod.ReactQueryDevtools,
          })),
        { ssr: false }
      )
    : () => null

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache mais agressivo para dados que mudam pouco
            staleTime: 5 * 60 * 1000, // 5 minutos - dados ficam frescos por mais tempo
            gcTime: 30 * 60 * 1000, // 30 minutos - mantém cache por mais tempo
            refetchOnWindowFocus: false, // Evita refetch desnecessário ao focar janela
            refetchOnMount: false, // Usa cache se disponível ao montar
            refetchOnReconnect: 'always', // Refetch ao reconectar internet
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors (client errors)
              const status =
                error && typeof error === 'object' && 'status' in error
                  ? (error as { status?: number }).status
                  : undefined
              if (status !== undefined && status >= 400 && status < 500) {
                return false
              }
              // Maximum 3 attempts
              return failureCount < 3
            },
          },
          mutations: {
            retry: false,
          },
        },
      })
  )

  // Cache sem dado da conta anterior depois de logout ou troca de conta
  useEffect(() => bindQueryCacheToUser(queryClient), [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        {children}
        {/* Abaixo do header, pra não cobrir os botões dele (LDMF-452).
            Medido: header do app 58px no celular e 70px no desktop; o da
            gestão 61px e 65px. Abaixo de 600px o sonner usa mobileOffset. */}
        <Toaster
          position="top-right"
          offset={{ top: 82 }}
          mobileOffset={{ top: 72 }}
          richColors
          closeButton
          duration={4000}
        />
        <ReactQueryDevtools initialIsOpen={false} />
      </ConfirmProvider>
    </QueryClientProvider>
  )
}