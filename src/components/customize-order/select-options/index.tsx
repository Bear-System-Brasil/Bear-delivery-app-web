import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import type { ExtraGroup } from "../customize-order";

type Props = {
  group: ExtraGroup;
  selectedIds: string[];
  onChange: (groupId: string, selectedIds: string[]) => void;
  /** Quantidade escolhida por opção, nos grupos `multiple`. Zero = fora. */
  quantities: Record<string, number>;
  onQuantityChange: (optionId: string, quantity: number) => void;
  maxQuantity: number;
};

// Badge único de "OPCIONAL"/"OBRIGATÓRIO" - antes o grupo de tamanho
// (single-select) usava um estilo (pílula maiúscula) e o de complementos
// (multi-select) usava outro (texto simples minúsculo). Padronizado nos dois.
function RequirementBadge({ required }: { required?: boolean }) {
  if (required) {
    return (
      <span className="rounded-md bg-brand-50 dark:bg-brand-950/40 px-[7px] py-[1px] text-[9.5px] font-extrabold tracking-wide text-brand-600 dark:text-brand-400">
        OBRIGATÓRIO
      </span>
    );
  }

  return (
    <span className="rounded-md bg-muted px-[7px] py-[1px] text-[9.5px] font-extrabold tracking-wide text-muted-foreground">
      OPCIONAL
    </span>
  );
}

export function SelectOptions({
  group,
  selectedIds,
  onChange,
  quantities,
  onQuantityChange,
  maxQuantity,
}: Props) {
  const handleSelectSingle = (id: string) => {
    if (selectedIds[0] === id) {
      // Em grupo obrigatório (ex: Tamanho) não pode ficar sem seleção -
      // clicar de novo na opção já escolhida não faz nada.
      if (group.required) return;
      onChange(group.id, []);
      return;
    }
    onChange(group.id, [id]);
  };

  if (!group.multiple) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold tracking-tight text-foreground">
            {group.title}
          </span>
          <RequirementBadge required={group.required} />
        </div>

        <div className="mt-[7px] grid grid-cols-3 gap-1.5">
          {group.options.map((option) => {
            const isSelected = selectedIds[0] === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectSingle(option.id)}
                className={cn(
                  "flex h-[50px] flex-col items-center justify-center gap-0.5 rounded-[10px] border bg-card transition-colors",
                  isSelected
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                    : "border-border hover:border-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "truncate px-1 text-[12.5px] font-bold",
                    isSelected ? "text-brand-600 dark:text-brand-400" : "text-foreground",
                  )}
                >
                  {option.label}
                </span>
                <span
                  className={cn(
                    "text-[10.5px] font-semibold",
                    isSelected ? "text-brand-500/90" : "text-muted-foreground",
                  )}
                >
                  {group.basePrice !== undefined
                    ? formatCurrency(group.basePrice + option.price)
                    : option.price > 0
                      ? `+ ${formatCurrency(option.price)}`
                      : "Incluso"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-extrabold tracking-tight text-foreground">
          {group.title}
        </span>
        <RequirementBadge required={group.required} />
      </div>

      <div className="mt-[7px] grid grid-cols-1 gap-1.5">
        {group.options.map((option) => {
          // Zero significa "não escolhido" - é o próprio stepper que
          // decide se a opção entra no pedido, sem checkbox à parte.
          const optionQuantity = quantities[option.id] ?? 0;
          const isSelected = optionQuantity > 0;
          const optionLimit = option.maxQuantity ?? maxQuantity;
          const isAtMax = optionQuantity >= optionLimit;

          return (
            <div
              key={option.id}
              className={cn(
                "flex h-[42px] min-w-0 items-center gap-2 rounded-[9px] border bg-card py-1 pl-2.5 pr-1 transition-colors",
                isSelected
                  ? "border-brand-500 bg-brand-50/70 dark:bg-brand-950/40"
                  : "border-border",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                {option.label}
              </span>
              <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                {option.price === 0
                  ? "Grátis"
                  : `+ ${formatCurrency(option.price)}`}
              </span>

              <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-[8px] bg-muted px-0.5">
                <button
                  type="button"
                  onClick={() => onQuantityChange(option.id, optionQuantity - 1)}
                  disabled={optionQuantity <= 0}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-40"
                  aria-label={`Diminuir ${option.label}`}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="min-w-[18px] text-center text-xs font-extrabold text-foreground">
                  {optionQuantity}
                </span>
                <button
                  type="button"
                  onClick={() => onQuantityChange(option.id, optionQuantity + 1)}
                  disabled={isAtMax}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-40"
                  aria-label={`Aumentar ${option.label}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
