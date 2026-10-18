import { apiService, type Address, type Specialty } from "@/services/api";
import { PASSWORD_CHANGE_UNAVAILABLE } from "@/constants/password-change";
import { CepNotFoundError, fetchCepAddress } from "@/lib/cep";
import { unsetDefaultAddress } from "@/lib/default-address";
import { geocodeAddress } from "@/lib/geocode";
import { useAuthStore } from "@/stores";
import { getErrorMessage, onlyNumbers } from "@/utils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * A busca por proximidade do catalogo descarta qualquer loja sem
 * latitude/longitude cadastrada. Por isso geocodificações o endereço antes de
 * salvar - sem isso a loja fica invisível para todo cliente com localização .
 */
async function withStoreCoordinates<T extends AddressFormData>(address: T) {
  const coords = await geocodeAddress(address);

  if (!coords) {
    toast.warning("Nao localizamos esse endereço no mapa", {
      description:
        "Confira CEP, rua e numero. Sem isso a loja não aparece nas buscas por proximidade.",
      duration: 6000,
    });

    return address;
  }

  return { ...address, latitude: coords.lat, longitude: coords.lng };
}

// Mesmas mensagens do checkout (LDMF-350): as duas telas se comportam igual.
const CITY_WIDE_CEP_HINT =
  "Este CEP vale para a cidade inteira. Preencha rua, número e bairro abaixo.";
const NO_NEIGHBORHOOD_CEP_HINT =
  "Este CEP não traz o bairro. Preencha o bairro abaixo.";
const CEP_NOT_FOUND_HINT =
  "CEP não encontrado. Confira o número ou preencha cidade, UF, rua, número e bairro à mão.";
const CEP_LOOKUP_FAILED_HINT =
  "Não conseguimos consultar o CEP agora. Preencha cidade, UF, rua, número e bairro à mão.";

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

interface AddressFormData {
  zipCode: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  isDefault?: boolean;
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
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editingAddressOriginal, setEditingAddressOriginal] = useState<{
    complement: string;
    reference: string;
  }>({ complement: "", reference: "" });
  const [newAddress, setNewAddress] = useState<AddressFormData>({
    zipCode: "",
    state: "",
    city: "",
    neighborhood: "",
    street: "",
    number: "",
    complement: "",
    reference: "",
    isDefault: false,
  });
  const [isSearchingZipCode, setIsSearchingZipCode] = useState(false);
  // Orientação abaixo do CEP: cidade de CEP único, CEP sem bairro ou busca
  // que falhou. null = sem aviso.
  const [zipCodeHint, setZipCodeHint] = useState<string | null>(null);
  // Último CEP pedido: resposta de um CEP anterior que chegue atrasada não
  // pode preencher o formulário.
  const lastZipCodeSearch = useRef<string | null>(null);

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
          // Populate specialty from real company data
          const specs = company.specialty || [];
          setCompanySpecialties(specs);
          if (specs.length > 0) {
            setSelectedCategory(specs[0].id);
          }
        } else {
          setProfileError(response.message || "Erro ao carregar perfil");
        }
      } catch (error) {
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
    } catch (error) {
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
   * Adiciona novo endereço
   */
  const handleAddAddress = async () => {
    // Validar campos obrigatórios
    if (
      !newAddress.zipCode ||
      !newAddress.street ||
      !newAddress.number ||
      !newAddress.neighborhood ||
      !newAddress.city ||
      !newAddress.state
    ) {
      toast.error("Preencha todos os campos obrigatórios do endereço");
      return;
    }

    try {
      const addressData = await withStoreCoordinates({
        ...newAddress,
        zipCode: newAddress.zipCode.replace(/\D/g, ""),
        isDefault: newAddress.isDefault ?? false,
      });
      const payload = {
        ...addressData,
        complement: sanitizeOptionalText(addressData.complement),
        reference: sanitizeOptionalText(addressData.reference),
      };

      const response = await apiService.address.createCompanyAddress(payload);

      if (response.success && response.data) {
        const failedToUnsetDefault = addressData.isDefault
          ? await unsetOtherDefaults(response.data.id)
          : false;

        toast.success("Endereço adicionado com sucesso!");
        if (failedToUnsetDefault) {
          toast.warning(
            "Não conseguimos desmarcar todos os endereços padrão antigos. Confira a lista de endereços.",
          );
        }
        await fetchAddresses();
        setIsAddingAddress(false);
        resetAddressForm();
      } else {
        toast.error(response.message || "Erro ao adicionar endereço");
      }
    } catch (error) {
      toast.error("Erro ao adicionar endereço");
    }
  };

  /**
   * Remove endereço
   */
  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm("Tem certeza que deseja excluir este endereço?")) return;

    try {
      const response = await apiService.address.deleteCompanyAddress(addressId);
      if (response.success) {
        toast.success("Endereço removido com sucesso!");
        setAddresses((prevAddresses) =>
          prevAddresses.filter((addr) => addr.id !== addressId),
        );
      } else {
        toast.error(response.message || "Erro ao remover endereço");
      }
    } catch (error) {
      toast.error("Erro ao remover endereço");
    }
  };

  /**
   * Busca endereço pelo CEP (BrasilAPI, a mesma fonte do checkout).
   *
   * Só sobrescreve o que o CEP trouxe. Antes cada campo recebia
   * `data.x || ""`, e um CEP sem rua (cidade de CEP único, como 29360000
   * Castelo e 29500000 Alegre) apagava a rua e o bairro que o dono já tinha
   * digitado (LDMF-364). Se a busca falhar, nada é apagado e os campos
   * continuam editáveis para preencher à mão.
   */
  const handleSearchZipCode = async (zipCode: string) => {
    const cleanZip = zipCode.replace(/\D/g, "");
    if (cleanZip.length !== 8) return;

    lastZipCodeSearch.current = cleanZip;
    setIsSearchingZipCode(true);
    setZipCodeHint(null);

    try {
      const result = await fetchCepAddress(cleanZip);
      if (lastZipCodeSearch.current !== cleanZip) return;

      setNewAddress((prevAddress) => ({
        ...prevAddress,
        zipCode: cleanZip,
        street: result.street || prevAddress.street,
        neighborhood: result.neighborhood || prevAddress.neighborhood,
        city: result.city || prevAddress.city,
        state: result.state || prevAddress.state,
      }));

      setZipCodeHint(
        !result.street
          ? CITY_WIDE_CEP_HINT
          : !result.neighborhood
            ? NO_NEIGHBORHOOD_CEP_HINT
            : null,
      );
      toast.success(
        !result.street
          ? "CEP da cidade encontrado. Preencha rua, número e bairro."
          : !result.neighborhood
            ? "CEP encontrado. Preencha o bairro."
            : "CEP encontrado!",
      );
    } catch (error) {
      if (lastZipCodeSearch.current !== cleanZip) return;

      if (error instanceof CepNotFoundError) {
        setZipCodeHint(CEP_NOT_FOUND_HINT);
        toast.error("CEP não encontrado");
      } else {
        setZipCodeHint(CEP_LOOKUP_FAILED_HINT);
        toast.error("Erro ao buscar CEP. Preencha o endereço à mão.");
      }
    } finally {
      if (lastZipCodeSearch.current === cleanZip) setIsSearchingZipCode(false);
    }
  };

  /**
   * Limpa o aviso do CEP e descarta busca em andamento
   */
  const clearZipCodeSearch = () => {
    lastZipCodeSearch.current = null;
    setIsSearchingZipCode(false);
    setZipCodeHint(null);
  };

  /**
   * Atualiza campo de endereço
   */
  const updateAddressField = (
    field: keyof AddressFormData,
    value: string | boolean,
  ) => {
    // CEP mudou: o aviso e a busca anteriores não valem mais.
    if (field === "zipCode") clearZipCodeSearch();
    setNewAddress((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Abrir formulário para editar endereço
   */
  const handleEditAddress = (address: Address) => {
    clearZipCodeSearch();
    setEditingAddressId(address.id);
    setEditingAddressOriginal({
      complement: address.complement || "",
      reference: address.reference || "",
    });
    setNewAddress({
      zipCode: address.zipCode,
      state: address.state,
      city: address.city,
      neighborhood: address.neighborhood,
      street: address.street,
      number: address.number,
      complement: address.complement || "",
      reference: address.reference || "",
      isDefault: address.isDefault || false,
    });
    setIsAddingAddress(true);
  };

  /**
   * Atualizar endereço existente
   */
  const handleUpdateAddress = async () => {
    if (!editingAddressId) return;

    // Validar campos obrigatórios
    if (
      !newAddress.zipCode ||
      !newAddress.street ||
      !newAddress.number ||
      !newAddress.neighborhood ||
      !newAddress.city ||
      !newAddress.state
    ) {
      toast.error("Preencha todos os campos obrigatórios do endereço");
      return;
    }

    // No PATCH (diferente do POST), complement/reference exigem mínimo de 5
    // caracteres quando preenchidos (ver adress.md). Endereços antigos criados
    // via POST podem ter valores curtos - só bloqueamos se o usuário de fato
    // digitou um valor novo inválido; se não mexeu no campo, o valor herdado é
    // omitido do PATCH para não travar o resto do formulário.
    const trimmedComplement = newAddress.complement.trim();
    const trimmedReference = newAddress.reference.trim();
    const complementUnchanged =
      trimmedComplement === editingAddressOriginal.complement.trim();
    const referenceUnchanged =
      trimmedReference === editingAddressOriginal.reference.trim();

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

    try {
      const addressData = await withStoreCoordinates({
        ...newAddress,
        zipCode: newAddress.zipCode.replace(/\D/g, ""),
        isDefault: newAddress.isDefault ?? false,
      });
      const payload = {
        ...addressData,
        complement:
          complementUnchanged && trimmedComplement.length < 5
            ? undefined
            : sanitizeOptionalText(addressData.complement),
        reference:
          referenceUnchanged && trimmedReference.length < 5
            ? undefined
            : sanitizeOptionalText(addressData.reference),
      };

      const response = await apiService.address.updateCompanyAddress(
        editingAddressId,
        payload,
      );

      if (response.success) {
        const failedToUnsetDefault = addressData.isDefault
          ? await unsetOtherDefaults(editingAddressId)
          : false;

        toast.success("Endereço atualizado com sucesso!");
        if (failedToUnsetDefault) {
          toast.warning(
            "Não conseguimos desmarcar todos os endereços padrão antigos. Confira a lista de endereços.",
          );
        }
        await fetchAddresses();
        setIsAddingAddress(false);
        setEditingAddressId(null);
        setEditingAddressOriginal({ complement: "", reference: "" });
        resetAddressForm();
      } else {
        toast.error(response.message || "Erro ao atualizar endereço");
      }
    } catch (error) {
      toast.error("Erro ao atualizar endereço");
    }
  };

  /**
   * Salvar endereço (criar ou atualizar)
   */
  const handleSaveAddress = () => {
    if (editingAddressId) {
      return handleUpdateAddress();
    } else {
      return handleAddAddress();
    }
  };

  /**
   * Cancelar edição/adição de endereço
   */
  const handleCancelAddressEdit = () => {
    setEditingAddressId(null);
    setEditingAddressOriginal({ complement: "", reference: "" });
    setIsAddingAddress(false);
    resetAddressForm();
  };

  /**
   * Limpa formulário de endereço
   */
  const resetAddressForm = () => {
    clearZipCodeSearch();
    setNewAddress({
      zipCode: "",
      state: "",
      city: "",
      neighborhood: "",
      street: "",
      number: "",
      complement: "",
      reference: "",
      isDefault: false,
    });
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
    isSavingSpecialty,
    setIsEditing,
    setSelectedCategory,
    handleCancelEdit,
    handleSaveProfile,
    handleSaveSpecialty,
    updateFormField,

    // Addresses
    addresses,
    isLoadingAddresses,
    isAddingAddress,
    editingAddressId,
    newAddress,
    setIsAddingAddress,
    handleSaveAddress,
    handleEditAddress,
    handleCancelAddressEdit,
    handleDeleteAddress,
    handleSearchZipCode,
    isSearchingZipCode,
    zipCodeHint,
    updateAddressField,
    resetAddressForm,
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
