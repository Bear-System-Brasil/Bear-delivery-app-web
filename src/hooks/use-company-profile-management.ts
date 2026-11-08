import { apiService, type Address, type Specialty } from "@/services/api";
import { PASSWORD_CHANGE_UNAVAILABLE } from "@/constants/password-change";
import { unsetDefaultAddress } from "@/lib/default-address";
import { useAuthStore } from "@/stores";
import { getErrorMessage, onlyNumbers } from "@/utils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAddressEditor } from "./use-address-editor";
import type { AddressFormData } from "./use-form-validation";

/** Teto de tipos de restaurante por empresa. O back não garante o limite
 *  (não documentado); quem segura em 3 é o front (LDMF-395). */
export const MAX_SPECIALTIES = 3;

/**
 * complement/reference no formulário sempre são string ("" quando vazio),
 * mas o backend trata "" como valor presente - no update, isso viola o
 * mínimo de 5 caracteres (ver adress.md) e o PATCH cai em 400. Só a
 * ausência do campo (undefined, nunca enviado) satisfaz @IsOptional().
 */
function sanitizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface CompanyFormData {
  tradeName: string;
  legalName: string;
  cnpj: string;
  email: string;
  phone: string;
  logo_url: string;
  cover_url: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Hook para gerenciar perfil completo da empresa
 * Inclui: dados da empresa, endereços, senha
 */
export const useCompanyProfileManagement = () => {
  const router = useRouter();
  const { user, isAuthenticated, updateUser, _hasHydrated } = useAuthStore();

  // Company profile state
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [companySpecialties, setCompanySpecialties] = useState<Specialty[]>(
    [],
  );
  // Rascunho dos 3 campos de tipo de restaurante. "" = campo vazio. Só vira
  // chamada ao back no "Salvar", como as outras seções do Perfil (LDMF-395).
  const [specialtyDraft, setSpecialtyDraft] = useState<string[]>(["", "", ""]);
  const [isSavingSpecialty, setIsSavingSpecialty] = useState(false);

  const [formData, setFormData] = useState<CompanyFormData>({
    tradeName: "",
    legalName: "",
    cnpj: "",
    email: "",
    phone: "",
    logo_url: "",
    cover_url: "",
  });

  const [originalFormData, setOriginalFormData] = useState<CompanyFormData>({
    tradeName: "",
    legalName: "",
    cnpj: "",
    email: "",
    phone: "",
    logo_url: "",
    cover_url: "",
  });

  // Address management state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editingAddressOriginal, setEditingAddressOriginal] = useState<{
    complement: string;
    reference: string;
  }>({ complement: "", reference: "" });

  // Mesmo modal do perfil do cliente: CEP, campos em ordem e pino (LDMF-263).
  const addressEditor = useAddressEditor({ enabled: isAddressModalOpen });

  // A loja tem um único endereço (LDMF-263): o padrão, ou o primeiro ativo
  // se nenhum estiver marcado. Enquanto o filtro por raio do back usar o
  // primeiro endereço com coordenada (LDMF-256), outro endereço só atrapalha.
  const storeAddress = useMemo<Address | null>(
    () => addresses.find((addr) => addr.isDefault) ?? addresses[0] ?? null,
    [addresses],
  );

  // Password change state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  // SSR protection
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  /**
   * Carrega dados do perfil da empresa
   */
  useEffect(() => {
    // Espera o Zustand persist hidratar a sessão do localStorage - antes
    // disso isAuthenticated começa em `false` mesmo pra quem tá logado, e
    // esse redirect rodava cedo demais a cada F5 em /company-profile.
    if (!_hasHydrated) return;

    const fetchCompanyProfile = async () => {
      if (!isAuthenticated || !user?.id) {
        router.push("/?openAuth=true");
        return null;
      }

      const companyIdToUse = user.companyId || user.id;

      setIsLoadingProfile(true);
      setProfileError(null);

      try {
        const response = await apiService.companies.getById(companyIdToUse);
        if (response.success && response.data) {
          const company = response.data;

          // Preencher dados completos da empresa a partir da resposta da API
          const companyData = {
            tradeName: company.tradeName || "",
            legalName: company.legalName || "",
            cnpj: company.cnpj || "",
            email: company.email || "",
            phone: company.phone || "",
            logo_url: company.logo_url || "",
            cover_url: company.cover_url || "",
          };

          if (process.env.NODE_ENV !== "production") {
            console.log(companyData);
          }

          setFormData(companyData);
          setOriginalFormData(companyData);
          setIsOpen(company.isOpen ?? true);
          // Populate specialty from real company data. A doc do back devolve
          // `speciality`; o resto do front lê `specialty`. Lemos as duas
          // grafias até o back confirmar qual é a oficial (LDMF-395).
          const specs =
            company.specialty ??
            (company as { speciality?: Specialty[] }).speciality ??
            [];
          setCompanySpecialties(specs);
          setSpecialtyDraft([0, 1, 2].map((i) => specs[i]?.id ?? ""));
          if (specs.length > 0) {
            setSelectedCategory(specs[0].id);
          }
        } else {
          setProfileError(response.message || "Erro ao carregar perfil");
        }
      } catch (_error) {
        setProfileError("Erro de conexão ao carregar perfil");
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchCompanyProfile();
  }, [_hasHydrated, isAuthenticated, user?.id, user?.companyId, router]);

  /**
   * Função para buscar endereços da empresa (reutilizável)
   */
  const fetchAddresses = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;

    setIsLoadingAddresses(true);
    try {
      const response = await apiService.address.getCompanyAddresses();

      if (response.success && response.data) {
        const addressesData = Array.isArray(response.data) ? response.data : [];
        // DELETE agora é soft delete (isActive: false) - filtra pra não
        // reaparecer endereço "removido" depois de um fetch.
        setAddresses(addressesData.filter((addr) => addr.isActive !== false));
      } else if (!response.success) {
        setAddresses([]);
      }
    } catch (_error) {
      setAddresses([]);
    } finally {
      setIsLoadingAddresses(false);
    }
  }, [isAuthenticated, user?.id]);

  /**
   * Carrega endereços da empresa
   */
  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  /**
   * Cancela edição e restaura dados originais
   */
  const handleCancelEdit = () => {
    setFormData({ ...originalFormData });
    setIsEditing(false);
  };

  /**
   * Salva perfil da empresa
   */
  /**
   * Salva a especialidade (tipo) do restaurante via API
   */
  const handleSaveSpecialty = async (newSpecialtyId: string) => {
    if (!newSpecialtyId || !user?.id) return;

    try {
      setIsSavingSpecialty(true);

      // Remove old specialty if exists
      let failedToRemoveOld = false;
      if (companySpecialties.length > 0) {
        for (const spec of companySpecialties) {
          try {
            const removeResponse =
              await apiService.removeSpecialtyFromCompany(spec.id);
            if (!removeResponse.success) failedToRemoveOld = true;
          } catch (e) {
            console.error("Erro ao remover especialidade antiga:", e);
            failedToRemoveOld = true;
          }
        }
      }

      // Assign new specialty
      const response =
        await apiService.assignSpecialtyToCompany(newSpecialtyId);
      if (response.success) {
        setSelectedCategory(newSpecialtyId);
        // Refresh company specialties
        const companyResponse = await apiService.companies.getById(
          user.companyId || user.id,
        );
        if (companyResponse.success && companyResponse.data) {
          const specs = companyResponse.data.specialty || [];
          setCompanySpecialties(specs);
        }
        toast.success("Tipo de restaurante atualizado!");
        if (failedToRemoveOld) {
          toast.warning(
            "Não conseguimos remover o tipo antigo - a loja pode ficar com mais de um tipo cadastrado.",
          );
        }
      } else {
        toast.error("Erro ao atualizar tipo de restaurante");
      }
    } catch (error) {
      console.error("Erro ao salvar especialidade:", error);
      toast.error("Erro ao atualizar tipo de restaurante");
    } finally {
      setIsSavingSpecialty(false);
    }
  };

  // ── Múltiplas especialidades (até 3) — LDMF-395 ───────────────────────────
  // handleSaveSpecialty acima é da escolha única antiga. Aqui o usuário monta
  // os 3 campos num rascunho e grava tudo no "Salvar" (botão da seção, como as
  // outras do Perfil). O diff vira os DELETE/POST na hora de salvar.
  const persistedSpecialtyIds = companySpecialties.map((s) => s.id);
  const draftSpecialtyIds = specialtyDraft.filter(Boolean);
  const hasSpecialtyChanges =
    draftSpecialtyIds.length !== persistedSpecialtyIds.length ||
    draftSpecialtyIds.some((id) => !persistedSpecialtyIds.includes(id));

  const setSpecialtySlot = (index: number, value: string) => {
    // Não deixa o mesmo tipo em dois campos.
    if (value && specialtyDraft.some((id, j) => j !== index && id === value)) {
      return;
    }
    setSpecialtyDraft((prev) =>
      prev.map((id, j) => (j === index ? value : id)),
    );
  };

  const discardSpecialtyChanges = () =>
    setSpecialtyDraft([0, 1, 2].map((i) => companySpecialties[i]?.id ?? ""));

  const refreshCompanySpecialties = async () => {
    if (!user?.id) return;
    const companyResponse = await apiService.companies.getById(
      user.companyId || user.id,
    );
    if (companyResponse.success && companyResponse.data) {
      const company = companyResponse.data as {
        specialty?: Specialty[];
        speciality?: Specialty[];
      };
      const specs = company.specialty ?? company.speciality ?? [];
      setCompanySpecialties(specs);
      setSpecialtyDraft([0, 1, 2].map((i) => specs[i]?.id ?? ""));
    }
  };

  const handleSaveSpecialties = async () => {
    if (isSavingSpecialty || !hasSpecialtyChanges) return;
    const toRemove = persistedSpecialtyIds.filter(
      (id) => !draftSpecialtyIds.includes(id),
    );
    const toAdd = draftSpecialtyIds.filter(
      (id) => !persistedSpecialtyIds.includes(id),
    );
    try {
      setIsSavingSpecialty(true);
      let failed = false;
      // Remove antes de adicionar: abre espaço caso o back imponha um
      // limite próprio.
      for (const id of toRemove) {
        const r = await apiService.removeSpecialtyFromCompany(id);
        if (!r.success) failed = true;
      }
      for (const id of toAdd) {
        const r = await apiService.assignSpecialtyToCompany(id);
        if (!r.success) failed = true;
      }
      // Relê do back e ressincroniza o rascunho com o que de fato gravou.
      await refreshCompanySpecialties();
      if (failed) {
        toast.warning(
          "Alguns tipos de restaurante não foram salvos. Confira a lista.",
        );
      } else {
        toast.success("Tipos de restaurante salvos!");
      }
    } catch (error) {
      console.error("Erro ao salvar especialidades:", error);
      toast.error("Erro ao salvar os tipos de restaurante");
      await refreshCompanySpecialties();
    } finally {
      setIsSavingSpecialty(false);
    }
  };

  const handleSaveProfile = async () => {
    // Validar campos obrigatórios
    const camposVazios = [];
    if (!formData.tradeName) camposVazios.push("Nome Fantasia");
    if (!formData.legalName) camposVazios.push("Razão Social");
    if (!formData.cnpj) camposVazios.push("CNPJ");
    if (!formData.email) camposVazios.push("E-mail");
    if (!formData.phone) camposVazios.push("Telefone");

    if (camposVazios.length > 0) {
      toast.error(
        `Preencha todos os campos obrigatórios: ${camposVazios.join(", ")}`,
      );
      return;
    }

    if (!user?.id) {
      toast.error("ID da empresa não encontrado");
      return;
    }

    try {
      setIsSaving(true);

      // Validar comprimento dos campos
      const tradeName = formData.tradeName?.trim() || "";
      if (tradeName.length < 5 || tradeName.length > 125) {
        toast.error("Nome Fantasia deve ter entre 5 e 125 caracteres");
        return;
      }

      const legalName = formData.legalName?.trim() || "";
      if (legalName.length < 5 || legalName.length > 125) {
        toast.error("Razão Social deve ter entre 5 e 125 caracteres");
        return;
      }

      const cnpj = onlyNumbers(formData.cnpj || "");
      if (cnpj.length !== 14) {
        toast.error("CNPJ deve ter 14 dígitos");
        return;
      }

      const email = formData.email?.trim().toLowerCase() || "";
      if (!email || !email.includes("@")) {
        toast.error("E-mail inválido");
        return;
      }

      const phone = onlyNumbers(formData.phone || "");
      if (phone.length !== 11) {
        toast.error("Telefone deve ter 11 dígitos");
        return;
      }

      const updateData: Record<string, string> = {
        tradeName,
        legalName,
        cnpj,
        email,
        phone,
      };

      // Incluir logo_url e cover_url se houver mudanças
      if (
        formData.logo_url &&
        formData.logo_url !== originalFormData.logo_url
      ) {
        updateData.logo_url = formData.logo_url;
      }

      if (
        formData.cover_url &&
        formData.cover_url !== originalFormData.cover_url
      ) {
        updateData.cover_url = formData.cover_url;
      }

      const response = await apiService.companies.update(
        user.companyId || user.id,
        updateData,
      );

      if (response.success && response.data) {
        toast.success("Perfil atualizado com sucesso!");

        setOriginalFormData({ ...formData });

        // Atualizar usuário no store
        updateUser({
          ...user,
          name: formData.tradeName,
          email: formData.email,
          phone: formData.phone,
          cpf: formData.cnpj,
          photoUrl: formData.logo_url || user.photoUrl,
        });

        setIsEditing(false);
      } else {
        toast.error(response.message || "Erro ao atualizar perfil");
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      const errorMessage = getErrorMessage(
        error,
        "Erro ao atualizar perfil. Verifique os dados e tente novamente.",
      );
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };
  /**
   * Atualiza campo do formulário   */
  const updateFormField = (field: keyof CompanyFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Desmarca os outros endereços padrão da empresa - o backend não faz isso
   * sozinho (ver adress.md). Só roda depois que o endereço escolhido já foi
   * salvo como padrão: antes, rodava primeiro, e um salvamento recusado
   * deixava a loja sem endereço padrão nenhum. Devolve se algum falhou.
   *
   * Desmarca só com a flag, como o perfil do cliente: reenviar o endereço
   * inteiro fazia o PATCH recusar por CEP ou complemento antigos fora do
   * formato - um erro sobre campo que não estamos mudando.
   */
  const unsetOtherDefaults = async (keepId: string) => {
    let failed = false;
    const currentAddresses = await apiService.address.getCompanyAddresses();
    if (!currentAddresses.success || !currentAddresses.data) return failed;

    const backendAddresses = Array.isArray(currentAddresses.data)
      ? currentAddresses.data
      : [];
    // DELETE é soft delete (isActive: false) - endereço apagado não conta.
    const backendDefaults = backendAddresses.filter(
      (addr) =>
        addr.isDefault && addr.isActive !== false && addr.id !== keepId,
    );

    for (const addr of backendDefaults) {
      const change = await unsetDefaultAddress(
        addr,
        apiService.address.updateCompanyAddress,
      );
      if (!change.ok) failed = true;
    }

    return failed;
  };

  /**
   * Abre o modal do endereço da loja: editar o que existe ou, sem nenhum,
   * cadastrar o primeiro. Não há "adicionar outro" (LDMF-263).
   */
  const openAddressModal = () => {
    if (storeAddress) {
      addressEditor.loadAddress(storeAddress);
      setEditingAddressId(storeAddress.id);
      setEditingAddressOriginal({
        complement: storeAddress.complement || "",
        reference: storeAddress.reference || "",
      });
    } else {
      addressEditor.resetEditor();
      setEditingAddressId(null);
      setEditingAddressOriginal({ complement: "", reference: "" });
    }
    setIsAddressModalOpen(true);
  };

  /**
   * Fecha o modal e descarta o que foi digitado
   */
  const closeAddressModal = () => {
    addressEditor.resetEditor();
    setEditingAddressId(null);
    setEditingAddressOriginal({ complement: "", reference: "" });
    setIsAddressModalOpen(false);
  };

  /**
   * Salva o endereço da loja: atualiza o existente (mesmo id) ou cria o
   * primeiro. Sai sempre como padrão e com exatamente a posição do pino -
   * sem pino não salva, nada de geocodificação escondida (LDMF-263).
   */
  const handleSaveAddress = async (data: AddressFormData) => {
    // No PATCH (diferente do POST), complement/reference exigem mínimo de 5
    // caracteres quando preenchidos (ver adress.md). Endereços antigos criados
    // via POST podem ter valores curtos - só bloqueamos se o usuário de fato
    // digitou um valor novo inválido; se não mexeu no campo, o valor herdado é
    // omitido do PATCH para não travar o resto do formulário.
    const trimmedComplement = data.complement?.trim() ?? "";
    const trimmedReference = data.reference?.trim() ?? "";
    const complementUnchanged =
      trimmedComplement === editingAddressOriginal.complement.trim();
    const referenceUnchanged =
      trimmedReference === editingAddressOriginal.reference.trim();

    if (editingAddressId) {
      if (
        trimmedComplement.length > 0 &&
        trimmedComplement.length < 5 &&
        !complementUnchanged
      ) {
        toast.error(
          "Complemento deve ter pelo menos 5 caracteres (ou ficar vazio)",
        );
        return;
      }
      if (
        trimmedReference.length > 0 &&
        trimmedReference.length < 5 &&
        !referenceUnchanged
      ) {
        toast.error(
          "Referência deve ter pelo menos 5 caracteres (ou ficar vazia)",
        );
        return;
      }
    }

    const pinCoords = addressEditor.getPinForSave(data);
    if (!pinCoords) return;

    const omitShortInherited = (unchanged: boolean, trimmed: string) =>
      Boolean(editingAddressId) &&
      unchanged &&
      trimmed.length > 0 &&
      trimmed.length < 5;

    const payload = {
      zipCode: onlyNumbers(data.zipCode),
      state: data.state,
      city: data.city,
      neighborhood: data.neighborhood,
      street: data.street,
      number: data.number,
      complement: omitShortInherited(complementUnchanged, trimmedComplement)
        ? undefined
        : sanitizeOptionalText(trimmedComplement),
      reference: omitShortInherited(referenceUnchanged, trimmedReference)
        ? undefined
        : sanitizeOptionalText(trimmedReference),
      latitude: pinCoords.lat,
      longitude: pinCoords.lng,
      isDefault: true,
    };

    setIsSavingAddress(true);
    try {
      const response = editingAddressId
        ? await apiService.address.updateCompanyAddress(
            editingAddressId,
            payload,
          )
        : await apiService.address.createCompanyAddress(payload);

      if (!response.success) {
        toast.error(
          response.message ||
            (editingAddressId
              ? "Erro ao atualizar endereço"
              : "Erro ao adicionar endereço"),
        );
        return;
      }

      // O back não desmarca o padrão anterior sozinho (ver adress.md).
      const savedId = editingAddressId ?? response.data?.id;
      const failedToUnsetDefault = savedId
        ? await unsetOtherDefaults(savedId)
        : false;

      toast.success(
        editingAddressId
          ? "Endereço atualizado com sucesso!"
          : "Endereço adicionado com sucesso!",
      );
      if (failedToUnsetDefault) {
        toast.warning(
          "Não conseguimos desmarcar todos os endereços padrão antigos. Confira a lista de endereços.",
        );
      }
      await fetchAddresses();
      closeAddressModal();
    } catch {
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
   * Formata CEP
   */
  const formatZipCode = (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .substring(0, 9);
  };

  /**
   * Valida senha
   */
  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 6) errors.push("mínimo 6 caracteres");
    if (!/[A-Z]/.test(password)) errors.push("1 letra maiúscula");
    if (!/[a-z]/.test(password)) errors.push("1 letra minúscula");
    if (!/[^A-Za-z0-9]/.test(password)) errors.push("1 símbolo");
    return errors;
  };

  /**
   * Altera senha
   */
  const handleChangePassword = async () => {
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      toast.error("Preencha todos os campos de senha");
      return;
    }

    const errors = validatePassword(passwordData.newPassword);
    if (errors.length > 0) {
      toast.error(`Senha fraca: ${errors.join(", ")}`);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    // Sem rota no backend: antes saía "Senha alterada com sucesso!" sem chamar
    // API nenhuma. O formulário fica preenchido para não parecer que algo foi
    // salvo.
    toast.error(PASSWORD_CHANGE_UNAVAILABLE);
  };

  /**
   * Atualiza campo de senha
   */
  const updatePasswordField = (
    field: keyof PasswordFormData,
    value: string,
  ) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));

    // Recalcular erros de validação quando alterando nova senha
    if (field === "newPassword") {
      setPasswordErrors(validatePassword(value));
    }
  };

  /**
   * Limpa formulário de senha
   */
  const resetPasswordForm = () => {
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setPasswordErrors([]);
  };

  return {
    // Auth & mounted state
    user,
    isMounted,

    // Company profile
    formData,
    isLoadingProfile,
    profileError,
    isEditing,
    isSaving,
    isOpen,
    selectedCategory,
    companySpecialties,
    specialtyDraft,
    hasSpecialtyChanges,
    isSavingSpecialty,
    setIsEditing,
    setSelectedCategory,
    handleCancelEdit,
    handleSaveProfile,
    handleSaveSpecialty,
    setSpecialtySlot,
    discardSpecialtyChanges,
    handleSaveSpecialties,
    updateFormField,

    // Addresses
    addresses,
    storeAddress,
    isLoadingAddresses,
    isAddressModalOpen,
    isSavingAddress,
    editingAddressId,
    openAddressModal,
    closeAddressModal,
    handleSaveAddress,
    addressEditor,
    formatZipCode,

    // Password
    isChangingPassword,
    passwordData,
    passwordErrors,
    setIsChangingPassword,
    handleChangePassword,
    updatePasswordField,
    resetPasswordForm,
    validatePassword,
  };
};
