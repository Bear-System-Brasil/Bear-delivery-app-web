import {
  apiService,
  getBirthDateApiError,
  type UpdateUserRequest,
} from "@/services/api";
import {
  restorePendingDefaultAddress,
  setDefaultAddress,
} from "@/lib/default-address";
import { useAuthStore } from "@/stores";
import { formatDate, getErrorMessage, onlyNumbers } from "@/utils";
import { isCompanyAdminRole } from "@/utils/role-helpers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAddressEditor } from "./use-address-editor";
import { useUserAddresses } from "./use-addresses";
import { useProfile } from "./use-api";
import {
  AddressFormData,
  ProfileFormData,
  useProfileForm,
} from "./use-form-validation";
import { useToggle } from "./use-toggle";

interface Address extends AddressFormData {
  id: string;
  type?: string;
}

/**
 * Hook para gerenciar perfil do usuário (cliente)
 * Inclui: dados pessoais, foto, endereços
 */
export const useProfileManagement = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, updateUser, _hasHydrated } = useAuthStore();
  const { updateProfile } = useProfile();

  const [isMounted, setIsMounted] = useState(false);

  // Address state - useUserAddresses já é cacheado (staleTime 5min) e
  // compartilhado com checkout/company-profile, então editar um endereço
  // aqui reflete lá sem precisar de F5, e vice-versa.
  const { data: rawAddresses = [], isLoading: isLoadingAddresses } =
    useUserAddresses();
  const addresses = useMemo<Address[]>(
    () =>
      rawAddresses.map((addr) => ({
        id: addr.id,
        type: "Endereço",
        street: addr.street || "",
        number: String(addr.number ?? ""),
        complement: addr.complement || "",
        neighborhood: addr.neighborhood || "",
        longitude: addr.longitude ?? undefined,
        latitude: addr.latitude ?? undefined,
        city: addr.city || "",
        state: addr.state || "",
        zipCode: addr.zipCode || "",
        isDefault: addr.isDefault ?? false,
      })),
    [rawAddresses],
  );
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editingAddressOriginalComplement, setEditingAddressOriginalComplement] =
    useState<string>("");

  // Form management with validation
  const profileForm = useProfileForm({
    name: user?.name || "",
    email: user?.email || "",
    cpf: user?.cpf || "",
    phone: user?.phone || "",
    birthDate: formatDate(user?.birthDate ?? ""),
  });

  // UI state management with custom hooks
  const editingState = useToggle();
  const addingAddressState = useToggle();

  // Formulário, CEP, campos e pino do modal de endereço (núcleo comum com o
  // perfil da loja).
  const addressEditor = useAddressEditor({
    enabled: addingAddressState.isOpen,
  });
  const { addressForm } = addressEditor;

  // Se o cliente não tem nenhum endereço padrão cadastrado, o próximo endereço criado
  // deve vir com a opção de padrão marcada por conveniência e conformidade com entrega.
  useEffect(() => {
    if (addingAddressState.isOpen && !editingAddressId) {
      const hasDefault = Boolean(
        (rawAddresses && rawAddresses.some((a) => a.isDefault)) ||
        (addresses && addresses.some((a) => a.isDefault)),
      );
      if (!hasDefault || (addresses?.length ?? 0) === 0) {
        addressForm.setValue("isDefault", true);
      }
    }
  }, [
    addingAddressState.isOpen,
    editingAddressId,
    rawAddresses,
    addresses,
    addressForm,
  ]);


  /**
   * Prevent SSR issues
   */
  useEffect(() => {
    setIsMounted(true);
  }, []);

  /**
   * Redireciona quem não devia estar nessa tela. Espera o Zustand persist
   * hidratar - antes disso isAuthenticated começa em `false` mesmo pra quem
   * tá logado, e esse redirect rodava cedo demais a cada F5 (correndo em
   * paralelo com o efeito equivalente do ProfileWrapper).
   */
  useEffect(() => {
    if (!isMounted || !_hasHydrated) return;

    if (!isAuthenticated) {
      router.push("/?auth=required");
      return;
    }

    // Só quem edita o cadastro da empresa é levado pra lá; staff como
    // financial e manager usa /profile mesmo.
    if (isCompanyAdminRole(user?.role)) {
      router.push("/company-profile");
    }
  }, [isMounted, _hasHydrated, isAuthenticated, user?.role, router]);

  /**
   * Dados da conta autenticada (GET /user/me), cacheados - antes era um
   * useEffect cru que refazia essa chamada toda vez que /profile montava,
   * mesmo revisitando a tela poucos segundos depois.
   */
  const {
    data: profileData,
    isLoading: isLoadingProfile,
    error: profileQueryError,
  } = useQuery({
    queryKey: ["profile", "me", user?.id],
    queryFn: async () => {
      const response = await apiService.getMe();
      if (!response.success || !response.data) {
        throw new Error(response.message || "Erro ao carregar perfil");
      }
      return response.data;
    },
    enabled:
      isMounted &&
      _hasHydrated &&
      isAuthenticated &&
      !isCompanyAdminRole(user?.role),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const profileError = profileQueryError
    ? (profileQueryError as Error).message
    : null;

  useEffect(() => {
    if (profileData) updateUser(profileData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData]);

  /**
   * O useForm guarda os defaultValues do primeiro render. No F5 esse render
   * acontece antes do persist hidratar o usuário, e o formulário ficava vazio
   * até sair e voltar da tela. Reidrata sempre que os dados do usuário mudam,
   * menos durante a edição, para não apagar o que está sendo digitado.
   */
  useEffect(() => {
    if (!user || editingState.isOpen) return;

    profileForm.reset({
      name: user.name || "",
      email: user.email || "",
      cpf: user.cpf || "",
      phone: user.phone || "",
      birthDate: formatDate(user.birthDate ?? ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.name,
    user?.email,
    user?.cpf,
    user?.phone,
    user?.birthDate,
    editingState.isOpen,
  ]);

  /**
   * O checkout promove o endereço do pedido a padrão durante a finalização e
   * devolve o anterior logo depois (ver src/lib/default-address.ts). Se
   * aquele pedido foi interrompido no meio, a troca ficou de pé - e é nesta
   * tela que o cliente veria o padrão errado. Desfaz aqui também.
   */
  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    restorePendingDefaultAddress(user.id).then((restored) => {
      if (restored && active) {
        queryClient.invalidateQueries({
          queryKey: ["addresses", "user", user.id],
        });
      }
    });

    return () => {
      active = false;
    };
  }, [user?.id, queryClient]);

  /**
   * Salvar alterações do perfil
   */
  const handleSaveProfile = async (data: ProfileFormData) => {
    if (!user?.id) return;

    try {
      const currentPhone = onlyNumbers(user.phone || "");
      const newPhone = onlyNumbers(data.phone || "");
      const phoneChanged = Boolean(newPhone && newPhone !== currentPhone);

      const currentCpf = onlyNumbers(user.cpf || "");
      const newCpf = onlyNumbers(data.cpf || "");
      const cpfChanged = Boolean(newCpf && newCpf !== currentCpf);

      const payload: Partial<UpdateUserRequest> = {
        name: data.name,
        ...(phoneChanged ? { phone: newPhone } : {}),
        ...(cpfChanged ? { cpf: newCpf } : {}),
        ...(data.birthDate ? { birthDate: data.birthDate } : {}),
      };

      await updateProfile.mutateAsync(payload);
      // O número do CPF não fica no store (persistido no localStorage); só
      // o indicador de que a conta tem CPF (LDMF-362).
      const { cpf: _cpf, ...profileData } = data;
      updateUser({
        ...user,
        ...profileData,
        ...(cpfChanged ? { hasCpf: true } : {}),
      });
      editingState.close();
      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      const birthDateError =
        typeof error === "object" && error !== null
          ? getBirthDateApiError(error)
          : null;
      if (birthDateError) {
        profileForm.setError("birthDate", { message: birthDateError });
        toast.error(birthDateError);
        return;
      }
      toast.error(getErrorMessage(error, "Erro ao atualizar perfil"));
    }
  };

  /**
   * Cancelar edição do perfil
   */
  const handleCancelEdit = () => {
    profileForm.reset();
    editingState.close();
  };

  /**
   * Atualizar foto do perfil
   */
  const handleUpdatePhoto = (url: string) => {
    if (!user) return;
    updateUser({ ...user, photoUrl: url });
  };

  /**
   * Abrir modal para editar endereço
   */
  const handleEditAddress = (address: Address) => {
    addressEditor.loadAddress(address);
    setEditingAddressId(address.id);
    setEditingAddressOriginalComplement(address.complement || "");
    addingAddressState.open();
  };

  /**
   * Salvar endereço (cria ou atualiza)
   */
  const handleAddAddress = async (data: AddressFormData) => {
    // No PATCH (diferente do POST), complement exige mínimo de 5 caracteres
    // quando preenchido (ver adress.md). Endereços antigos criados via POST
    // podem ter complemento curto (ex: "301") - só bloqueamos se o usuário
    // de fato digitou um valor novo inválido; se não mexeu no campo, o
    // complemento herdado é omitido do PATCH para não travar o resto do form.
    const trimmedComplement = data.complement?.trim() ?? "";
    const complementUnchanged =
      trimmedComplement === editingAddressOriginalComplement.trim();

    if (
      editingAddressId &&
      trimmedComplement.length > 0 &&
      trimmedComplement.length < 5 &&
      !complementUnchanged
    ) {
      toast.error("Complemento deve ter pelo menos 5 caracteres (ou ficar vazio)");
      return;
    }

    const shouldOmitComplement =
      editingAddressId &&
      complementUnchanged &&
      trimmedComplement.length > 0 &&
      trimmedComplement.length < 5;

    const pinCoords = addressEditor.getPinForSave(data);
    if (!pinCoords) return;

    setIsSavingAddress(true);
    try {
      const hasDefault = Boolean(
        (rawAddresses && rawAddresses.some((addr) => addr.isDefault)) ||
        (addresses && addresses.some((addr) => addr.isDefault)),
      );
      const shouldBeDefault = editingAddressId
        ? (data.isDefault ?? false)
        : data.isDefault !== undefined
          ? Boolean(data.isDefault)
          : !hasDefault || (addresses?.length ?? 0) === 0;

      const payload = {
        street: data.street,
        number: data.number,
        complement: shouldOmitComplement ? undefined : data.complement || undefined,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        longitude: pinCoords.lng,
        latitude: pinCoords.lat,
        zipCode: onlyNumbers(data.zipCode),
        isDefault: shouldBeDefault,
      };

      let response;

      if (editingAddressId) {
        // UPDATE
        response = await apiService.address.updateUserAddress(
          editingAddressId,
          payload,
        );
      } else {
        // CREATE
        response = await apiService.address.createUserAddress(payload);
      }

      // O backend não desmarca o padrão anterior sozinho (ver adress.md).
      // Isto rodava ANTES do salvamento: quando o PATCH do endereço falhava
      // - e ele falha por regras que nada têm a ver com o padrão, como o
      // mínimo de 5 caracteres no complemento - o cliente ficava sem padrão
      // nenhum, e sem padrão o finalizar de uma entrega quebra. Agora só
      // desmarca depois que o endereço escolhido virou padrão de fato: um
      // salvamento que falha não mexe em nada.
      let failedToUnsetDefault = false;

      if (payload.isDefault && response.success) {
        const savedId = editingAddressId ?? response.data?.id;

        if (savedId) {
          const currentAddresses = await apiService.address.getUserAddresses();
          const backendAddresses =
            currentAddresses.success && Array.isArray(currentAddresses.data)
              ? currentAddresses.data
              : [];

          const { demotedAll } = await setDefaultAddress(
            backendAddresses,
            savedId,
          );
          failedToUnsetDefault = !demotedAll;
        }
      }

      if (response.success) {
        queryClient.invalidateQueries({
          queryKey: ["addresses", "user", user?.id],
        });
        addressEditor.resetEditor();
        setEditingAddressId(null);
        setEditingAddressOriginalComplement("");
        addingAddressState.close();

        toast.success(
          editingAddressId
            ? "Endereço atualizado com sucesso!"
            : "Endereço adicionado com sucesso!",
        );

        if (failedToUnsetDefault) {
          toast.warning(
            "Não conseguimos desmarcar todos os endereços padrão antigos. Confira sua lista de endereços.",
          );
        }
      } else {
        toast.error(
          response.message ||
            (editingAddressId
              ? "Erro ao atualizar endereço"
              : "Erro ao adicionar endereço"),
        );
      }
    } catch (error) {
      toast.error(
        editingAddressId
          ? "Erro ao atualizar endereço"
          : "Erro ao adicionar endereço",
      );
    } finally {
      setIsSavingAddress(false);
    }
  };

  /**
   * Fechar modal de endereço
   */
  const handleCloseAddressModal = () => {
    addressEditor.resetEditor();
    setEditingAddressId(null);
    setEditingAddressOriginalComplement("");
    addingAddressState.close();
  };

  /**
   * Marcar um endereço como padrão direto da lista.
   *
   * Até aqui, o único jeito de escolher o padrão era abrir "Editar", marcar
   * a caixa e salvar o endereço inteiro de novo - e o PATCH do endereço tem
   * regras próprias (complemento com mínimo de 5 caracteres, latitude e
   * longitude como número) que fazem o salvamento falhar por motivos que não
   * têm nada a ver com o padrão. Da lista sai um PATCH só, com um campo só.
   */
  const [settingDefaultAddressId, setSettingDefaultAddressId] = useState<
    string | null
  >(null);

  const handleSetDefaultAddress = async (addressId: string) => {
    setSettingDefaultAddressId(addressId);

    try {
      const { promoted, demotedAll, message } = await setDefaultAddress(
        rawAddresses,
        addressId,
      );

      if (!promoted) {
        // A razão do backend vale mais que uma mensagem genérica: é ela que
        // diz se o problema é a regra dele ou o que mandamos.
        toast.error(
          message
            ? `Não foi possível definir este endereço como padrão: ${message}`
            : "Não foi possível definir este endereço como padrão.",
        );
        return;
      }

      queryClient.invalidateQueries({
        queryKey: ["addresses", "user", user?.id],
      });

      if (demotedAll) {
        toast.success("Endereço padrão atualizado!");
      } else {
        // Dois padrões ao mesmo tempo fazem o backend escolher sozinho o
        // endereço da entrega - o cliente precisa saber que ficou assim.
        toast.warning(
          message
            ? `Endereço marcado como padrão, mas não conseguimos desmarcar o anterior: ${message}`
            : "Endereço marcado como padrão, mas não conseguimos desmarcar o anterior. Confira sua lista de endereços.",
        );
      }
    } finally {
      setSettingDefaultAddressId(null);
    }
  };

  /**
   * Deletar endereço
   */
  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm("Tem certeza que deseja excluir este endereço?")) return;

    try {
      const response = await apiService.address.deleteUserAddress(addressId);
      if (response.success) {
        queryClient.invalidateQueries({
          queryKey: ["addresses", "user", user?.id],
        });
        toast.success("Endereço excluído com sucesso!");
      } else {
        toast.error(response.message || "Erro ao excluir endereço");
      }
    } catch (error) {
      console.error("Error deleting address:", error);
      toast.error("Erro ao excluir endereço");
    }
  };

  return {
    // Auth & Loading
    user,
    isMounted,
    isAuthenticated,
    hasHydrated: _hasHydrated,
    isLoadingProfile,
    profileError,
    // Profile
    profileForm,
    editingState,
    updateProfile,
    handleSaveProfile,
    handleCancelEdit,
    handleUpdatePhoto,
    // Addresses
    addresses,
    isLoadingAddresses,
    addressForm,
    addingAddressState,
    isSavingAddress,
    handleAddAddress,
    handleSetDefaultAddress,
    settingDefaultAddressId,
    handleCloseAddressModal,
    handleDeleteAddress,
    handleEditAddress,
    editingAddressId,
    addressCoords: addressEditor.addressCoords,
    applyCoords: addressEditor.applyCoords,
    neighborhoodOptions: addressEditor.neighborhoodOptions,
    stateOptions: addressEditor.stateOptions,
    cityOptions: addressEditor.cityOptions,
    isLoadingCities: addressEditor.isLoadingCities,
    citiesError: addressEditor.citiesError,
    fieldLocks: addressEditor.fieldLocks,
    changeState: addressEditor.changeState,
    changeCity: addressEditor.changeCity,
    changeNeighborhood: addressEditor.changeNeighborhood,
    isOtherNeighborhood: addressEditor.isOtherNeighborhood,
    selectOtherNeighborhood: addressEditor.selectOtherNeighborhood,
    changeOtherNeighborhood: addressEditor.changeOtherNeighborhood,
    isLocatingPin: addressEditor.isLocatingPin,
    isSearchingAddress: addressEditor.isSearchingAddress,
    addressNotFound: addressEditor.addressNotFound,
    pinZoom: addressEditor.pinZoom,
    pinRecenterKey: addressEditor.pinRecenterKey,
    // CEP
    isLoadingCep: addressEditor.isLoadingCep,
    formatCep: addressEditor.formatCep,
    watchedZipCode: addressEditor.watchedZipCode,
  };
};
