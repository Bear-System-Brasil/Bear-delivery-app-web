"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUnauthorizedPage } from "@/hooks";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/utils/permissions";
import { AlertTriangle, Home, Shield } from "lucide-react";

export default function UnauthorizedPage() {
  const { user, isAuthenticated, isMounted, handleGoHome, handleLogin } =
    useUnauthorizedPage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-brand-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-brand-100 dark:bg-brand-900 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-10 h-10 text-brand-600 dark:text-brand-400" />
          </div>
          <CardTitle className="text-3xl font-bold text-foreground flex items-center justify-center gap-2">
            <AlertTriangle className="w-8 h-8 text-brand-500" />
            Acesso Negado
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            Você não tem permissão para acessar esta página
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isMounted ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-muted rounded-lg"></div>
              <div className="h-24 bg-muted rounded-lg"></div>
            </div>
          ) : isAuthenticated && user ? (
            <>
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  Seu Perfil Atual:
                </h3>
                <div className="space-y-1">
                  <p className="text-blue-800 dark:text-blue-300">
                    <span className="font-medium">Nome:</span> {user.name}
                  </p>
                  <p className="text-blue-800 dark:text-blue-300">
                    <span className="font-medium">Tipo de Conta:</span>{" "}
                    {ROLE_LABELS[user.role] || user.role}
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                    {ROLE_DESCRIPTIONS[user.role] || "Usuário do sistema"}
                  </p>
                </div>
              </div>

              <div className="bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
                <h3 className="font-semibold text-brand-900 dark:text-brand-300 mb-2">
                  Por que não posso acessar?
                </h3>
                <p className="text-brand-800 dark:text-brand-300 text-sm">
                  Esta página é restrita a determinados tipos de conta. Seu
                  perfil atual (<strong>{ROLE_LABELS[user.role]}</strong>) não
                  possui as permissões necessárias para acessar este conteúdo.
                </p>
              </div>

              <div className="bg-muted border border-border rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-3">
                  Tipos de Conta:
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground min-w-[100px]">
                      👑 Dono:
                    </span>
                    <span className="text-muted-foreground">
                      Acesso total ao sistema
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground min-w-[100px]">
                      ⚙️ Admin:
                    </span>
                    <span className="text-muted-foreground">
                      Gestão completa do restaurante
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground min-w-[100px]">
                      📊 Gerente:
                    </span>
                    <span className="text-muted-foreground">Gestão operacional</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground min-w-[100px]">
                      👨‍🍳 Cozinheiro:
                    </span>
                    <span className="text-muted-foreground">Gestão de pedidos</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground min-w-[100px]">
                      🚚 Entregador:
                    </span>
                    <span className="text-muted-foreground">
                      Acompanhamento de entregas
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground min-w-[100px]">
                      👤 Cliente:
                    </span>
                    <span className="text-muted-foreground">Realizar pedidos</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-300">
                Você precisa estar autenticado para acessar esta página. Por
                favor, faça login para continuar.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleGoHome}
              className="flex-1 bg-gradient-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 cursor-pointer"
            >
              <Home className="w-4 h-4 mr-2" />
              Voltar para Home
            </Button>
            {!isAuthenticated && (
              <Button
                onClick={handleLogin}
                variant="outline"
                className="flex-1 cursor-pointer"
              >
                Fazer Login
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
