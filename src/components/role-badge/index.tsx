"use client";

import { useAuth } from "@/contexts/auth-provider";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/utils/permissions";

/**
 * Papel de quem está logado ("Dono", "Gerente"...), com o rótulo do mapa
 * único de permissions.ts. Sem papel carregado (hidratação) ou papel sem
 * rótulo, não renderiza nada - melhor sumir que mostrar a chave crua.
 */
export function RoleBadge({ className }: { className?: string }) {
  const { user } = useAuth();
  const label = user?.role ? ROLE_LABELS[user.role] : undefined;

  if (!label) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
