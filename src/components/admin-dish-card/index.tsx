import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format-currency";
import { Copy, Edit, Loader2, Ruler, Sandwich, Trash2 } from "lucide-react";
import Image from "next/image";

export interface AdminDish {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  isPopular?: boolean;
  discount?: number;
  tags: string[];
  available?: boolean;
  category: string;
}

interface AdminDishCardProps {
  dish: AdminDish;
  onEdit?: (dish: AdminDish) => void;
  onDelete?: (dish: AdminDish) => void;
  onToggleAvailability?: (dish: AdminDish) => void;
  onManageAddOns?: (dish: AdminDish) => void;
  onManageVariations?: (dish: AdminDish) => void;
  /**
   * Modo "Duplicar" (LDMF-489): o card inteiro vira um botão que duplica o
   * prato, e as ações normais ficam inacessíveis até sair do modo.
   */
  duplicateMode?: boolean;
  onDuplicate?: (dish: AdminDish) => void;
  /** Este card é o que está sendo duplicado agora. */
  isDuplicating?: boolean;
  /** Outra duplicação em andamento: o card não aceita clique. */
  duplicateDisabled?: boolean;
}

export function AdminDishCard({
  dish,
  onEdit,
  onDelete,
  onToggleAvailability,
  onManageAddOns,
  onManageVariations,
  duplicateMode = false,
  onDuplicate,
  isDuplicating = false,
  duplicateDisabled = false,
}: AdminDishCardProps) {
  const isAvailable = dish.available !== false;

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 gap-3 rounded-[13px] border border-border bg-card p-2.5 text-foreground transition-all",
        "hover:-translate-y-0.5 hover:border-brand-200 dark:hover:border-brand-800 hover:shadow-[0_8px_20px_rgba(20,22,26,0.06)]",
        !isAvailable && "bg-card/80",
        duplicateMode &&
          "border-dashed border-brand-300 dark:border-brand-700 hover:border-brand-500",
        isDuplicating && "border-solid border-brand-500",
      )}
    >
      {duplicateMode && (
        <button
          type="button"
          onClick={() => onDuplicate?.(dish)}
          disabled={duplicateDisabled || isDuplicating}
          aria-label={`Duplicar ${dish.name}`}
          title="Duplicar este prato"
          className="absolute inset-0 z-10 cursor-pointer rounded-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed"
        />
      )}

      {/* No modo Duplicar o conteúdo fica inerte: nem clique nem Tab chegam
          ao editar, excluir e ao switch por baixo do botão. */}
      <div
        inert={duplicateMode}
        className={cn(
          "flex min-w-0 flex-1 gap-3",
          duplicateMode && !isDuplicating && duplicateDisabled && "opacity-60",
        )}
      >
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-muted">
          <Image
            src={dish.image}
            alt={dish.name}
            fill
            sizes="72px"
            className={cn(
              "object-cover transition-transform duration-300 group-hover:scale-105",
              !isAvailable && "grayscale opacity-70",
            )}
          />
          {dish.isPopular && (
            <span className="absolute right-1 top-1 rounded-md bg-brand-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
              Popular
            </span>
          )}
          {dish.discount && (
            <span className="absolute left-1 top-1 rounded-md bg-[#1B7F4C] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
              -{dish.discount}%
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h3 className="min-w-0 line-clamp-2 text-sm font-bold tracking-normal">
              {dish.name}
            </h3>
            <div className="shrink-0 text-right">
              {dish.originalPrice && (
                <p className="text-[11px] font-semibold text-muted-foreground line-through">
                  {formatCurrency(dish.originalPrice)}
                </p>
              )}
              <p className="text-sm font-extrabold text-foreground">
                {formatCurrency(dish.price)}
              </p>
            </div>
          </div>

          <p className="truncate text-[11.5px] font-medium text-muted-foreground">
            {dish.description}
          </p>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-bold text-foreground">
              {dish.category}
            </span>

            {dish.tags.slice(0, 2).map((tag, index) => (
              <span
                key={index}
                className="rounded-md border border-border px-2 py-0.5 text-[10.5px] font-bold text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Linha propria: na mesma linha dos chips o switch quebrava no
            mobile conforme o tamanho da categoria/tags e o texto do estado. */}
          <div className="flex min-w-0 items-center">
            {/* Disponibilidade como switch: deixa claro que liga/desliga o
              prato no app, em vez de parecer so um rotulo de status. */}
            <label
              title={
                isAvailable
                  ? "Clique para desativar este prato"
                  : "Clique para ativar este prato"
              }
              className={cn(
                "inline-flex items-center gap-1.5 text-[10.5px] font-extrabold",
                isAvailable
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground",
                !onToggleAvailability && "cursor-not-allowed opacity-60",
              )}
            >
              <Switch
                checked={isAvailable}
                onCheckedChange={() => onToggleAvailability?.(dish)}
                disabled={!onToggleAvailability}
                aria-label={`Disponibilidade de ${dish.name}`}
              />
              {isAvailable ? "Disponível" : "Indisponível"}
            </label>
          </div>
        </div>

        {/* Paleta calma: "Editar" rotulado + acoes secundarias em neutro, so o
          excluir em vermelho - antes eram quatro icones em quatro cores. */}
        {/* No modo Duplicar as ações somem e entra um botão "Duplicar" na
            lateral, com a largura dela e a altura do "Editar". O clique vai
            para o botão que cobre o card; este é só visual. */}
        <div
          className={cn(
            "relative flex shrink-0 flex-col content-center justify-center gap-1.5",
            duplicateMode && "invisible",
          )}
        >
          {duplicateMode && (
            <span
              aria-hidden="true"
              className="visible absolute inset-x-0 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center gap-1.5 rounded-lg bg-brand-500 text-[11.5px] font-extrabold text-white transition-colors group-hover:bg-brand-600"
            >
              {isDuplicating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {isDuplicating ? "Duplicando" : "Duplicar"}
            </span>
          )}
          <button
            type="button"
            onClick={() => onEdit?.(dish)}
            disabled={!onEdit}
            aria-label={`Editar ${dish.name}`}
            title="Editar prato"
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-muted px-2.5 text-[11.5px] font-extrabold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </button>

          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => onManageAddOns?.(dish)}
              disabled={!onManageAddOns}
              aria-label={`Complementos de ${dish.name}`}
              title="Gerenciar complementos"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sandwich className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onManageVariations?.(dish)}
              disabled={!onManageVariations}
              aria-label={`Tamanhos de ${dish.name}`}
              title="Gerenciar tamanhos"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Ruler className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDelete?.(dish)}
              disabled={!onDelete}
              aria-label={`Remover ${dish.name}`}
              title="Remover prato"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
