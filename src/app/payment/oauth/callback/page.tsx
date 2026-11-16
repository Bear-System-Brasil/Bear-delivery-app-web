"use client";

import { Button } from "@/components/ui/button";
import { apiService } from "@/services/api";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function CallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const connected = searchParams.get("connected");
  const statusParam = searchParams.get("status");
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Caso 1: O backend já processou o callback e redirecionou o browser para o frontend com sucesso
    if (connected === "true" || statusParam === "success") {
      setStatus("success");
      return;
    }

    // Caso 2: O Mercado Pago ou o backend redirecionou com erro
    if (errorParam) {
      setStatus("error");
      setErrorMessage(
        errorDesc || errorParam || "Erro no fluxo de autorização.",
      );
      return;
    }

    // Caso 3: O Mercado Pago redirecionou para o frontend com code e state
    if (code && state) {
      let isMounted = true;

      async function processCallback() {
        try {
          const response = await apiService.payments.oauthCallback(code!, state!);
          if (!isMounted) return;

          if (response.success && response.data?.connected) {
            setStatus("success");
          } else {
            setStatus("error");
            setErrorMessage(
              response.message ||
                "Não foi possível concluir a vinculação da conta Mercado Pago.",
            );
          }
        } catch (err) {
          if (!isMounted) return;
          setStatus("error");
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "Erro inesperado ao conectar com Mercado Pago.",
          );
        }
      }

      processCallback();

      return () => {
        isMounted = false;
      };
    }

    // Caso 4: Parâmetros ausentes
    setStatus("error");
    setErrorMessage(
      "Código de autorização ou estado ausentes na URL de retorno.",
    );
  }, [code, state, connected, statusParam, errorParam, errorDesc]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        {status === "loading" && (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-brand-500" />
            <h1 className="text-xl font-bold text-foreground">
              Conectando conta Mercado Pago...
            </h1>
            <p className="text-sm text-muted-foreground">
              Estamos finalizando a integração com a sua conta. Aguarde um
              instante.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <h1 className="text-xl font-bold text-foreground">
              Mercado Pago Conectado!
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua conta foi integrada com sucesso. Agora o restaurante pode
              receber pagamentos online via Mercado Pago.
            </p>
            <div className="pt-4">
              <Button asChild className="rounded-xl">
                <Link href="/financial-management/settings">
                  Voltar para Configurações
                </Link>
              </Button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center space-y-4">
            <XCircle className="h-12 w-12 text-red-500" />
            <h1 className="text-xl font-bold text-foreground">
              Falha na Conexão
            </h1>
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage || "Não foi possível validar a autorização."}
            </p>
            <p className="text-xs text-muted-foreground">
              O link pode ter expirado (validade de 10 minutos) ou sido cancelado.
            </p>
            <div className="flex gap-3 pt-4">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/financial-management/settings">
                  Ir para Configurações
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MercadoPagoOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
