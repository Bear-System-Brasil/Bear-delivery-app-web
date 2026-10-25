"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { AdminDish, AdminDishCard } from "@/components/admin-dish-card";
import { ProductAddOnsPanel } from "@/components/product-add-ons-dialog";
import { ProductVariationsPanel } from "@/components/product-variations-dialog";
import ProtectedRoute from "@/components/protected-route";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CurrencyCentsInput } from "@/components/ui/currency-cents-input";
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
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useMenuManagement,
  useProductAddOns,
  useProductVariations,
  type MenuModalTab,
} from "@/hooks";
import {
  Building2,
  GripHorizontal,
  Loader2,
  MoveHorizontal,
  Plus,
  Search,
  TriangleAlert,
  UtensilsCrossed,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { toast } from "sonner";

const fieldClassName =
  "h-9 sm:h-10 rounded-[10px] border-border bg-card text-xs sm:text-sm shadow-none focus-visible:ring-1 focus-visible:ring-brand-500";

const textareaClassName =
  "min-h-[64px] rounded-[10px] border-border bg-card text-xs sm:text-sm shadow-none resize-none focus-visible:ring-1 focus-visible:ring-brand-500";

function MenuManagementContent() {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [canCategoryScroll, setCanCategoryScroll] = useState(false);
  const [isCategoryDragActive, setIsCategoryDragActive] = useState(false);
  const categoriesScrollRef = useRef<HTMLDivElement>(null);
  const categoryDragTrackRef = useRef<HTMLDivElement>(null);
  const categoryDragButtonRef = useRef<HTMLButtonElement>(null);
  const categoryDragStartRef = useRef<{
    pointerX: number;
    scrollLeft: number;
  } | null>(null);
  const canCategoryScrollRef = useRef(false);
  const categoryScrollProgressRef = useRef(0);
  const categoryVisualFrameRef = useRef<number | null>(null);
  const categoryDragFrameRef = useRef<number | null>(null);
  const pendingCategoryScrollLeftRef = useRef<number | null>(null);

  const {
    products,
    categories,
    companyId,
    isLoading: loading,
    isModalOpen,
    editingProduct,
    formData,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    handleOpenCreateModal,
    handleOpenEditModal,
    handleCloseModal,
    handleSaveProduct,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleToggleAvailability,
    handleDeleteProductImage,
    updateFormField,
    isSaving,
    isDeleting,
    deleteTarget,
    isCreatingCategory,
    setIsCreatingCategory,
    newCategoryName,
    setNewCategoryName,
    activeTab,
    setActiveTab,
    draftVariations,
    setDraftVariations,
    draftAddOns,
    setDraftAddOns,
  } = useMenuManagement();

  const editingProductId = editingProduct?.id ?? null;
  const { data: existingVariations = [] } = useProductVariations(
    editingProductId,
    companyId,
  );
  const { data: existingAddOns = [] } = useProductAddOns(
    editingProductId,
    companyId,
  );

  const variationsCount = editingProduct
    ? existingVariations.length
    : draftVariations.length;

  const addOnsCount = editingProduct
    ? existingAddOns.length
    : draftAddOns.length;

  const variationsTabLabel = editingProduct
    ? `Tamanhos (${variationsCount})`
    : variationsCount > 0
      ? `Tamanhos (${variationsCount})`
      : "Tamanhos";

  const addOnsTabLabel = editingProduct
    ? `Complementos (${addOnsCount})`
    : addOnsCount > 0
      ? `Complementos (${addOnsCount})`
      : "Complementos";

  const filteredDishes: AdminDish[] = useMemo(() => {
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: product.salePrice,
      image:
        product.imageURL && product.imageURL.length > 0
          ? product.imageURL[0].url
          : "/placeholder.jpg",
      category:
        product.productCategories?.[0]?.category?.name || "Sem categoria",
      available: product.isAvailable ?? true,
      tags: [],
    }));
  }, [products]);

  // Contadores da lista exibida (respeitam busca e categoria selecionada),
  // no mesmo padrao das outras telas do design novo.
  const dishCount = filteredDishes.length;
  const availableCount = useMemo(
    () => filteredDishes.filter((dish) => dish.available !== false).length,
    [filteredDishes],
  );

  const allCategories = useMemo(() => {
    return [{ id: "all", name: "Todas" }, ...categories];
  }, [categories]);

  const syncCategoryDragVisualState = useCallback(() => {
    const scrollElement = categoriesScrollRef.current;
    const trackElement = categoryDragTrackRef.current;
    const buttonElement = categoryDragButtonRef.current;
    if (!scrollElement) return;

    const maxScroll = scrollElement.scrollWidth - scrollElement.clientWidth;
    const nextCanScroll = maxScroll > 1;
    const nextProgress =
      maxScroll > 0
        ? Math.min(Math.max(scrollElement.scrollLeft / maxScroll, 0), 1)
        : 0;

    categoryScrollProgressRef.current = nextProgress;

    if (buttonElement && trackElement) {
      const maxHandleOffset = Math.max(
        trackElement.clientWidth - buttonElement.offsetWidth,
        0,
      );
      const handleOffset = nextProgress * maxHandleOffset;
      buttonElement.style.transform = `translate3d(${handleOffset}px, -50%, 0)`;
    }

    if (canCategoryScrollRef.current !== nextCanScroll) {
      canCategoryScrollRef.current = nextCanScroll;
      setCanCategoryScroll(nextCanScroll);
    }
  }, []);

  const scheduleCategoryDragVisualSync = useCallback(() => {
    if (categoryVisualFrameRef.current !== null) return;

    categoryVisualFrameRef.current = window.requestAnimationFrame(() => {
      categoryVisualFrameRef.current = null;
      syncCategoryDragVisualState();
    });
  }, [syncCategoryDragVisualState]);

  const applyPendingCategoryScrollLeft = useCallback(() => {
    const scrollElement = categoriesScrollRef.current;
    const nextScrollLeft = pendingCategoryScrollLeftRef.current;

    if (!scrollElement || nextScrollLeft === null) return;

    scrollElement.scrollLeft = nextScrollLeft;
    pendingCategoryScrollLeftRef.current = null;
    syncCategoryDragVisualState();
  }, [syncCategoryDragVisualState]);

  const requestCategoryScrollLeft = useCallback(
    (nextScrollLeft: number) => {
      pendingCategoryScrollLeftRef.current = nextScrollLeft;

      if (categoryDragFrameRef.current !== null) return;

      categoryDragFrameRef.current = window.requestAnimationFrame(() => {
        categoryDragFrameRef.current = null;
        applyPendingCategoryScrollLeft();
      });
    },
    [applyPendingCategoryScrollLeft],
  );

  useEffect(() => {
    const scrollElement = categoriesScrollRef.current;
    if (!scrollElement) return;

    syncCategoryDragVisualState();
    scheduleCategoryDragVisualSync();

    scrollElement.addEventListener("scroll", scheduleCategoryDragVisualSync, {
      passive: true,
    });
    window.addEventListener("resize", scheduleCategoryDragVisualSync);

    return () => {
      if (categoryVisualFrameRef.current !== null) {
        window.cancelAnimationFrame(categoryVisualFrameRef.current);
        categoryVisualFrameRef.current = null;
      }

      if (categoryDragFrameRef.current !== null) {
        window.cancelAnimationFrame(categoryDragFrameRef.current);
        categoryDragFrameRef.current = null;
      }

      scrollElement.removeEventListener(
        "scroll",
        scheduleCategoryDragVisualSync,
      );
      window.removeEventListener("resize", scheduleCategoryDragVisualSync);
    };
  }, [
    allCategories.length,
    scheduleCategoryDragVisualSync,
    syncCategoryDragVisualState,
  ]);

  useEffect(() => {
    if (canCategoryScroll) {
      scheduleCategoryDragVisualSync();
    }
  }, [canCategoryScroll, scheduleCategoryDragVisualSync]);
  const handleCategoryDragPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const scrollElement = categoriesScrollRef.current;
      if (!scrollElement) return;

      event.preventDefault();
      categoryDragStartRef.current = {
        pointerX: event.clientX,
        scrollLeft: scrollElement.scrollLeft,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsCategoryDragActive(true);
    },
    [],
  );

  const handleCategoryDragPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

      const scrollElement = categoriesScrollRef.current;
      const trackElement = categoryDragTrackRef.current;
      const buttonElement = categoryDragButtonRef.current;
      const dragStart = categoryDragStartRef.current;

      if (!scrollElement || !trackElement || !buttonElement || !dragStart) {
        return;
      }

      const maxScroll = scrollElement.scrollWidth - scrollElement.clientWidth;
      if (maxScroll <= 0) return;

      const availableTrackWidth = Math.max(
        trackElement.clientWidth - buttonElement.offsetWidth,
        1,
      );

      const deltaX = event.clientX - dragStart.pointerX;
      const nextScrollLeft = Math.min(
        Math.max(
          dragStart.scrollLeft + deltaX * (maxScroll / availableTrackWidth),
          0,
        ),
        maxScroll,
      );

      scrollElement.scrollLeft = nextScrollLeft;

      // Atualiza o botão imediatamente (sem esperar o evento scroll)
      const progress = nextScrollLeft / maxScroll;
      categoryScrollProgressRef.current = progress;

      const maxHandleOffset = Math.max(
        trackElement.clientWidth - buttonElement.offsetWidth,
        0,
      );
      buttonElement.style.transform = `translate3d(${progress * maxHandleOffset}px, -50%, 0)`;
    },
    [],
  );

  const handleCategoryDragPointerEnd = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      categoryDragStartRef.current = null;
      setIsCategoryDragActive(false);
    },
    [],
  );
  const handleCategoryDragKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const scrollElement = categoriesScrollRef.current;
      if (!scrollElement) return;

      const maxScroll = scrollElement.scrollWidth - scrollElement.clientWidth;
      const step = Math.max(scrollElement.clientWidth * 0.32, 96);
      let nextScrollLeft: number | null = null;

      if (event.key === "ArrowLeft") {
        nextScrollLeft = scrollElement.scrollLeft - step;
      } else if (event.key === "ArrowRight") {
        nextScrollLeft = scrollElement.scrollLeft + step;
      } else if (event.key === "Home") {
        nextScrollLeft = 0;
      } else if (event.key === "End") {
        nextScrollLeft = maxScroll;
      }

      if (nextScrollLeft === null) return;

      event.preventDefault();
      scrollElement.scrollTo({
        left: Math.min(Math.max(nextScrollLeft, 0), maxScroll),
        behavior: "smooth",
      });
    },
    [],
  );

  const resetImageState = useCallback(() => {
    setImagePreviews((prev) => {
      prev.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      return [];
    });
    setSelectedImages([]);
  }, []);

  const handleEditDish = (dish: AdminDish) => {
    const product = products.find((p) => p.id === dish.id);
    if (product) {
      resetImageState();
      handleOpenEditModal(product, "details");
    }
  };

  const handleManageVariations = (dish: AdminDish) => {
    const product = products.find((p) => p.id === dish.id);
    if (product) {
      resetImageState();
      handleOpenEditModal(product, "variations");
    }
  };

  const handleManageAddOns = (dish: AdminDish) => {
    const product = products.find((p) => p.id === dish.id);
    if (product) {
      resetImageState();
      handleOpenEditModal(product, "addons");
    }
  };

  const handleDeleteDish = async (dish: AdminDish) => {
    const product = products.find((p) => p.id === dish.id);
    if (product) {
      handleRequestDelete(product);
    }
  };

  const handleToggleAvail = async (dish: AdminDish) => {
    const product = products.find((p) => p.id === dish.id);
    if (product) {
      handleToggleAvailability(product);
    }
  };

  const handleCloseModalWithReset = () => {
    resetImageState();
    handleCloseModal();
  };

  useEffect(() => {
    if (!isModalOpen) {
      resetImageState();
    }
  }, [isModalOpen, resetImageState]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagePreviews]);

  const handleClearForm = () => {
    if (editingProduct) {
      handleOpenEditModal(editingProduct, activeTab);
    } else {
      handleOpenCreateModal(activeTab);
    }
    resetImageState();
  };

  return (
    <AdminPageLayout
      title="Cardápio"
      icon={UtensilsCrossed}
      mainClassName="px-4 pb-20 pt-5 sm:px-6 md:pb-10 lg:pl-[252px] lg:pr-8 lg:pt-[26px]"
      actions={
        <>
          <Button
            asChild
            variant="outline"
            className="h-[34px] flex-1 cursor-pointer rounded-[9px] border-border bg-card px-3 text-[12.5px] font-bold text-foreground shadow-none transition-colors hover:border-brand-200 dark:hover:border-brand-800 hover:bg-card hover:text-brand-500 sm:flex-none"
          >
            <Link href="/company-profile">
              <Building2 className="h-4 w-4" />
              Perfil
            </Link>
          </Button>

          <Button
            onClick={() => {
              resetImageState();
              handleOpenCreateModal();
            }}
            className="h-[34px] flex-1 cursor-pointer rounded-[9px] bg-brand-500 px-4 text-[12.5px] font-extrabold text-white shadow-[0_4px_12px_var(--tw-shadow-color)] shadow-brand-500/25 transition-colors hover:bg-brand-600 sm:flex-none"
          >
            <Plus className="h-4 w-4" />
            Adicionar Prato
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-[1180px]">
        <p className="mb-3 text-[12.5px] font-medium text-muted-foreground">
          Pratos e itens que o cliente vê no app
        </p>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-[420px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar pratos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[38px] rounded-[10px] border-border bg-card pl-9 text-[12.5px] font-medium text-foreground shadow-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-brand-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-xl border border-border bg-card px-2.5 py-1 text-[11.5px] font-bold text-foreground">
              {dishCount} {dishCount === 1 ? "prato" : "pratos"}
            </span>
            <span className="rounded-xl bg-muted px-2.5 py-1 text-[11.5px] font-bold text-muted-foreground">
              {availableCount}{" "}
              {availableCount === 1 ? "disponível" : "disponíveis"}
            </span>
          </div>
        </div>

        <Tabs
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          className="mb-4"
        >
          <TabsList
            ref={categoriesScrollRef}
            id="menu-category-tabs"
            className="scrollbar-hide h-auto w-full justify-start gap-[7px] overflow-x-auto bg-transparent p-0"
          >
            {allCategories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="h-[30px] shrink-0 rounded-full border border-border bg-card px-[13px] py-0 text-xs font-semibold text-foreground shadow-none transition-colors data-[state=active]:border-selected data-[state=active]:bg-selected data-[state=active]:text-selected-foreground data-[state=active]:shadow-none"
              >
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {canCategoryScroll && (
            <div
              ref={categoryDragTrackRef}
              className="relative mt-2 h-[38px] overflow-hidden rounded-full border border-brand-200 dark:border-brand-800 bg-card shadow-[inset_0_1px_2px_rgba(20,22,26,0.06)]"
            >
              <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-100 dark:bg-brand-950/60" />
              <button
                ref={categoryDragButtonRef}
                type="button"
                aria-controls="menu-category-tabs"
                aria-label="Arraste para navegar pelas categorias"
                title="Arraste para navegar pelas categorias"
                onPointerDown={handleCategoryDragPointerDown}
                onPointerMove={handleCategoryDragPointerMove}
                onPointerUp={handleCategoryDragPointerEnd}
                onPointerCancel={handleCategoryDragPointerEnd}
                onKeyDown={handleCategoryDragKeyDown}
                className={`absolute left-0 top-1/2 z-10 flex h-[30px] min-w-[112px] touch-none select-none items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold text-white shadow-[0_8px_18px_var(--tw-shadow-color)] shadow-brand-500/26 outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-brand-500/35 sm:min-w-[126px] ${
                  isCategoryDragActive
                    ? "cursor-grabbing bg-brand-600 shadow-[0_10px_22px_var(--tw-shadow-color)] shadow-brand-500/34"
                    : "cursor-grab bg-brand-500 hover:bg-brand-600"
                }`}
                style={{
                  transform: "translate3d(0, -50%, 0)",
                  willChange: "transform",
                }}
              >
                <MoveHorizontal className="h-3.5 w-3.5" />
                <span>Arraste</span>
                <GripHorizontal className="h-3.5 w-3.5 opacity-80" />
              </button>
            </div>
          )}
        </Tabs>

        {loading ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex gap-3 rounded-[13px] border border-border bg-card p-2.5"
              >
                <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-[10px]" />
                <div className="flex flex-1 flex-col justify-center gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-4/5" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-5 w-24 rounded-md" />
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-1.5">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-7 w-7 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredDishes.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {filteredDishes.map((dish) => (
              <AdminDishCard
                key={dish.id}
                dish={dish}
                onEdit={handleEditDish}
                onDelete={handleDeleteDish}
                onToggleAvailability={handleToggleAvail}
                onManageAddOns={handleManageAddOns}
                onManageVariations={handleManageVariations}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[13px] border border-border bg-card px-5 py-9 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] bg-muted text-brand-500">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-[13.5px] font-bold text-foreground">
              Nenhum prato encontrado
            </p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {searchQuery
                ? "Tente outro termo de busca"
                : "Comece adicionando seu primeiro prato"}
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseModalWithReset();
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col rounded-[14px] border-border bg-card p-0 shadow-[0_24px_70px_rgba(20,22,26,0.18)] sm:max-w-[560px]">
          <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
            <DialogTitle className="text-base font-extrabold text-foreground sm:text-lg">
              {editingProduct ? "Editar Prato" : "Adicionar Novo Prato"}
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-muted-foreground sm:text-sm">
              {editingProduct
                ? `Gerencie informações, tamanhos e complementos de "${editingProduct.name}".`
                : "Preencha as informações, tamanhos e complementos do prato."}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as MenuModalTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b border-border px-4 py-2 sm:px-6">
              <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg bg-muted p-1">
                <TabsTrigger value="details" className="text-xs font-bold">
                  Dados do Prato
                </TabsTrigger>
                <TabsTrigger value="variations" className="text-xs font-bold">
                  {variationsTabLabel}
                </TabsTrigger>
                <TabsTrigger value="addons" className="text-xs font-bold">
                  {addOnsTabLabel}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
              <TabsContent value="details" className="mt-0 focus-visible:ring-0">
                <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="productImage"
                  className="text-xs font-bold text-foreground sm:text-sm"
                >
                  Fotos do Prato
                </Label>
                <Input
                  id="productImage"
                  type="file"
                  accept="image/*"
                  multiple
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = "";
                  }}
                  onChange={(e) => {
                    const input = e.target;
                    const files = Array.from(input.files || []);
                    input.value = "";
                    if (!files.length) return;

                    const validFiles: File[] = [];
                    for (const file of files) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error(
                          `"${file.name}" é muito grande. Máximo 5MB`,
                        );
                        continue;
                      }
                      validFiles.push(file);
                    }

                    if (validFiles.length) {
                      setSelectedImages((prev) => [...prev, ...validFiles]);
                      setImagePreviews((prev) => [
                        ...prev,
                        ...validFiles.map((file) => URL.createObjectURL(file)),
                      ]);
                    }
                  }}
                  className={fieldClassName}
                />
                <p className="text-[10.5px] font-medium text-muted-foreground">
                  Pode selecionar mais de uma foto de uma vez. Máx. 5MB cada.
                </p>

                {editingProduct &&
                  editingProduct.imageURL &&
                  editingProduct.imageURL.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editingProduct.imageURL.map((img) => (
                        <div
                          key={img.id}
                          className="relative h-16 w-16 shrink-0"
                        >
                          <img
                            src={img.url}
                            alt="Foto do prato"
                            className="h-full w-full rounded-[10px] border border-border object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteProductImage(
                                editingProduct.id,
                                img.id,
                              )
                            }
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 dark:bg-red-700 text-white shadow-sm transition hover:bg-red-700 dark:hover:bg-red-800"
                            aria-label="Remover foto"
                            title="Remover foto"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {imagePreviews.map((preview, index) => (
                      <div
                        key={preview}
                        className="relative h-16 w-16 shrink-0"
                      >
                        <img
                          src={preview}
                          alt={`Nova foto ${index + 1}`}
                          className="h-full w-full rounded-[10px] border border-[#1B7F4C] object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(preview);
                            setImagePreviews((prev) =>
                              prev.filter((_, i) => i !== index),
                            );
                            setSelectedImages((prev) =>
                              prev.filter((_, i) => i !== index),
                            );
                          }}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 dark:bg-red-700 text-white shadow-sm transition hover:bg-red-700 dark:hover:bg-red-800"
                          aria-label="Remover foto selecionada"
                          title="Remover foto selecionada"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="name"
                  className="text-xs font-bold text-foreground sm:text-sm"
                >
                  Nome do Prato *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormField("name", e.target.value)}
                  placeholder="Nome do prato"
                  maxLength={80}
                  className={fieldClassName}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground sm:text-sm">
                    Categoria *
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCategory(!isCreatingCategory);
                      if (isCreatingCategory) {
                        setNewCategoryName("");
                      } else {
                        updateFormField("categoryId", "");
                      }
                    }}
                    className="cursor-pointer text-xs font-extrabold text-brand-500 transition-colors hover:text-brand-600"
                  >
                    {isCreatingCategory
                      ? "Selecionar existente"
                      : "+ Criar nova"}
                  </button>
                </div>

                {isCreatingCategory ? (
                  <Input
                    id="newCategory"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Digite o nome da nova categoria"
                    maxLength={50}
                    className={fieldClassName}
                    autoFocus
                  />
                ) : (
                  <select
                    value={formData.categoryId}
                    onChange={(e) =>
                      updateFormField("categoryId", e.target.value)
                    }
                    className="h-9 w-full rounded-[10px] border border-border bg-card px-3 text-xs font-medium text-foreground outline-none transition-colors focus:border-brand-500 sm:h-10 sm:text-sm"
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="description"
                  className="text-xs font-bold text-foreground sm:text-sm"
                >
                  Descrição *
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    updateFormField("description", e.target.value)
                  }
                  placeholder="Descreva o prato"
                  maxLength={300}
                  className={textareaClassName}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor="costPrice"
                    className="text-xs font-bold text-foreground sm:text-sm"
                  >
                    Custo
                  </Label>

                  <CurrencyCentsInput
                    id="costPrice"
                    value={formData.costPrice}
                    onValueChange={(value) =>
                      updateFormField("costPrice", value)
                    }
                    maskWhileTyping={true}
                    placeholder="R$ 0,01"
                    className={fieldClassName}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label
                    htmlFor="salePrice"
                    className="text-xs font-bold text-foreground sm:text-sm"
                  >
                    Venda *
                  </Label>

                  <CurrencyCentsInput
                    id="salePrice"
                    value={formData.salePrice}
                    onValueChange={(value) =>
                      updateFormField("salePrice", value)
                    }
                    maskWhileTyping={true}
                    placeholder="R$ 0,01"
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="stockQuantity"
                  className="text-xs font-bold text-foreground sm:text-sm"
                >
                  Qtd. Estoque
                </Label>

                <StockQuantityInput
                  id="stockQuantity"
                  value={formData.stockQuantity}
                  onValueChange={(value) =>
                    updateFormField("stockQuantity", value)
                  }
                  placeholder="1"
                  minValue={1}
                  maxValue={9999}
                  className={fieldClassName}
                />
              </div>

              <div className="flex items-center gap-2 rounded-[10px] border border-border bg-muted px-3 py-2">
                <input
                  type="checkbox"
                  id="isAvailable"
                  checked={formData.available}
                  onChange={(e) =>
                    updateFormField("available", e.target.checked)
                  }
                  className="h-4 w-4 cursor-pointer accent-brand-500"
                />
                <Label
                  htmlFor="isAvailable"
                  className="cursor-pointer text-xs font-bold text-foreground sm:text-sm"
                >
                  Disponível para venda
                </Label>
              </div>
            </div>
          </TabsContent>

              <TabsContent value="variations" className="mt-0 focus-visible:ring-0">
                <ProductVariationsPanel
                  productId={editingProduct?.id ?? null}
                  productName={editingProduct?.name ?? formData.name}
                  salePrice={formData.salePrice ?? 0}
                  companyId={companyId}
                  isDraftMode={!editingProduct}
                  draftVariations={draftVariations}
                  onDraftVariationsChange={setDraftVariations}
                />
              </TabsContent>

              <TabsContent value="addons" className="mt-0 focus-visible:ring-0">
                <ProductAddOnsPanel
                  productId={editingProduct?.id ?? null}
                  productName={editingProduct?.name ?? formData.name}
                  companyId={companyId}
                  isDraftMode={!editingProduct}
                  draftAddOns={draftAddOns}
                  onDraftAddOnsChange={setDraftAddOns}
                />
              </TabsContent>
            </div>

            <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:px-6">
              {!editingProduct && (
                <Button
                  variant="ghost"
                  onClick={handleClearForm}
                  className="h-9 w-full cursor-pointer rounded-[9px] text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground sm:w-auto"
                >
                  Limpar Tudo
                </Button>
              )}
              <div className="flex w-full flex-col-reverse gap-2 sm:ms-auto sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  onClick={handleCloseModalWithReset}
                  className="h-9 w-full cursor-pointer rounded-[9px] border-border bg-card text-sm font-bold text-foreground shadow-none hover:bg-muted sm:w-auto"
                >
                  {editingProduct ? "Fechar" : "Cancelar"}
                </Button>
                <Button
                  onClick={async () => {
                    await handleSaveProduct(selectedImages);
                    resetImageState();
                  }}
                  disabled={isSaving}
                  className="h-9 w-full cursor-pointer rounded-[9px] bg-brand-500 text-sm font-extrabold text-white shadow-[0_4px_12px_var(--tw-shadow-color)] shadow-brand-500/25 transition-colors hover:bg-brand-600 sm:w-auto"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editingProduct ? "Atualizando..." : "Criando..."}
                    </>
                  ) : (
                    <>{editingProduct ? "Atualizar" : "Criar"} Prato</>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </Tabs>
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
        <AlertDialogContent className="flex w-[calc(100vw-32px)] max-w-sm flex-col items-center rounded-[14px] border-border bg-card text-center shadow-[0_24px_70px_rgba(20,22,26,0.18)]">
          <div className="mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
            <TriangleAlert className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </div>

          <AlertDialogHeader className="space-y-3 px-2">
            <AlertDialogTitle className="text-center text-lg font-extrabold text-foreground">
              Atenção!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm font-medium text-muted-foreground">
              <span className="block">
                Você está prestes a remover{" "}
                <strong className="text-foreground">
                  &quot;{deleteTarget?.name}&quot;
                </strong>{" "}
                do seu cardápio.
              </span>
              <span className="block font-bold text-red-600 dark:text-red-400">
                Esta ação não poderá ser desfeita.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex w-full flex-row gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              className="h-10 flex-1 cursor-pointer rounded-[9px] border-border bg-card font-bold text-foreground shadow-none hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="h-10 flex-1 cursor-pointer rounded-[9px] bg-red-600 dark:bg-red-700 font-bold text-white transition-colors hover:bg-red-700 dark:hover:bg-red-800"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                "Remover Prato"
              )}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPageLayout>
  );
}

export default function MenuManagementPage() {
  return (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager"]}>
      <MenuManagementContent />
    </ProtectedRoute>
  );
}
