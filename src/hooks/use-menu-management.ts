import type { Product, ProductAddOn, ProductVariation } from "@/services/api";
import { apiService } from "@/services/api";

export type MenuModalTab = "details" | "variations" | "addons";
import { useAuthStore } from "@/stores";
import { getErrorMessage } from "@/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCategories } from "./use-categories";
import {
  useCompanyProducts,
  useCreateProduct,
  useDeleteProduct,
  useUpdateProduct,
} from "./use-products";

interface ProductFormData {
  name: string;
  description: string;
  costPrice: number | undefined;
  salePrice: number | undefined;
  categoryId: string;
  imageURL: string[];
  available: boolean;
  stockQuantity: number | undefined;
}

function unwrapProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.id === "string" && typeof obj.name === "string") {
    return raw as Product;
  }

  const nested = obj.data;
  if (
    nested &&
    typeof nested === "object" &&
    typeof (nested as { id?: unknown }).id === "string" &&
    typeof (nested as { name?: unknown }).name === "string"
  ) {
    return nested as Product;
  }

  return null;
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as Record<string, unknown>;
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  if (Array.isArray(body.message) && body.message.length) {
    return String(body.message[0]);
  }
  if (typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  return fallback;
}

async function uploadProductImageSafe(productId: string, file: File) {
  const fieldNames = ["image", "file", "photo"];
  let lastMessage = "Erro ao fazer upload da imagem";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const field of fieldNames) {
      const formData = new FormData();
      formData.append(field, file, file.name);

      const response = await fetch(`/api/proxy/product/image/${productId}`, {
        method: "POST",
        headers: { "X-Auth-Required": "1" },
        body: formData,
      });

      const raw = await response.text();
      let payload: unknown = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }

      if (response.ok) {
        return { success: true as const, data: payload };
      }

      lastMessage = readErrorMessage(
        payload,
        `Erro ${response.status} ao enviar a imagem`,
      );

      if (response.status === 404 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        break;
      }
    }
  }

  return { success: false as const, message: lastMessage };
}

function buildCategoryLink(
  productId: string,
  categoryId: string,
  categoryName: string,
): NonNullable<Product["productCategories"]> {
  return [
    {
      id: `${productId}-${categoryId}`,
      productId,
      categoryId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      category: {
        id: categoryId,
        name: categoryName,
        companyId: "",
        description: "",
        created_at: "",
        updated_at: "",
      },
    },
  ];
}

export const useMenuManagement = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const companyId = user?.companyId || user?.id || null;
  const productsQueryKey = ["products", "company", companyId] as const;

  const { data: queryProducts = [], isLoading: loadingProducts } =
    useCompanyProducts(companyId);
  const { data: categories = [], isLoading: loadingCategories } =
    useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    description: "",
    costPrice: undefined,
    salePrice: undefined,
    categoryId: "",
    imageURL: [],
    available: true,
    stockQuantity: undefined,
  });
  const [activeTab, setActiveTab] = useState<MenuModalTab>("details");
  const [draftVariations, setDraftVariations] = useState<ProductVariation[]>([]);
  const [draftAddOns, setDraftAddOns] = useState<ProductAddOn[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [createdProducts, setCreatedProducts] = useState<Product[]>([]);
  const [removedProductIds, setRemovedProductIds] = useState<string[]>([]);

  const upsertProductInCache = (product: Product) => {
    setCreatedProducts((prev) => {
      const index = prev.findIndex((item) => item.id === product.id);
      if (index === -1) return [...prev, product];
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...product,
        imageURL: product.imageURL?.length
          ? product.imageURL
          : next[index].imageURL,
        productCategories: product.productCategories?.length
          ? product.productCategories
          : next[index].productCategories,
      };
      return next;
    });

    queryClient.setQueryData(productsQueryKey, (old: Product[] = []) => {
      const list = Array.isArray(old) ? old : [];
      const index = list.findIndex((item) => item.id === product.id);
      if (index === -1) return [...list, product];

      const current = list[index];
      const next = [...list];
      next[index] = {
        ...current,
        ...product,
        imageURL: product.imageURL?.length
          ? product.imageURL
          : current.imageURL,
        productCategories: product.productCategories?.length
          ? product.productCategories
          : current.productCategories,
      };
      return next;
    });
  };

  const products = useMemo(() => {
    const fromQuery = (
      Array.isArray(queryProducts) ? queryProducts : []
    ).filter((product) => !removedProductIds.includes(product.id));

    const extras = createdProducts.filter(
      (product) =>
        !removedProductIds.includes(product.id) &&
        !fromQuery.some((item) => item.id === product.id),
    );

    return [...extras, ...fromQuery];
  }, [queryProducts, createdProducts, removedProductIds]);

  const filteredProducts = products.filter((product: Product) => {
    if (!product?.name) return false;

    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" ||
      product.productCategories?.some(
        (pc) =>
          pc.categoryId === selectedCategory ||
          pc.category?.id === selectedCategory,
      );

    return matchesSearch && matchesCategory;
  });

  const handleOpenCreateModal = (tab: MenuModalTab = "details") => {
    setEditingProduct(null);
    setFormData({
      name: "",
      description: "",
      costPrice: undefined,
      salePrice: undefined,
      categoryId: "",
      imageURL: [],
      available: true,
      stockQuantity: undefined,
    });
    setDraftVariations([]);
    setDraftAddOns([]);
    setActiveTab(tab);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (
    product: Product,
    tab: MenuModalTab = "details",
  ) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      categoryId:
        product.productCategories?.[0]?.category?.id ||
        product.productCategories?.[0]?.categoryId ||
        "",
      imageURL:
        product.imageURL?.map((img) =>
          typeof img === "string" ? img : img.url,
        ) || [],
      available: product.isAvailable,
      stockQuantity: product.stockQuantity || 0,
    });
    setDraftVariations([]);
    setDraftAddOns([]);
    setActiveTab(tab);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setIsCreatingCategory(false);
    setNewCategoryName("");
    setDraftVariations([]);
    setDraftAddOns([]);
    setActiveTab("details");
    setFormData({
      name: "",
      description: "",
      costPrice: undefined,
      salePrice: undefined,
      categoryId: "",
      imageURL: [],
      available: true,
      stockQuantity: undefined,
    });
  };

  const updateFormField = <K extends keyof ProductFormData>(
    field: K,
    value: ProductFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error("Nome do produto é obrigatório");
      return false;
    }
    if (formData.name.trim().length > 80) {
      toast.error("Nome do prato deve ter no máximo 80 caracteres");
      return false;
    }
    if (formData.description.trim().length > 300) {
      toast.error("Descrição deve ter no máximo 300 caracteres");
      return false;
    }
    if (formData.salePrice === undefined || formData.salePrice < 0.01) {
      toast.error("Preço de venda é obrigatório e deve ser no mínimo R$ 0,01");
      return false;
    }
    if (formData.costPrice === undefined || formData.costPrice < 0) {
      toast.error("Preço de custo é obrigatório e deve ser não-negativo");
      return false;
    }
    if (
      formData.costPrice !== undefined &&
      formData.costPrice > 0 &&
      formData.costPrice < 0.01
    ) {
      toast.error(
        "Preço de custo, quando informado, deve ser no mínimo R$ 0,01",
      );
      return false;
    }
    if (
      formData.costPrice !== undefined &&
      formData.salePrice !== undefined &&
      formData.costPrice > formData.salePrice
    ) {
      toast.error("Preço de custo não pode ser maior que o preço de venda");
      return false;
    }
    if (formData.stockQuantity === undefined || formData.stockQuantity < 1) {
      toast.error("Quantidade em estoque é obrigatória e deve ser no mínimo 1");
      return false;
    }
    if (isCreatingCategory) {
      if (!newCategoryName.trim()) {
        toast.error("O nome da nova categoria é obrigatório");
        return false;
      }
      if (newCategoryName.trim().length < 5) {
        toast.error("Nome da categoria deve ter no mínimo 5 caracteres");
        return false;
      }
      if (newCategoryName.trim().length > 50) {
        toast.error("Nome da categoria deve ter no máximo 50 caracteres");
        return false;
      }
    } else if (!formData.categoryId) {
      toast.error("Selecione uma categoria");
      return false;
    }
    return true;
  };

  const handleSaveProduct = async (
    selectedImages?: File[],
    overrideDraftVariations?: ProductVariation[],
    overrideDraftAddOns?: ProductAddOn[],
  ) => {
    if (!validateForm()) {
      setActiveTab("details");
      return;
    }

    setIsSaving(true);

    try {
      let productId: string | null = null;
      let finalCategoryId = formData.categoryId;
      const isCreating = !editingProduct;

      if (isCreatingCategory) {
        const newCategoryResponse = await apiService.createCategory({
          name: newCategoryName,
          description: newCategoryName.trim(),
        });

        const createdCategory =
          newCategoryResponse.data &&
          typeof newCategoryResponse.data === "object" &&
          "id" in newCategoryResponse.data
            ? newCategoryResponse.data
            : unwrapProduct(newCategoryResponse.data);

        if (!newCategoryResponse.success || !createdCategory?.id) {
          toast.error("Erro ao criar a nova categoria. Tente novamente.");
          return;
        }

        finalCategoryId = createdCategory.id;
        queryClient.invalidateQueries({ queryKey: ["categories"] });
      }

      if (editingProduct) {
        await updateProduct.mutateAsync({
          id: editingProduct.id,
          data: {
            name: formData.name,
            description: formData.description,
            costPrice: formData.costPrice ?? 0,
            salePrice: formData.salePrice ?? 0,
            isAvailable: formData.available,
            stockQuantity: formData.stockQuantity ?? 0,
          },
        });
        productId = editingProduct.id;

        const oldCategoryId =
          editingProduct.productCategories?.[0]?.category?.id ||
          editingProduct.productCategories?.[0]?.categoryId;

        if (finalCategoryId && finalCategoryId !== oldCategoryId) {
          const oldLink = editingProduct.productCategories?.[0];
          const oldProductId = oldLink?.productId || editingProduct.id;
          const oldCatId = oldLink?.categoryId || oldCategoryId;
          if (oldProductId && oldCatId) {
            try {
              await apiService.unlinkCategoryFromProduct(
                oldProductId,
                oldCatId,
              );
            } catch (e) {
              console.error("Erro ao remover categoria antiga:", e);
            }
          }
          try {
            await apiService.linkCategoryToProduct(
              productId,
              finalCategoryId,
              formData.description || formData.name,
            );
          } catch (e) {
            console.error("Erro ao vincular nova categoria:", e);
            toast.error("Erro ao atualizar categoria do produto");
          }
        }
      } else {
        const result = unwrapProduct(
          await createProduct.mutateAsync({
            name: formData.name,
            description: formData.description,
            costPrice: formData.costPrice ?? 0,
            salePrice: formData.salePrice ?? 0,
            isAvailable: formData.available,
            stockQuantity: formData.stockQuantity ?? 0,
          }),
        );
        productId = result?.id || null;

        if (!result || !productId) {
          toast.error("Produto criado, mas a resposta não veio com ID.");
          return;
        }

        const selectedCat = categories.find(
          (cat) => cat.id === finalCategoryId,
        );
        const categoryName =
          selectedCat?.name || newCategoryName.trim() || "Sem categoria";

        if (finalCategoryId) {
          try {
            await apiService.linkCategoryToProduct(
              productId,
              finalCategoryId,
              formData.description || formData.name,
            );
          } catch (e) {
            console.error("Erro ao vincular categoria:", e);
            toast.error("Prato criado, mas a categoria não foi vinculada.");
          }
        }

        await queryClient.cancelQueries({ queryKey: productsQueryKey });
        upsertProductInCache({
          ...result,
          companyId: result.companyId || companyId || "",
          productCategories: result.productCategories?.length
            ? result.productCategories
            : finalCategoryId
              ? buildCategoryLink(productId, finalCategoryId, categoryName)
              : [],
        });
      }

      if (selectedImages?.length && productId) {
        upsertProductInCache({
          id: productId,
          name: formData.name,
          description: formData.description,
          costPrice: formData.costPrice ?? 0,
          salePrice: formData.salePrice ?? 0,
          isAvailable: formData.available,
          stockQuantity: formData.stockQuantity ?? 0,
          companyId: companyId || "",
          imageURL: selectedImages.map((file, index) => ({
            id: `local-${productId}-${index}`,
            url: URL.createObjectURL(file),
            productId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        } as Product);

        let latestWithImages: Product | null = null;

        for (const image of selectedImages) {
          const uploadResponse = await uploadProductImageSafe(productId, image);

          if (uploadResponse.success) {
            const uploadedProduct = unwrapProduct(uploadResponse.data);

            if (uploadedProduct) {
              latestWithImages = uploadedProduct;
            } else {
              const payload = uploadResponse.data as
                | { data?: unknown }
                | undefined;
              const image: unknown = payload?.data ?? payload;
              const url =
                typeof image === "string"
                  ? image
                  : (image as { url?: string } | undefined)?.url;
              const imageId =
                typeof image === "object"
                  ? (image as { id?: string } | null)?.id
                  : undefined;

              if (url && productId) {
                const currentUploaded = (latestWithImages?.imageURL || []).filter(
                  (img) => !img.id.startsWith("local-") && img.url !== url,
                );
                const nextImages = [
                  ...currentUploaded,
                  {
                    id: imageId || `uploaded-${Date.now()}`,
                    url,
                    productId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                ];
                latestWithImages = {
                  id: productId,
                  name: formData.name,
                  description: formData.description,
                  costPrice: formData.costPrice ?? 0,
                  salePrice: formData.salePrice ?? 0,
                  isAvailable: formData.available,
                  stockQuantity: formData.stockQuantity ?? 0,
                  companyId: companyId || "",
                  imageURL: nextImages,
                } as Product;
                upsertProductInCache(latestWithImages);
              }
            }
          } else {
            toast.error(
              `Erro ao enviar "${image.name}": ${uploadResponse.message}`,
            );
          }
        }

        if (latestWithImages) {
          upsertProductInCache(latestWithImages);
        }
      }

      if (isCreating && productId) {
        const variationsToSave =
          overrideDraftVariations ?? draftVariations;
        const addOnsToSave = overrideDraftAddOns ?? draftAddOns;

        if (variationsToSave.length > 0) {
          const variationErrors: string[] = [];
          for (const variation of variationsToSave) {
            try {
              const res = await apiService.productVariations.create(
                productId,
                {
                  name: variation.name,
                  priceModifier: variation.priceModifier,
                  stockQuantity: variation.stockQuantity ?? 0,
                  isAvailable: variation.isAvailable,
                },
              );
              if (!res.success) {
                variationErrors.push(
                  `"${variation.name}": ${res.message || "Erro ao salvar"}`,
                );
              }
            } catch (err) {
              variationErrors.push(
                `"${variation.name}": ${getErrorMessage(err, "Erro ao salvar")}`,
              );
            }
          }

          if (variationErrors.length > 0) {
            toast.error(
              `Prato criado, mas houve erro ao salvar tamanho(s): ${variationErrors.join("; ")}`,
            );
          }

          queryClient.invalidateQueries({
            queryKey: ["product-variations", productId],
          });
          queryClient.invalidateQueries({
            queryKey: ["product-variations", "public"],
          });
        }

        if (addOnsToSave.length > 0) {
          const addOnErrors: string[] = [];
          for (const addOn of addOnsToSave) {
            try {
              const res = await apiService.productAddOns.create(productId, {
                name: addOn.name,
                priceModifier: addOn.priceModifier,
                isAvailable: addOn.isAvailable,
              });
              if (!res.success) {
                addOnErrors.push(
                  `"${addOn.name}": ${res.message || "Erro ao salvar"}`,
                );
              }
            } catch (err) {
              addOnErrors.push(
                `"${addOn.name}": ${getErrorMessage(err, "Erro ao salvar")}`,
              );
            }
          }

          if (addOnErrors.length > 0) {
            toast.error(
              `Prato criado, mas houve erro ao salvar complemento(s): ${addOnErrors.join("; ")}`,
            );
          }

          queryClient.invalidateQueries({
            queryKey: ["product-add-ons", productId],
          });
          queryClient.invalidateQueries({
            queryKey: ["product-add-ons", "public"],
          });
        }
      }

      handleCloseModal();
    } catch (error) {
      console.error("Erro detalhado ao salvar produto:", error);
      toast.error(getErrorMessage(error, "Erro ao salvar produto"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDelete = (product: Product) => {
    setDeleteTarget(product);
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    const targetId = deleteTarget.id;

    setRemovedProductIds((prev) =>
      prev.includes(targetId) ? prev : [...prev, targetId],
    );
    setCreatedProducts((prev) => prev.filter((item) => item.id !== targetId));
    queryClient.setQueryData(productsQueryKey, (old: Product[] = []) =>
      (Array.isArray(old) ? old : []).filter((item) => item.id !== targetId),
    );
    setDeleteTarget(null);

    setIsDeleting(true);
    try {
      for (const link of deleteTarget.productCategories || []) {
        const productId = link.productId || targetId;
        const categoryId = link.categoryId || link.category?.id;
        if (!productId || !categoryId) continue;
        try {
          await apiService.unlinkCategoryFromProduct(productId, categoryId);
        } catch (e) {
          console.warn("Erro ao desvincular categoria:", link.id, e);
        }
      }

      for (const img of deleteTarget.imageURL || []) {
        if (!img?.id || img.id.startsWith("local-")) continue;
        try {
          await apiService.deleteProductImage(targetId, img.id);
        } catch (e) {
          console.warn("Erro ao remover imagem:", img.id, e);
        }
      }

      await queryClient.cancelQueries({ queryKey: productsQueryKey });
      await deleteProduct.mutateAsync(targetId);
    } catch (error) {
      // O useDeleteProduct já mostra o erro - um toast aqui duplicava a
      // mensagem.
      console.error("Erro ao deletar produto:", error);
      setRemovedProductIds((prev) => prev.filter((id) => id !== targetId));
      // O prato já saiu do cache no início (remoção otimista) e continua no
      // servidor: sem recarregar, sumia da lista mesmo com a exclusão
      // recusada. Recarrega em vez de restaurar a cópia antiga porque
      // categoria e fotos podem já ter sido removidas acima.
      queryClient.invalidateQueries({ queryKey: productsQueryKey });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteProductImage = async (
    productId: string,
    imageId: string,
  ) => {
    try {
      const response = await apiService.deleteProductImage(productId, imageId);
      if (!response.success) {
        toast.error(response.message || "Erro ao remover imagem");
        return;
      }

      setEditingProduct((prev) =>
        prev && prev.id === productId
          ? {
              ...prev,
              imageURL: prev.imageURL?.filter((img) => img.id !== imageId),
            }
          : prev,
      );

      queryClient.setQueryData(productsQueryKey, (old: Product[] = []) =>
        (Array.isArray(old) ? old : []).map((item) =>
          item.id === productId
            ? {
                ...item,
                imageURL: item.imageURL?.filter((img) => img.id !== imageId),
              }
            : item,
        ),
      );

      toast.success("Imagem removida");
    } catch (error) {
      console.error("Erro ao remover imagem:", error);
      toast.error("Erro ao remover imagem");
    }
  };

  const handleToggleAvailability = async (product: Product) => {
    const previousProducts = queryClient.getQueryData(productsQueryKey);

    queryClient.setQueryData(productsQueryKey, (old: Product[] = []) =>
      (Array.isArray(old) ? old : []).map((item) =>
        item.id === product.id
          ? { ...item, isAvailable: !item.isAvailable }
          : item,
      ),
    );

    try {
      await updateProduct.mutateAsync({
        id: product.id,
        data: {
          name: product.name,
          description: product.description,
          costPrice: product.costPrice,
          salePrice: product.salePrice,
          isAvailable: !product.isAvailable,
          stockQuantity: product.stockQuantity || 0,
        },
      });
    } catch (error) {
      queryClient.setQueryData(productsQueryKey, previousProducts);
      console.error("Erro ao atualizar disponibilidade:", error);
      toast.error("Erro ao atualizar disponibilidade");
    }
  };

  return {
    products: filteredProducts,
    allProducts: products,
    categories,
    companyId,
    isLoading: loadingProducts || loadingCategories,
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
    isCreatingCategory,
    setIsCreatingCategory,
    newCategoryName,
    setNewCategoryName,
    isSaving,
    isDeleting,
    deleteTarget,
    activeTab,
    setActiveTab,
    draftVariations,
    setDraftVariations,
    draftAddOns,
    setDraftAddOns,
  };
};
