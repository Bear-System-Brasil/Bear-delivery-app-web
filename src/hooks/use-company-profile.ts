import { apiService } from "@/services/api";
import { useAuthStore } from "@/stores";
import { getErrorMessage, onlyNumbers } from "@/utils";
import { useState } from "react";
import { toast } from "sonner";

export interface CompanyFormData {
  tradeName: string;
  legalName: string;
  cnpj: string;
  email: string;
  phone: string;
  logo_url: string;
  cover_url: string;
}

export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Hook para gerenciar o perfil de empresa
 * Centraliza a lógica de edição, salvamento e validação
 */
export const useCompanyProfile = () => {
  const { user, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /**
   * Valida os dados do formulário antes de salvar
   * @param formData - Dados do formulário
   * @returns Lista de campos vazios ou vazia se tudo estiver ok
   */
  const validateFormData = (formData: CompanyFormData): string[] => {
    const camposVazios: string[] = [];

    if (!formData.tradeName) camposVazios.push("Nome Fantasia");
    if (!formData.legalName) camposVazios.push("Razão Social");
    if (!formData.cnpj) camposVazios.push("CNPJ");
    if (!formData.email) camposVazios.push("E-mail");
    if (!formData.phone) camposVazios.push("Telefone");

    return camposVazios;
  };

  /**
   * Valida os campos individualmente
   * @param formData - Dados do formulário
   * @returns true se todos os campos são válidos
   */
  const validateFields = (formData: CompanyFormData): boolean => {
    const tradeName = formData.tradeName?.trim() || "";
    if (tradeName.length < 3) {
      toast.error("Nome Fantasia deve ter pelo menos 3 caracteres");
      return false;
    }

    const legalName = formData.legalName?.trim() || "";
    if (legalName.length < 3) {
      toast.error("Razão Social deve ter pelo menos 3 caracteres");
      return false;
    }

    const cnpj = onlyNumbers(formData.cnpj || "");
    if (cnpj.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return false;
    }

    const email = formData.email?.trim().toLowerCase() || "";
    if (!email.includes("@")) {
      toast.error("E-mail inválido");
      return false;
    }

    const phone = onlyNumbers(formData.phone || "");
    if (phone.length !== 11) {
      toast.error("Telefone deve ter 11 dígitos");
      return false;
    }

    return true;
  };

  /**
   * Carrega os dados do perfil da empresa
   * @param companyId - ID da empresa
   * @returns Dados da empresa ou null em caso de erro
   */
  const loadCompanyProfile = async (
    companyId: string,
  ): Promise<CompanyFormData | null> => {
    setIsLoadingProfile(true);
    setProfileError(null);

    try {
      const response = await apiService.companies.getById(companyId);

      if (response.success && response.data) {
        const company = response.data;

        // Usar dados do Zustand store em vez de localStorage direto
        const companyData: CompanyFormData = {
          tradeName: company.tradeName || "",
          legalName: user?.legalName || "",
          cnpj: user?.cpf || "",
          email: company.email || user?.email || "",
          phone: company.phone || "",
          logo_url: company.logo_url || "",
          cover_url: company.cover_url || "",
        };

        return companyData;
      } else {
        setProfileError(response.message || "Erro ao carregar perfil");
        return null;
      }
    } catch (_error) {
      setProfileError("Erro de conexão ao carregar perfil");
      return null;
    } finally {
      setIsLoadingProfile(false);
    }
  };

  /**
   * Salva as alterações do perfil
   * @param formData - Dados do formulário
   * @param originalFormData - Dados originais para comparação
   * @returns true se salvo com sucesso
   */
  const saveProfile = async (
    formData: CompanyFormData,
    originalFormData: CompanyFormData,
  ): Promise<boolean> => {
    // Validar campos vazios
    const camposVazios = validateFormData(formData);
    if (camposVazios.length > 0) {
      toast.error(
        `Preencha todos os campos obrigatórios: ${camposVazios.join(", ")}`,
      );
      return false;
    }

    if (!user?.id) {
      toast.error("Usuário não identificado");
      return false;
    }

    // Validar campos individualmente
    if (!validateFields(formData)) {
      return false;
    }

    setIsSaving(true);

    try {
      const tradeName = formData.tradeName?.trim() || "";
      const legalName = formData.legalName?.trim() || "";
      const cnpj = onlyNumbers(formData.cnpj || "");
      const email = formData.email?.trim().toLowerCase() || "";
      const phone = onlyNumbers(formData.phone || "");

      // BACKEND BUG WORKAROUND: O backend requer TODOS os campos
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

      const response = await apiService.companies.update(user.companyId || user.id, updateData);

      if (response.success && response.data) {
        toast.success("Perfil atualizado com sucesso!");

        // Update user in store
        updateUser({
          ...user,
          name: formData.tradeName,
          email: formData.email,
          phone: formData.phone,
          cpf: formData.cnpj,
          tradeName: formData.tradeName,
          legalName: formData.legalName,
          photoUrl: formData.logo_url || user.photoUrl,
        });

        setIsEditing(false);
        return true;
      } else {
        toast.error(response.message || "Erro ao atualizar perfil");
        return false;
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);

      const errorMessage = getErrorMessage(
        error,
        "Erro ao atualizar perfil. Tente novamente.",
      );

      toast.error(errorMessage);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Valida os dados de mudança de senha
   * @param passwordData - Dados da senha
   * @returns Lista de erros ou vazia se tudo estiver ok
   */
  const validatePasswordChange = (
    passwordData: PasswordChangeData,
  ): string[] => {
    const errors: string[] = [];

    if (!passwordData.currentPassword) {
      errors.push("Senha atual é obrigatória");
    }

    if (!passwordData.newPassword) {
      errors.push("Nova senha é obrigatória");
    }

    if (passwordData.newPassword.length < 6) {
      errors.push("Nova senha deve ter pelo menos 6 caracteres");
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.push("As senhas não coincidem");
    }

    return errors;
  };

  return {
    isEditing,
    setIsEditing,
    isSaving,
    isLoadingProfile,
    profileError,
    loadCompanyProfile,
    saveProfile,
    validatePasswordChange,
  };
};
