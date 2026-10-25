import { apiService, type Category, type Product } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "./use-categories";
import { useCompanyProducts } from "./use-products";

/**
 * Quem pode excluir categoria. O DELETE /categories/:id é Deny pra manager
 * no backend (RBAC 5.4), embora ele crie e edite - mostrar o botão pra ele
 * só levava a um 403. Lista de quem pode, e não de quem não pode, pra role
 * nova não herdar o botão por omissão.
 */
const CATEGORY_DELETE_ROLES = ["owner", "admin"];

interface CategoryFormData {
  name: string;
  description: string;
}

/** Estado derivado de cada categoria no app (LDMF-442). */
interface CategoryStatus {
  /** Quantos produtos da empresa estão ligados a esta categoria. */
  count: number;
  /** Ativa = tem ao menos um produto disponível (logo, aparece no app). */
  active: boolean;
}

// "Esconder categoria" não existe no back (só name/description na categoria),
// então a feature é deixar todos os produtos indisponíveis. Pra religar
// restaurando o estado anterior (opção B), guardamos por empresa quais
// produtos estavam disponíveis antes de esconder. Sem esse registro, religar
// cai no fallback A (libera todos). Chave por companyId pra não vazar entre
// contas no mesmo navegador.
const CATEGORY_AVAILABILITY_STORAGE_PREFIX = "bear:category-availability:";

type AvailabilitySnapshot = Record<string, string[]>;

function readAvailabilitySnapshot(companyId: string): AvailabilitySnapshot {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      `${CATEGORY_AVAILABILITY_STORAGE_PREFIX}${companyId}`,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as AvailabilitySnapshot)
      : {};
  } catch {
    return {};
  }
}

function writeAvailabilitySnapshot(
  companyId: string,
  snapshot: AvailabilitySnapshot,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${CATEGORY_AVAILABILITY_STORAGE_PREFIX}${companyId}`,
      JSON.stringify(snapshot),
    );
  } catch {
    // Storage cheio ou indisponível: segue sem registro. Ao religar, a
    // categoria cai no fallback A (libera todos os itens).
  }
}

export const useCategoryManagement = () => {
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { user } = useAuthStore();
  const canDelete = CATEGORY_DELETE_ROLES.includes(user?.role ?? "");

  const queryClient = useQueryClient();
  const companyId = user?.companyId || user?.id || null;
  const { data: products = [] } = useCompanyProducts(companyId);
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(
    null,
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    description: "",
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Produtos agrupados por categoria (um produto pode estar em mais de uma).
  // É a base tanto do estado derivado quanto do bulk de disponibilidade.
  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of products) {
      for (const link of product.productCategories ?? []) {
        const list = map.get(link.categoryId);
        if (list) {
          list.push(product);
        } else {
          map.set(link.categoryId, [product]);
        }
      }
    }
    return map;
  }, [products]);

  // Estado derivado por categoria: quantidade de itens e se está ativa
  // (ativa = algum item disponível, logo visível no app).
  const categoryStatusMap = useMemo(() => {
    const map: Record<string, CategoryStatus> = {};
    productsByCategory.forEach((list, categoryId) => {
      map[categoryId] = {
        count: list.length,
        active: list.some((product) => product.isAvailable !== false),
      };
    });
    return map;
  }, [productsByCategory]);

  // Só dá pra derivar status depois que a lista de produtos chega. Antes
  // disso a tela evita afirmar "oculta" sem dado.
  const hasCategoryProductData = products.length > 0;

  const filteredCategories = categories.filter(
    (category: Category) =>
      category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleOpenCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      description: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({
      name: "",
      description: "",
    });
  };

  const updateFormField = (field: keyof CategoryFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error("Nome da categoria é obrigatório");
      return false;
    }

    if (formData.name.trim().length < 3) {
      toast.error("Nome deve ter pelo menos 3 caracteres");
      return false;
    }

    if (formData.name.trim().length > 50) {
      toast.error("Nome da categoria deve ter no máximo 50 caracteres");
      return false;
    }

    if (formData.description.trim().length > 200) {
      toast.error("Descrição deve ter no máximo 200 caracteres");
      return false;
    }

    return true;
  };

  const handleSaveCategory = async () => {
    if (!validateForm()) return;

    try {
      const categoryData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
      };

      if (editingCategory) {
        await updateCategory.mutateAsync({
          id: editingCategory.id,
          data: categoryData,
        });
      } else {
        await createCategory.mutateAsync(categoryData);
      }

      handleCloseModal();
    } catch (error) {
      console.error("Erro ao salvar categoria:", error);
    }
  };

  const handleRequestDelete = (category: Category) => {
    if (!canDelete) return;
    setDeleteTarget(category);
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !canDelete) return;

    try {
      await deleteCategory.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Erro ao deletar categoria:", error);
    }
  };

  // Liga/desliga a categoria no app marcando os produtos dela como
  // (in)disponíveis em lote. Não usamos o toast por produto do useUpdateProduct
  // de propósito: num bulk ele empilharia um toast por item. Chamamos a API
  // direto e consolidamos o cache e o aviso aqui.
  const handleToggleCategoryActive = async (category: Category) => {
    if (!companyId || togglingCategoryId) return;

    const list = productsByCategory.get(category.id) ?? [];
    if (list.length === 0) {
      toast.error("Esta categoria não tem itens para exibir no app.");
      return;
    }

    const currentlyActive = list.some(
      (product) => product.isAvailable !== false,
    );
    const nextAvailable = !currentlyActive;

    // Define quais produtos realmente mudam e, ao esconder, registra o estado
    // atual pra conseguir restaurar na hora de religar (opção B).
    let targets: Product[];
    if (currentlyActive) {
      const snapshot = readAvailabilitySnapshot(companyId);
      snapshot[category.id] = list
        .filter((product) => product.isAvailable !== false)
        .map((product) => product.id);
      writeAvailabilitySnapshot(companyId, snapshot);

      targets = list.filter((product) => product.isAvailable !== false);
    } else {
      const snapshot = readAvailabilitySnapshot(companyId);
      const savedIds = snapshot[category.id];
      const hasSaved = Array.isArray(savedIds) && savedIds.length > 0;

      // B: religa só os que estavam disponíveis antes. Fallback A (sem
      // registro): libera todos os itens indisponíveis da categoria.
      targets = list.filter((product) => {
        if (product.isAvailable !== false) return false;
        return hasSaved ? savedIds.includes(product.id) : true;
      });

      if (category.id in snapshot) {
        delete snapshot[category.id];
        writeAvailabilitySnapshot(companyId, snapshot);
      }
    }

    if (targets.length === 0) return;

    setTogglingCategoryId(category.id);
    try {
      const outcomes = await Promise.all(
        targets.map(async (product) => {
          try {
            const response = await apiService.updateProduct(product.id, {
              name: product.name,
              description: product.description,
              costPrice: product.costPrice,
              salePrice: product.salePrice,
              isAvailable: nextAvailable,
              stockQuantity: product.stockQuantity || 0,
            });
            return { id: product.id, ok: !!response.success };
          } catch {
            return { id: product.id, ok: false };
          }
        }),
      );

      const succeededIds = new Set(
        outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.id),
      );

      // Reflete no cache só o que gravou de verdade, pra o estado derivado
      // acompanhar inclusive uma falha parcial.
      if (succeededIds.size > 0) {
        queryClient.setQueriesData(
          { queryKey: ["products", "company"] },
          (old: unknown) => {
            const current = Array.isArray(old) ? (old as Product[]) : [];
            return current.map((item) =>
              succeededIds.has(item.id)
                ? { ...item, isAvailable: nextAvailable }
                : item,
            );
          },
        );
      }

      const failed = targets.length - succeededIds.size;
      if (failed === 0) {
        toast.success(
          currentlyActive
            ? `"${category.name}" escondida do app`
            : `"${category.name}" visível no app`,
          { id: "category-visibility" },
        );
      } else if (succeededIds.size > 0) {
        toast.error(
          `Alguns itens de "${category.name}" não foram atualizados (${failed} de ${targets.length}). Tente de novo.`,
        );
      } else {
        toast.error(
          `Não foi possível atualizar "${category.name}". Tente de novo.`,
        );
      }
    } finally {
      setTogglingCategoryId(null);
    }
  };

  return {
    categories: filteredCategories,
    allCategories: categories,
    isLoading,

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
    isSaving: createCategory.isPending || updateCategory.isPending,
    isDeleting: deleteCategory.isPending,

    categoryStatusMap,
    hasCategoryProductData,
    togglingCategoryId,
    handleToggleCategoryActive,
  };
};
