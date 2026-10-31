"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import ProtectedRoute from "@/components/protected-route";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CustomizeOrder } from "@/components/customize-order/customize-order";
import { MenuItemsList } from "@/components/menu-items-list";
import { useCategoryManagement, useCompanyProducts } from "@/hooks";
import { groupMenuByCategory } from "@/lib/menu-grouping";
import { cn } from "@/lib/utils";
import type { Product } from "@/services/api";
import { useAuthStore } from "@/stores";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR");
}

/**
 * Status real da categoria no app (LDMF-442): o switch esconde/exibe a
 * categoria marcando todos os produtos dela como (in)disponíveis. Categoria
 * sem item não tem o que esconder, então só mostra "Sem itens".
 */
function CategoryStatusToggle({
  count,
  active,
  toggling,
  name,
  onToggle,
}: {
  count: number;
  active: boolean;
  toggling: boolean;
  name: string;
  onToggle: () => void;
}) {
  if (count === 0) {
    return (
      <span className="inline-flex rounded-[6px] bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
        Sem itens
      </span>
    );
  }

  return (
    <label
      title={
        active
          ? "Esconder categoria do app (deixa os itens indisponíveis)"
          : "Exibir categoria no app"
      }
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold",
        active
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-muted-foreground",
        toggling && "cursor-wait opacity-70",
      )}
    >
      <Switch
        checked={active}
        onCheckedChange={onToggle}
        disabled={toggling}
        aria-label={`${active ? "Esconder" : "Exibir"} categoria ${name} no app`}
      />
      {toggling ? "Salvando..." : active ? "Ativa" : "Oculta"}
    </label>
  );
}

/**
 * Setas de subir/descer (LDMF-345). Funcionam bem no celular; arrastar fica
 * como melhoria futura. Mexem só no estado local até "Salvar ordem".
 */
function ReorderControl({
  name,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[7px] border border-border">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={isFirst}
        aria-label={`Mover ${name} para cima`}
        title="Mover para cima"
        className="flex h-[15px] w-6 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={isLast}
        aria-label={`Mover ${name} para baixo`}
        title="Mover para baixo"
        className="flex h-[15px] w-6 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}

function CategoryManagementContent() {
  const {
    categories: filteredCategories,
    allCategories,
    isLoading: loading,
    isModalOpen,
    editingCategory,
    deleteTarget,
    formData,
    searchQuery,
    setSearchQuery,
    handleOpenCreateModal,
    handleOpenEditModal,
    handleCloseModal,
    handleSaveCategory,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDelete,
    canDelete,
    updateFormField,
    isSaving,
    isDeleting,
    categoryStatusMap,
    hasCategoryProductData,
    togglingCategoryId,
    handleToggleCategoryActive,
    canReorder,
    isSearching,
    isReorderDirty,
    isSavingOrder,
    handleMoveCategoryUp,
    handleMoveCategoryDown,
    handleSaveOrder,
    handleCancelReorder,
  } = useCategoryManagement();

  // Setas aparecem só quando dá pra reordenar de fato: papel permitido e
  // sem busca ativa (com busca, enviar a lista filtrada bagunçaria o resto).
  const showReorder = canReorder && !isSearching;

  // A prévia espelha o que o cliente vê: só as categorias ativas (com item
  // disponível). Enquanto os produtos não chegam, mostra todas pra não piscar
  // vazio.
  const previewCategories = useMemo(() => {
    if (!hasCategoryProductData) return allCategories.slice(0, 10);
    return allCategories
      .filter((category) => categoryStatusMap[category.id]?.active)
      .slice(0, 10);
  }, [allCategories, categoryStatusMap, hasCategoryProductData]);

  const activeCount = useMemo(
    () =>
      allCategories.filter((category) => categoryStatusMap[category.id]?.active)
        .length,
    [allCategories, categoryStatusMap],
  );

  // Prévia interativa do app (LDMF-454): mesmos cards do cliente, read-only,
  // com os produtos reais. As abas filtram por categoria. Reflete a
  // disponibilidade ao vivo (o toggle atualiza o cache de produtos).
  const { user } = useAuthStore();
  const companyId = user?.companyId || user?.id || null;
  const { data: previewProducts = [] } = useCompanyProducts(companyId);
  const [selectedPreviewCat, setSelectedPreviewCat] = useState("");
  // Prato aberto na prévia (modal read-only do cliente, LDMF-465).
  const [previewItem, setPreviewItem] = useState<Product | null>(null);

  const previewCategoryMap = useMemo(
    () =>
      Object.fromEntries(
        allCategories.map((category) => [category.id, category.name]),
      ),
    [allCategories],
  );
  const { groupedItems: previewGrouped, categories: previewCats } = useMemo(
    () => groupMenuByCategory(previewProducts, previewCategoryMap),
    [previewProducts, previewCategoryMap],
  );
  const previewListCategories =
    selectedPreviewCat && previewCats.includes(selectedPreviewCat)
      ? [selectedPreviewCat]
      : previewCats;

  return (
    <AdminPageLayout
      title="Categorias"
      icon={LayoutGrid}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:pl-[17rem] lg:pr-8"
      actions={
        <Button
          onClick={handleOpenCreateModal}
          className="h-[34px] w-full cursor-pointer rounded-xl bg-brand-500 px-4 text-[12.5px] font-extrabold text-white shadow-[0_4px_12px_var(--tw-shadow-color)] shadow-brand-500/25 hover:bg-brand-600 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Adicionar Categoria
        </Button>
      }
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex h-9 w-full max-w-[340px] items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Buscar categorias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-medium text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-xl border border-border bg-card px-2.5 py-1 text-[11.5px] font-bold text-foreground">
              {allCategories.length} categorias
            </span>
            {hasCategoryProductData && (
              <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {activeCount} ativas
              </span>
            )}
            <span className="rounded-xl border border-border bg-card px-2.5 py-1 text-[11.5px] font-bold text-foreground">
              {filteredCategories.length} exibidas
            </span>
            <span className="rounded-xl bg-muted px-2.5 py-1 text-[11.5px] font-bold text-muted-foreground">
              {previewCategories.length} na prévia
            </span>
          </div>
        </div>

        {canReorder && isReorderDirty && (
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 dark:border-brand-800 dark:bg-brand-950/40 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] font-bold text-brand-700 dark:text-brand-300">
              Ordem alterada. Salve para o cardápio do cliente refletir.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancelReorder}
                disabled={isSavingOrder}
                className="h-8 cursor-pointer rounded-lg border-border text-xs"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveOrder}
                disabled={isSavingOrder}
                className="h-8 cursor-pointer rounded-lg bg-brand-500 text-xs font-bold text-white hover:bg-brand-600"
              >
                {isSavingOrder ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar ordem"
                )}
              </Button>
            </div>
          </div>
        )}

        {canReorder && isSearching && (
          <p className="mb-3 text-[11.5px] font-medium text-muted-foreground">
            Limpe a busca para reordenar as categorias.
          </p>
        )}

        <div className="grid min-h-0 items-start gap-3 md:h-[calc(100vh-165px)] xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card md:h-full">
            <div className="hidden shrink-0 grid-cols-[44px_minmax(0,1fr)_112px_112px_92px_108px] items-center gap-2 border-b border-border bg-muted px-3.5 py-2.5 md:grid">
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                #
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Categoria
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Criada em
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Atualizada
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Status
              </span>
              <span className="text-right text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Ações
              </span>
            </div>

            {loading && (
              <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div
                    key={item}
                    className="grid gap-2 p-3.5 md:grid-cols-[44px_minmax(0,1fr)_112px_112px_92px_108px] md:items-center"
                  >
                    <Skeleton className="h-4 w-7" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-[6px]" />
                    <Skeleton className="h-5 w-20 rounded-[6px]" />
                    <Skeleton className="h-5 w-16 rounded-[6px]" />
                    <div className="flex gap-1.5 md:justify-end">
                      <Skeleton className="h-6 w-6 rounded-[7px]" />
                      <Skeleton className="h-6 w-6 rounded-[7px]" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && filteredCategories.length > 0 && (
              <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {filteredCategories.map((category, index) => (
                  <div
                    key={category.id}
                    className="grid gap-3 p-3.5 md:grid-cols-[44px_minmax(0,1fr)_112px_112px_92px_108px] md:items-center md:gap-2"
                  >
                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-[11px] font-extrabold text-muted-foreground">
                        #{String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="md:hidden">
                        <CategoryStatusToggle
                          count={categoryStatusMap[category.id]?.count ?? 0}
                          active={
                            categoryStatusMap[category.id]?.active ?? false
                          }
                          toggling={togglingCategoryId === category.id}
                          name={category.name}
                          onToggle={() => handleToggleCategoryActive(category)}
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold tracking-tight text-foreground">
                        {category.name}
                      </div>
                      <div className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
                        {category.description || "Sem descrição"}
                      </div>
                    </div>

                    <div className="hidden items-center gap-1.5 text-[11.5px] font-bold text-muted-foreground md:flex">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(category.created_at)}
                    </div>

                    <div className="hidden items-center gap-1.5 text-[11.5px] font-bold text-muted-foreground md:flex">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(category.updated_at)}
                    </div>

                    <div className="hidden md:block">
                      <CategoryStatusToggle
                        count={categoryStatusMap[category.id]?.count ?? 0}
                        active={categoryStatusMap[category.id]?.active ?? false}
                        toggling={togglingCategoryId === category.id}
                        name={category.name}
                        onToggle={() => handleToggleCategoryActive(category)}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      {showReorder && (
                        <ReorderControl
                          name={category.name}
                          isFirst={index === 0}
                          isLast={index === filteredCategories.length - 1}
                          onMoveUp={() => handleMoveCategoryUp(category.id)}
                          onMoveDown={() => handleMoveCategoryDown(category.id)}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditModal(category)}
                        className="h-7 w-7 cursor-pointer rounded-[7px] bg-muted text-foreground hover:bg-muted"
                        aria-label={`Editar ${category.name}`}
                        title="Editar"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRequestDelete(category)}
                          className="h-7 w-7 cursor-pointer rounded-[7px] bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                          aria-label={`Remover ${category.name}`}
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredCategories.length === 0 && !loading && (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-500">
                  <LayoutGrid className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-bold text-foreground">
                  Nenhuma categoria encontrada
                </p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {searchQuery
                    ? "Tente outro termo de busca"
                    : "Comece adicionando sua primeira categoria"}
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-xl border border-border bg-card p-3.5 md:max-h-full md:overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-extrabold text-foreground">
                  Prévia no app
                </h2>
                <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  Abas do cardápio
                </p>
              </div>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </div>

            {previewCats.length === 0 ? (
              <div className="mt-3 rounded-xl border border-border bg-muted px-3 py-4 text-center text-[11.5px] font-semibold text-muted-foreground">
                {hasCategoryProductData
                  ? "Nenhuma categoria visível no app no momento."
                  : "Cadastre produtos pra ver a prévia do app."}
              </div>
            ) : (
              <>
                {/* Abas navegáveis: filtram a prévia por categoria. */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedPreviewCat("")}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                      selectedPreviewCat === ""
                        ? "bg-zinc-900 text-white"
                        : "border border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    Todos
                  </button>
                  {previewCats.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedPreviewCat(category)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                        selectedPreviewCat === category
                          ? "bg-zinc-900 text-white"
                          : "border border-border bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {/* Prévia de verdade: os mesmos cards do app do cliente,
                    read-only (componente compartilhado, LDMF-454). */}
                <MenuItemsList
                  className="mt-3"
                  categories={previewListCategories}
                  groupedItems={previewGrouped}
                  onSelectItem={setPreviewItem}
                />
              </>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="max-h-[90vh] rounded-xl p-0 sm:max-w-[500px]">
          <DialogHeader className="border-b border-border px-4 pb-3 pt-4 sm:px-6">
            <DialogTitle className="text-lg font-extrabold text-foreground">
              {editingCategory
                ? "Editar Categoria"
                : "Adicionar Nova Categoria"}
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-muted-foreground">
              Preencha as informações da categoria.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="name" className="text-xs">
                  Nome da Categoria *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormField("name", e.target.value)}
                  placeholder="Ex: Pizza, Sobremesas, Bebidas"
                  maxLength={50}
                  className="h-10 rounded-xl border-border text-xs focus-visible:ring-brand-200"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="description" className="text-xs">
                  Descrição
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    updateFormField("description", e.target.value)
                  }
                  placeholder="Descreva a categoria..."
                  rows={3}
                  maxLength={200}
                  className="resize-none rounded-xl border-border text-xs focus-visible:ring-brand-200"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-4 py-3 sm:px-6">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              className="cursor-pointer rounded-xl border-border text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCategory}
              disabled={isSaving}
              className="cursor-pointer rounded-xl bg-brand-500 text-xs font-bold text-white hover:bg-brand-600"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editingCategory ? "Atualizando..." : "Criando..."}
                </>
              ) : (
                <>{editingCategory ? "Atualizar" : "Criar"} Categoria</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            handleCancelDelete();
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl bg-card text-center shadow-2xl sm:w-fit">
          <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 dark:bg-yellow-900">
            <TriangleAlert className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>

          <AlertDialogHeader className="space-y-3 px-4">
            <AlertDialogTitle className="text-center text-xl font-bold text-foreground">
              Atenção!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm text-muted-foreground">
              <p>
                Você está prestes a remover{" "}
                <strong className="text-foreground">
                  &quot;{deleteTarget?.name}&quot;
                </strong>{" "}
                das categorias.
              </p>
              <p className="font-medium text-red-600 dark:text-red-400">
                Esta ação não poderá ser desfeita.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex w-full flex-row gap-3 px-4 pb-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              className="h-10 flex-1 cursor-pointer rounded-xl border-border font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="h-10 flex-1 cursor-pointer rounded-xl bg-red-600 font-medium text-white hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                "Remover"
              )}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prato aberto na prévia: modal do cliente em modo read-only, pra o
          lojista ver tamanhos/complementos como o cliente vê (LDMF-465). */}
      {previewItem && (
        <CustomizeOrder
          preview
          productData={previewItem}
          isModalOpen
          setIsModalOpen={(open) => {
            if (!open) setPreviewItem(null);
          }}
        />
      )}
    </AdminPageLayout>
  );
}

export default function CategoryManagementPage() {
  return (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager"]}>
      <CategoryManagementContent />
    </ProtectedRoute>
  );
}
