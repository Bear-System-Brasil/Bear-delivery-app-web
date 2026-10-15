"use client";

import { Button } from "@/components/ui/button";
import { CurrencyCentsInput } from "@/components/ui/currency-cents-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { useConfirm } from "@/contexts/confirm-provider";
import {
  isBaseSizeVariation,
  isSellableVariation,
} from "@/lib/product-variation";
import { cn } from "@/lib/utils";
import {
  useCreateProductVariation,
  useDeleteProductVariation,
  useProductVariations,
  useUpdateProductVariation,
} from "@/hooks";
import type { ProductVariation } from "@/services/api";
import { formatCurrency } from "@/utils";
import { Edit, Info, Loader2, Plus, Ruler, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export interface ProductVariationsPanelProps {
  productId?: string | null;
  productName?: string;
  salePrice: number;
  companyId?: string | null;
  isDraftMode?: boolean;
  draftVariations?: ProductVariation[];
  onDraftVariationsChange?: (variations: ProductVariation[]) => void;
}

interface FormState {
  name: string;
  totalPrice: number | undefined;
  stockQuantity: number | undefined;
  isAvailable: boolean;
}

const emptyForm: FormState = {
  name: "",
  totalPrice: undefined,
  stockQuantity: undefined,
  isAvailable: true,
};

/**
 * Somar e subtrair o preço base a cada ida e volta acumula dízima binária
 * (30,10 - 20,00 = 10.099999999999998). Arredonda pra centavo antes de
 * mandar pro backend e antes de exibir.
 */
const roundToCents = (value: number) => Math.round(value * 100) / 100;

// Nome do tamanho base (ver isBaseSizeVariation) criado pelo app.
const BASE_SIZE_NAME = "Pequeno";
// Usado quando o restaurante já chamou de "Pequeno" um tamanho mais caro.
const BASE_SIZE_FALLBACK_NAME = "Pequeno (base)";

const fieldClassName =
  "h-9 rounded-[10px] border-border bg-card text-xs shadow-none focus-visible:ring-1 focus-visible:ring-brand-500";

export function ProductVariationsPanel({
  productId = null,
  productName: _productName,
  salePrice,
  companyId,
  isDraftMode: explicitDraftMode,
  draftVariations = [],
  onDraftVariationsChange,
}: ProductVariationsPanelProps) {
  const isDraft = explicitDraftMode ?? !productId;
  const { confirm } = useConfirm();
  const {
    data: queryVariations = [],
    isLoading: queryLoading,
    isSuccess,
    isFetching,
  } = useProductVariations(isDraft ? null : productId, companyId);
  const createVariation = useCreateProductVariation();
  const updateVariation = useUpdateProductVariation();
  const deleteVariation = useDeleteProductVariation();

  const variations = isDraft ? draftVariations : queryVariations;
  const isLoading = isDraft ? false : queryLoading;
  const isSaving = isDraft
    ? false
    : createVariation.isPending || updateVariation.isPending;
  const isListSettled = isDraft ? true : isSuccess && !isFetching;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const trimmedName = form.name.trim();
  const isBelowBasePrice =
    form.totalPrice !== undefined && form.totalPrice < salePrice;
  const isDuplicateName = variations.some(
    (v) =>
      v.id !== editingId &&
      v.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );

  const baseSize = variations.find(isBaseSizeVariation);
  const isMissingBaseSize =
    isListSettled && variations.length > 0 && !baseSize;
  const isBaseSizeUnsellable =
    isListSettled && !!baseSize && !isSellableVariation(baseSize);

  const isSalePriceMissing =
    isDraft && (salePrice === undefined || salePrice < 0.01);

  const handleCreateBaseSize = async () => {
    if (!isMissingBaseSize) return;

    const hasPequeno = variations.some(
      (v) => v.name.trim().toLowerCase() === BASE_SIZE_NAME.toLowerCase(),
    );
    const baseName = hasPequeno ? BASE_SIZE_FALLBACK_NAME : BASE_SIZE_NAME;

    const byPrice = [...variations].sort(
      (a, b) => a.priceModifier - b.priceModifier,
    );
    const stockSource = byPrice.find(isSellableVariation) ?? byPrice[0];
    const baseStock = stockSource?.stockQuantity ?? 0;

    if (isDraft) {
      const baseDraft: ProductVariation = {
        id: `draft-var-${Date.now()}-base`,
        name: baseName,
        priceModifier: 0,
        stockQuantity: baseStock,
        isAvailable: true,
        productId: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onDraftVariationsChange?.([...variations, baseDraft]);
      toast.info(
        `O preço base virou o tamanho "${baseName}". Dá pra renomear na lista.`,
      );
      return;
    }

    if (!productId) return;

    try {
      await createVariation.mutateAsync({
        productId,
        data: {
          name: baseName,
          priceModifier: 0,
          stockQuantity: baseStock,
          isAvailable: true,
        },
      });
    } catch {
      return;
    }

    toast.info(
      `O preço base virou o tamanho "${baseName}". Dá pra renomear na lista.`,
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (variation: ProductVariation) => {
    setEditingId(variation.id);
    setForm({
      name: variation.name,
      totalPrice: roundToCents(salePrice + variation.priceModifier),
      stockQuantity: variation.stockQuantity,
      isAvailable: variation.isAvailable,
    });
  };

  const handleSubmit = async () => {
    if (
      !form.name.trim() ||
      form.totalPrice === undefined ||
      form.stockQuantity === undefined
    ) {
      return;
    }
    if (isDuplicateName || isBelowBasePrice) return;

    const data = {
      name: form.name.trim(),
      priceModifier: roundToCents(form.totalPrice - salePrice),
      stockQuantity: form.stockQuantity,
      isAvailable: form.isAvailable,
    };

    if (isDraft) {
      if (editingId) {
        const updated = variations.map((v) =>
          v.id === editingId
            ? {
                ...v,
                name: data.name,
                priceModifier: data.priceModifier,
                stockQuantity: data.stockQuantity,
                isAvailable: data.isAvailable,
                updated_at: new Date().toISOString(),
              }
            : v,
        );
        onDraftVariationsChange?.(updated);
        resetForm();
        return;
      }

      const shouldCreateBaseSize =
        variations.length === 0 && data.priceModifier > 0;
      const nextVariations: ProductVariation[] = [...variations];

      if (shouldCreateBaseSize) {
        const baseName =
          data.name.toLowerCase() === BASE_SIZE_NAME.toLowerCase()
            ? BASE_SIZE_FALLBACK_NAME
            : BASE_SIZE_NAME;

        const baseDraft: ProductVariation = {
          id: `draft-var-${Date.now()}-base`,
          name: baseName,
          priceModifier: 0,
          stockQuantity: data.stockQuantity,
          isAvailable: true,
          productId: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        nextVariations.push(baseDraft);
        toast.info(
          `O preço base virou o tamanho "${baseName}". Dá pra renomear na lista.`,
        );
      }

      const newDraft: ProductVariation = {
        id: `draft-var-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: data.name,
        priceModifier: data.priceModifier,
        stockQuantity: data.stockQuantity,
        isAvailable: data.isAvailable,
        productId: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      nextVariations.push(newDraft);
      onDraftVariationsChange?.(nextVariations);
      resetForm();
      return;
    }

    if (!productId) return;

    if (editingId) {
      await updateVariation.mutateAsync({ id: editingId, productId, data });
      resetForm();
      return;
    }

    if (!isListSettled) return;

    const shouldCreateBaseSize =
      variations.length === 0 && data.priceModifier > 0;

    if (shouldCreateBaseSize) {
      const baseName =
        data.name.toLowerCase() === BASE_SIZE_NAME.toLowerCase()
          ? BASE_SIZE_FALLBACK_NAME
          : BASE_SIZE_NAME;

      try {
        await createVariation.mutateAsync({
          productId,
          data: {
            name: baseName,
            priceModifier: 0,
            stockQuantity: data.stockQuantity,
            isAvailable: true,
          },
        });
      } catch {
        return;
      }

      toast.info(
        `O preço base virou o tamanho "${baseName}". Dá pra renomear na lista.`,
      );
    }

    try {
      await createVariation.mutateAsync({ productId, data });
    } catch {
      if (shouldCreateBaseSize) {
        toast.error(
          `O tamanho base foi criado, mas "${data.name}" não. Tente adicionar de novo.`,
        );
      }
      return;
    }

    resetForm();
  };

  const handleDelete = async (variation: ProductVariation) => {
    const ok = await confirm({
      title: "Remover tamanho?",
      description: `"${variation.name}" vai deixar de aparecer pros clientes.`,
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    if (isDraft) {
      onDraftVariationsChange?.(variations.filter((v) => v.id !== variation.id));
      return;
    }

    if (!productId) return;
    await deleteVariation.mutateAsync({ id: variation.id, productId });
  };

  return (
    <div className="space-y-3">
      {isSalePriceMissing && (
        <div className="flex items-center gap-2 rounded-[10px] border border-blue-200 bg-blue-50 p-2.5 text-[11.5px] font-semibold text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 text-brand-500" />
          <span>
            Para cadastrar tamanhos, preencha primeiro o preço de venda na aba{" "}
            <strong>Dados do Prato</strong>.
          </span>
        </div>
      )}

      <div className="grid gap-2 rounded-[10px] border border-border bg-muted p-3">
        <div className="grid grid-cols-[1fr_110px_90px] gap-2">
          <div className="grid gap-1">
            <Label className="text-[11px] font-bold text-foreground">
              Nome *
            </Label>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Ex: Grande"
              maxLength={100}
              disabled={isSalePriceMissing}
              className={cn(
                fieldClassName,
                isDuplicateName &&
                  "border-red-400 focus-visible:ring-red-400",
              )}
            />
            {isDuplicateName && (
              <p className="text-[10.5px] font-semibold text-red-500 dark:text-red-400">
                Já existe um tamanho com esse nome
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] font-bold text-foreground">
              Preço *
            </Label>
            <CurrencyCentsInput
              value={form.totalPrice}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, totalPrice: value }))
              }
              maskWhileTyping
              placeholder="R$ 0,01"
              disabled={isSalePriceMissing}
              className={cn(
                fieldClassName,
                isBelowBasePrice &&
                  "border-red-400 focus-visible:ring-red-400",
              )}
            />
            {isBelowBasePrice && (
              <p className="text-[10.5px] font-semibold text-red-500">
                Mín. {formatCurrency(salePrice)}
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] font-bold text-foreground">
              Estoque *
            </Label>
            <StockQuantityInput
              value={form.stockQuantity}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, stockQuantity: value }))
              }
              placeholder="—"
              minValue={0}
              maxValue={9999}
              disabled={isSalePriceMissing}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[11.5px] font-semibold text-foreground">
            <input
              type="checkbox"
              checked={form.isAvailable}
              disabled={isSalePriceMissing}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  isAvailable: e.target.checked,
                }))
              }
              className="h-3.5 w-3.5 cursor-pointer accent-brand-500"
            />
            Disponível
          </label>

          <div className="flex gap-1.5">
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                onClick={resetForm}
                className="h-8 cursor-pointer rounded-[8px] px-2.5 text-[11.5px] font-bold text-muted-foreground hover:bg-card"
              >
                Cancelar
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                isSalePriceMissing ||
                isSaving ||
                (!editingId && !isListSettled) ||
                !form.name.trim() ||
                form.totalPrice === undefined ||
                form.stockQuantity === undefined ||
                isDuplicateName ||
                isBelowBasePrice
              }
              className="h-8 cursor-pointer rounded-[8px] bg-brand-500 px-2.5 text-[11.5px] font-extrabold text-white hover:bg-brand-600"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : editingId ? (
                "Salvar"
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {isMissingBaseSize && (
        <div className="flex items-center gap-3 rounded-[10px] border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="min-w-0 flex-1 text-[11.5px] font-semibold text-foreground">
            Nenhum tamanho tem o preço base ({formatCurrency(salePrice)}). Sem
            ele, o cliente não consegue pedir o prato por esse valor.
          </p>
          <Button
            type="button"
            onClick={handleCreateBaseSize}
            disabled={isSaving}
            className="h-8 shrink-0 cursor-pointer rounded-[8px] bg-brand-500 px-2.5 text-[11.5px] font-extrabold text-white hover:bg-brand-600"
          >
            Criar tamanho base
          </Button>
        </div>
      )}

      {isBaseSizeUnsellable && baseSize && (
        <div className="flex items-center gap-3 rounded-[10px] border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="min-w-0 flex-1 text-[11.5px] font-semibold text-foreground">
            O tamanho com o preço base (&quot;{baseSize.name}&quot;) está
            indisponível ou sem estoque. O cliente não consegue pedir o prato por{" "}
            {formatCurrency(salePrice)}.
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleEdit(baseSize)}
            className="h-8 shrink-0 cursor-pointer rounded-[8px] px-2.5 text-[11.5px] font-bold text-foreground hover:bg-card"
          >
            Editar
          </Button>
        </div>
      )}

      <div className="divide-y divide-border">
        {isLoading &&
          [1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 py-2.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}

        {!isLoading && variations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] bg-muted text-brand-500">
              <Ruler className="h-5 w-5" />
            </div>
            <p className="text-[12.5px] font-bold text-foreground">
              Nenhum tamanho cadastrado
            </p>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              Adicione o primeiro tamanho acima
            </p>
          </div>
        )}

        {!isLoading &&
          variations.map((variation) => (
            <div key={variation.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-foreground">
                  <span className="truncate">{variation.name}</span>
                  {isBaseSizeVariation(variation) && (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-[1px] text-[9.5px] font-extrabold tracking-wide text-muted-foreground">
                      PREÇO BASE
                    </span>
                  )}
                </p>
                <p className="text-[10.5px] font-semibold text-muted-foreground">
                  {variation.isAvailable ? "Disponível" : "Indisponível"}
                  {variation.stockQuantity !== undefined &&
                    ` · ${variation.stockQuantity} em estoque`}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] font-extrabold text-foreground">
                {formatCurrency(
                  roundToCents(salePrice + variation.priceModifier),
                )}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => handleEdit(variation)}
                  aria-label={`Editar ${variation.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(variation)}
                  aria-label={`Remover ${variation.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

interface DialogProps {
  productId: string | null;
  productName?: string;
  salePrice: number;
  companyId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductVariationsDialog({
  productId,
  productName,
  salePrice,
  companyId,
  open,
  onOpenChange,
}: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] rounded-[14px] border-border bg-card p-0 shadow-[0_24px_70px_rgba(20,22,26,0.18)] sm:max-w-[480px]">
        <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
          <DialogTitle className="text-base font-extrabold text-foreground sm:text-lg">
            Tamanhos
          </DialogTitle>
          <DialogDescription className="text-xs font-medium text-muted-foreground sm:text-sm">
            {productName
              ? `Variações de tamanho de "${productName}"`
              : "Variações de tamanho deste prato"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <ProductVariationsPanel
            productId={productId}
            productName={productName}
            salePrice={salePrice}
            companyId={companyId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
