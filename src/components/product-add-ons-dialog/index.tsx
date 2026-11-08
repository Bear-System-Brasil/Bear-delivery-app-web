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
import { useConfirm } from "@/contexts/confirm-provider";
import { cn } from "@/lib/utils";
import {
  useCreateProductAddOn,
  useDeleteProductAddOn,
  useProductAddOns,
  useUpdateProductAddOn,
} from "@/hooks";
import type { ProductAddOn } from "@/services/api";
import { formatCurrency } from "@/utils";
import { Edit, Loader2, Plus, Sandwich, Trash2 } from "lucide-react";
import { useState } from "react";

export interface ProductAddOnsPanelProps {
  productId?: string | null;
  productName?: string;
  companyId?: string | null;
  isDraftMode?: boolean;
  draftAddOns?: ProductAddOn[];
  onDraftAddOnsChange?: (addOns: ProductAddOn[]) => void;
}

interface FormState {
  name: string;
  priceModifier: number | undefined;
  isAvailable: boolean;
}

const emptyForm: FormState = {
  name: "",
  priceModifier: undefined,
  isAvailable: true,
};

const fieldClassName =
  "h-9 rounded-[10px] border-border bg-card text-xs shadow-none focus-visible:ring-1 focus-visible:ring-brand-500";

export function ProductAddOnsPanel({
  productId = null,
  productName: _productName,
  companyId,
  isDraftMode: explicitDraftMode,
  draftAddOns = [],
  onDraftAddOnsChange,
}: ProductAddOnsPanelProps) {
  const isDraft = explicitDraftMode ?? !productId;
  const { confirm } = useConfirm();
  const { data: queryAddOns = [], isLoading: queryLoading } = useProductAddOns(
    isDraft ? null : productId,
    companyId,
  );
  const createAddOn = useCreateProductAddOn();
  const updateAddOn = useUpdateProductAddOn();
  const deleteAddOn = useDeleteProductAddOn();

  const addOns = isDraft ? draftAddOns : queryAddOns;
  const isLoading = isDraft ? false : queryLoading;
  const isSaving = isDraft
    ? false
    : createAddOn.isPending || updateAddOn.isPending;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const trimmedName = form.name.trim();
  const isDuplicateName = addOns.some(
    (a) =>
      a.id !== editingId &&
      a.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (addOn: ProductAddOn) => {
    setEditingId(addOn.id);
    setForm({
      name: addOn.name,
      priceModifier: addOn.priceModifier,
      isAvailable: addOn.isAvailable,
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || form.priceModifier === undefined) return;
    if (isDuplicateName) return;

    const data = {
      name: form.name.trim(),
      priceModifier: form.priceModifier,
      isAvailable: form.isAvailable,
    };

    if (isDraft) {
      if (editingId) {
        const updated = addOns.map((a) =>
          a.id === editingId
            ? {
                ...a,
                name: data.name,
                priceModifier: data.priceModifier,
                isAvailable: data.isAvailable,
                updated_at: new Date().toISOString(),
              }
            : a,
        );
        onDraftAddOnsChange?.(updated);
      } else {
        const newDraft: ProductAddOn = {
          id: `draft-addon-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: data.name,
          priceModifier: data.priceModifier,
          isAvailable: data.isAvailable,
          productId: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        onDraftAddOnsChange?.([...addOns, newDraft]);
      }
      resetForm();
      return;
    }

    if (!productId) return;

    if (editingId) {
      await updateAddOn.mutateAsync({ id: editingId, productId, data });
    } else {
      await createAddOn.mutateAsync({ productId, data });
    }

    resetForm();
  };

  const handleDelete = async (addOn: ProductAddOn) => {
    const ok = await confirm({
      title: "Remover complemento?",
      description: `"${addOn.name}" vai deixar de aparecer pros clientes.`,
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    if (isDraft) {
      onDraftAddOnsChange?.(addOns.filter((a) => a.id !== addOn.id));
      return;
    }

    if (!productId) return;
    await deleteAddOn.mutateAsync({ id: addOn.id, productId });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-[10px] border border-border bg-muted p-3">
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <div className="grid gap-1">
            <Label className="text-[11px] font-bold text-foreground">
              Nome *
            </Label>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Ex: Queijo Extra"
              maxLength={100}
              className={cn(
                fieldClassName,
                isDuplicateName &&
                  "border-red-400 focus-visible:ring-red-400",
              )}
            />
            {isDuplicateName && (
              <p className="text-[10.5px] font-semibold text-red-500 dark:text-red-400">
                Já existe um complemento com esse nome
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] font-bold text-foreground">
              Preço extra *
            </Label>
            <CurrencyCentsInput
              value={form.priceModifier}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, priceModifier: value }))
              }
              maskWhileTyping
              placeholder="R$ 0,01"
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[11.5px] font-semibold text-foreground">
            <input
              type="checkbox"
              checked={form.isAvailable}
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
                isSaving ||
                !form.name.trim() ||
                form.priceModifier === undefined ||
                isDuplicateName
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

      <div className="divide-y divide-border">
        {isLoading &&
          [1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 py-2.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}

        {!isLoading && addOns.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] bg-muted text-brand-500">
              <Sandwich className="h-5 w-5" />
            </div>
            <p className="text-[12.5px] font-bold text-foreground">
              Nenhum complemento cadastrado
            </p>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              Adicione o primeiro complemento acima
            </p>
          </div>
        )}

        {!isLoading &&
          addOns.map((addOn) => (
            <div key={addOn.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-foreground">
                  {addOn.name}
                </p>
                <p className="text-[10.5px] font-semibold text-muted-foreground">
                  {addOn.isAvailable ? "Disponível" : "Indisponível"}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] font-extrabold text-foreground">
                + {formatCurrency(addOn.priceModifier)}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => handleEdit(addOn)}
                  aria-label={`Editar ${addOn.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(addOn)}
                  aria-label={`Remover ${addOn.name}`}
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
  companyId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductAddOnsDialog({
  productId,
  productName,
  companyId,
  open,
  onOpenChange,
}: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] rounded-[14px] border-border bg-card p-0 shadow-[0_24px_70px_rgba(20,22,26,0.18)] sm:max-w-[480px]">
        <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
          <DialogTitle className="text-base font-extrabold text-foreground sm:text-lg">
            Complementos
          </DialogTitle>
          <DialogDescription className="text-xs font-medium text-muted-foreground sm:text-sm">
            {productName
              ? `Extras que o cliente pode adicionar a "${productName}"`
              : "Extras que o cliente pode adicionar a este prato"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <ProductAddOnsPanel
            productId={productId}
            productName={productName}
            companyId={companyId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
