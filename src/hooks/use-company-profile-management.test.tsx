import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { apiService, type Address } from "@/services/api";
import { useAuthStore } from "@/stores";
import type { AddressFormData } from "./use-form-validation";
import { useCompanyProfileManagement } from "./use-company-profile-management";

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      companies: { getById: vi.fn(), update: vi.fn() },
      address: {
        getCompanyAddresses: vi.fn(),
        createCompanyAddress: vi.fn(),
        updateCompanyAddress: vi.fn(),
        deleteCompanyAddress: vi.fn(),
      },
      assignSpecialtyToCompany: vi.fn(),
      removeSpecialtyFromCompany: vi.fn(),
    },
  };
});

const api = vi.mocked(apiService, true);

const company = {
  id: "c1",
  tradeName: "Bear Burger",
  legalName: "Bear Burger Ltda",
  cnpj: "12345678000190",
  email: "loja@bear.com",
  phone: "41999990000",
  logo_url: "https://r2.test/logo.png",
  cover_url: "",
  isOpen: false,
  specialty: [{ id: "sp-lanches", name: "Lanches" }],
};

const storeAddress = (id: string, extra: Partial<Address> = {}) =>
  ({
    id,
    zipCode: "80000000",
    state: "PR",
    city: "Curitiba",
    neighborhood: "Centro",
    street: "Rua A",
    number: "10",
    complement: "",
    reference: "",
    isDefault: false,
    ...extra,
  }) as Address;

/** O que o modal entrega ao salvar (já validado pelo schema). */
const formData = (extra: Partial<AddressFormData> = {}): AddressFormData => ({
  zipCode: "80420-000",
  state: "PR",
  city: "Curitiba",
  neighborhood: "Batel",
  street: "Av. Sete",
  number: "700",
  complement: "",
  reference: "",
  isDefault: false,
  ...extra,
});

const PIN = { lat: -25.44, lng: -49.29 };

let serverAddresses: Address[] = [];

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderCompany() {
  const hook = renderHook(() => useCompanyProfileManagement(), { wrapper });
  await waitFor(() => {
    expect(hook.result.current.isLoadingProfile).toBe(false);
    expect(hook.result.current.isLoadingAddresses).toBe(false);
  });
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderCompany>>["result"];

/** Dono toca no mapa: é o que o salvar manda. */
function placePin(result: Hook, coords = PIN) {
  act(() => result.current.addressEditor.applyCoords(coords, "manual"));
}

async function save(result: Hook, data: AddressFormData) {
  await act(async () => {
    await result.current.handleSaveAddress(data);
  });
}

describe("useCompanyProfileManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverAddresses = [];
    useAuthStore.setState(
      {
        ...initialAuthState,
        isAuthenticated: true,
        _hasHydrated: true,
        user: {
          id: "owner-1",
          name: "Bear Burger",
          email: "loja@bear.com",
          cpf: "",
          phone: "",
          birthDate: "",
          role: "owner",
          companyId: "c1",
          photoUrl: "https://r2.test/antiga.png",
        },
      },
      true,
    );
    api.companies.getById.mockResolvedValue({ success: true, data: company } as never);
    api.address.getCompanyAddresses.mockImplementation(async () => ({
      success: true,
      data: serverAddresses,
    }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("carga", () => {
    it("sem login, depois de hidratar, manda abrir o login", async () => {
      useAuthStore.setState({ ...initialAuthState, _hasHydrated: true }, true);

      renderHook(() => useCompanyProfileManagement(), { wrapper });

      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/?openAuth=true"));
    });

    it("antes de hidratar, nem busca nem redireciona", async () => {
      useAuthStore.setState({ ...initialAuthState, _hasHydrated: false }, true);

      const { result } = renderHook(() => useCompanyProfileManagement(), { wrapper });

      await waitFor(() => expect(result.current.isMounted).toBe(true));
      expect(router.push).not.toHaveBeenCalled();
      expect(api.companies.getById).not.toHaveBeenCalled();
    });

    it("carrega a empresa pelo companyId e preenche o formulário", async () => {
      const { result } = await renderCompany();

      expect(api.companies.getById).toHaveBeenCalledWith("c1");
      expect(result.current.formData).toEqual({
        tradeName: "Bear Burger",
        legalName: "Bear Burger Ltda",
        cnpj: "12345678000190",
        email: "loja@bear.com",
        phone: "41999990000",
        logo_url: "https://r2.test/logo.png",
        cover_url: "",
      });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedCategory).toBe("sp-lanches");
    });

    it("falha ao carregar vira profileError", async () => {
      api.companies.getById.mockResolvedValue({ success: false, message: "Empresa suspensa" });

      const { result } = await renderCompany();

      expect(result.current.profileError).toBe("Empresa suspensa");
    });

    it("lista só endereços ativos", async () => {
      serverAddresses = [
        storeAddress("a1"),
        storeAddress("a2", { isActive: false } as never),
      ];

      const { result } = await renderCompany();

      expect(result.current.addresses.map((a) => a.id)).toEqual(["a1"]);
    });
  });

  describe("salvar dados da empresa", () => {
    it("manda CNPJ e telefone só com dígitos, e-mail minúsculo, e atualiza o store", async () => {
      api.companies.update.mockResolvedValue({ success: true, data: company } as never);
      const { result } = await renderCompany();
      act(() => {
        result.current.setIsEditing(true);
        result.current.updateFormField("cnpj", "12.345.678/0001-90");
        result.current.updateFormField("phone", "(41) 98888-7777");
        result.current.updateFormField("email", "  Contato@Bear.com ");
        result.current.updateFormField("tradeName", "  Bear Burger Batel ");
      });

      await act(async () => {
        await result.current.handleSaveProfile();
      });

      expect(api.companies.update).toHaveBeenCalledWith("c1", {
        tradeName: "Bear Burger Batel",
        legalName: "Bear Burger Ltda",
        cnpj: "12345678000190",
        email: "contato@bear.com",
        phone: "41988887777",
      });
      expect(useAuthStore.getState().user).toMatchObject({ name: "  Bear Burger Batel " });
      expect(result.current.isEditing).toBe(false);
      expect(toast.success).toHaveBeenCalledWith("Perfil atualizado com sucesso!");
    });

    it("logo e capa só vão quando mudaram", async () => {
      api.companies.update.mockResolvedValue({ success: true, data: company } as never);
      const { result } = await renderCompany();
      act(() => result.current.updateFormField("cover_url", "https://r2.test/capa.png"));

      await act(async () => {
        await result.current.handleSaveProfile();
      });

      // O tipo do update não declara logo_url/cover_url, mas o hook envia.
      const payload = api.companies.update.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.cover_url).toBe("https://r2.test/capa.png");
      expect(payload).not.toHaveProperty("logo_url");
    });

    it("lista todos os campos obrigatórios vazios", async () => {
      const { result } = await renderCompany();
      act(() => {
        result.current.updateFormField("tradeName", "");
        result.current.updateFormField("phone", "");
      });

      await act(async () => {
        await result.current.handleSaveProfile();
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Preencha todos os campos obrigatórios: Nome Fantasia, Telefone",
      );
      expect(api.companies.update).not.toHaveBeenCalled();
    });

    it.each([
      ["tradeName", "Bear", "Nome Fantasia deve ter entre 5 e 125 caracteres"],
      ["legalName", "x".repeat(126), "Razão Social deve ter entre 5 e 125 caracteres"],
      ["cnpj", "1234567800019", "CNPJ deve ter 14 dígitos"],
      ["email", "loja.bear.com", "E-mail inválido"],
      ["phone", "4133334444", "Telefone deve ter 11 dígitos"],
    ] as const)("%s '%s' é barrado", async (field, value, message) => {
      const { result } = await renderCompany();
      act(() => result.current.updateFormField(field, value));

      await act(async () => {
        await result.current.handleSaveProfile();
      });

      expect(toast.error).toHaveBeenCalledWith(message);
      expect(api.companies.update).not.toHaveBeenCalled();
      expect(result.current.isSaving).toBe(false);
    });

    it("recusa do backend mantém a edição aberta", async () => {
      api.companies.update.mockResolvedValue({ success: false, message: "CNPJ já cadastrado" });
      const { result } = await renderCompany();
      act(() => result.current.setIsEditing(true));

      await act(async () => {
        await result.current.handleSaveProfile();
      });

      expect(toast.error).toHaveBeenCalledWith("CNPJ já cadastrado");
      expect(result.current.isEditing).toBe(true);
    });

    it("cancelar volta aos dados carregados", async () => {
      const { result } = await renderCompany();
      act(() => {
        result.current.setIsEditing(true);
        result.current.updateFormField("tradeName", "Outro nome");
      });

      act(() => result.current.handleCancelEdit());

      expect(result.current.formData.tradeName).toBe("Bear Burger");
      expect(result.current.isEditing).toBe(false);
    });
  });

  describe("tipo de restaurante", () => {
    it("remove o tipo antigo, atribui o novo e recarrega", async () => {
      api.removeSpecialtyFromCompany.mockResolvedValue({ success: true } as never);
      api.assignSpecialtyToCompany.mockResolvedValue({ success: true } as never);
      const { result } = await renderCompany();
      api.companies.getById.mockResolvedValue({
        success: true,
        data: { ...company, specialty: [{ id: "sp-pizza", name: "Pizza" }] },
      } as never);

      await act(async () => {
        await result.current.handleSaveSpecialty("sp-pizza");
      });

      expect(api.removeSpecialtyFromCompany).toHaveBeenCalledWith("sp-lanches");
      expect(api.assignSpecialtyToCompany).toHaveBeenCalledWith("sp-pizza");
      expect(result.current.selectedCategory).toBe("sp-pizza");
      expect(result.current.companySpecialties.map((s) => s.id)).toEqual(["sp-pizza"]);
      expect(toast.success).toHaveBeenCalledWith("Tipo de restaurante atualizado!");
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("se não remover o antigo, atribui e avisa que podem ficar dois", async () => {
      api.removeSpecialtyFromCompany.mockResolvedValue({ success: false } as never);
      api.assignSpecialtyToCompany.mockResolvedValue({ success: true } as never);
      const { result } = await renderCompany();

      await act(async () => {
        await result.current.handleSaveSpecialty("sp-pizza");
      });

      expect(toast.warning).toHaveBeenCalledWith(
        "Não conseguimos remover o tipo antigo - a loja pode ficar com mais de um tipo cadastrado.",
      );
    });

    it("atribuição recusada avisa erro e mantém a seleção", async () => {
      api.removeSpecialtyFromCompany.mockResolvedValue({ success: true } as never);
      api.assignSpecialtyToCompany.mockResolvedValue({ success: false } as never);
      const { result } = await renderCompany();

      await act(async () => {
        await result.current.handleSaveSpecialty("sp-pizza");
      });

      expect(toast.error).toHaveBeenCalledWith("Erro ao atualizar tipo de restaurante");
      expect(result.current.selectedCategory).toBe("sp-lanches");
      expect(result.current.isSavingSpecialty).toBe(false);
    });
  });

  describe("endereço único da loja (LDMF-263)", () => {
    it("o endereço da loja é o padrão; sem padrão, o primeiro ativo", async () => {
      serverAddresses = [storeAddress("a1"), storeAddress("a2", { isDefault: true })];
      const first = await renderCompany();
      expect(first.result.current.storeAddress?.id).toBe("a2");
      first.unmount();

      serverAddresses = [storeAddress("a1"), storeAddress("a2")];
      const second = await renderCompany();
      expect(second.result.current.storeAddress?.id).toBe("a1");
    });

    it("sem endereço, o modal abre vazio para cadastrar o primeiro", async () => {
      const { result } = await renderCompany();

      expect(result.current.storeAddress).toBeNull();
      act(() => result.current.openAddressModal());

      expect(result.current.isAddressModalOpen).toBe(true);
      expect(result.current.editingAddressId).toBeNull();
      expect(result.current.addressEditor.addressForm.getValues("street")).toBeFalsy();
    });

    it("com endereço, o modal abre nele, com o pino na coordenada salva", async () => {
      serverAddresses = [
        storeAddress("a1", {
          isDefault: true,
          complement: "Sala 2",
          reference: "Perto da praça",
          latitude: -25.1,
          longitude: -49.1,
        }),
      ];
      const { result } = await renderCompany();

      act(() => result.current.openAddressModal());

      expect(result.current.editingAddressId).toBe("a1");
      expect(result.current.addressEditor.addressForm.getValues()).toMatchObject({
        street: "Rua A",
        complement: "Sala 2",
        reference: "Perto da praça",
      });
      expect(result.current.addressEditor.addressCoords).toEqual({
        coords: { lat: -25.1, lng: -49.1 },
        source: "stored",
      });
    });

    it("fechar o modal limpa o estado de edição", async () => {
      serverAddresses = [storeAddress("a1", { isDefault: true })];
      const { result } = await renderCompany();
      act(() => result.current.openAddressModal());

      act(() => result.current.closeAddressModal());

      expect(result.current.isAddressModalOpen).toBe(false);
      expect(result.current.editingAddressId).toBeNull();
      expect(result.current.addressEditor.addressCoords).toBeNull();
    });
  });

  describe("primeiro endereço", () => {
    it("sai com CEP só com dígitos, exatamente a posição do pino, como padrão e sem textos vazios", async () => {
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderCompany();
      act(() => result.current.openAddressModal());
      placePin(result);

      await save(result, formData({ reference: "  Ao lado do posto  " }));

      expect(api.address.createCompanyAddress).toHaveBeenCalledWith({
        zipCode: "80420000",
        state: "PR",
        city: "Curitiba",
        neighborhood: "Batel",
        street: "Av. Sete",
        number: "700",
        complement: undefined,
        reference: "Ao lado do posto",
        latitude: -25.44,
        longitude: -49.29,
        isDefault: true,
      });
      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Endereço adicionado com sucesso!");
      expect(result.current.isAddressModalOpen).toBe(false);
      // Nenhuma geocodificação escondida no salvar (só o IBGE, ao abrir).
      const hosts = fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname);
      expect(hosts.filter((host) => host !== "servicodados.ibge.gov.br")).toEqual([]);
    });

    it("sem pino no mapa, não salva, avisa e mantém o modal aberto", async () => {
      const { result } = await renderCompany();
      act(() => result.current.openAddressModal());

      await save(result, formData());

      expect(api.address.createCompanyAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Marque no mapa onde fica o endereço antes de salvar.",
      );
      expect(result.current.isAddressModalOpen).toBe(true);
    });

    it("pino arrastado: salva a posição final", async () => {
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      act(() => result.current.openAddressModal());
      placePin(result, { lat: -20.6, lng: -41.2 });
      placePin(result, { lat: -20.61, lng: -41.21 });

      await save(result, formData());

      expect(api.address.createCompanyAddress.mock.calls[0][0]).toMatchObject({
        latitude: -20.61,
        longitude: -41.21,
      });
    });

    it("recusa do backend avisa e mantém o modal aberto", async () => {
      api.address.createCompanyAddress.mockResolvedValue({ success: false, message: "CEP inválido" });
      const { result } = await renderCompany();
      act(() => result.current.openAddressModal());
      placePin(result);

      await save(result, formData());

      expect(toast.error).toHaveBeenCalledWith("CEP inválido");
      expect(result.current.isAddressModalOpen).toBe(true);
    });

    it("exceção ao salvar avisa erro genérico", async () => {
      api.address.createCompanyAddress.mockRejectedValue(new Error("rede"));
      const { result } = await renderCompany();
      act(() => result.current.openAddressModal());
      placePin(result);

      await save(result, formData());

      expect(toast.error).toHaveBeenCalledWith("Erro ao adicionar endereço");
    });
  });

  describe("editar endereço", () => {
    async function editing(addresses: Address[]) {
      serverAddresses = addresses;
      const hook = await renderCompany();
      act(() => hook.result.current.openAddressModal());
      return hook;
    }

    it("atualiza o mesmo id por PATCH, como padrão, e nunca cria outro", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
      ]);

      await save(result, formData({ complement: "Loja 2B" }));

      expect(api.address.createCompanyAddress).not.toHaveBeenCalled();
      expect(api.address.updateCompanyAddress).toHaveBeenCalledTimes(1);
      expect(api.address.updateCompanyAddress).toHaveBeenCalledWith(
        "a1",
        expect.objectContaining({
          street: "Av. Sete",
          complement: "Loja 2B",
          latitude: -25.1,
          longitude: -49.1,
          isDefault: true,
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("Endereço atualizado com sucesso!");
    });

    it("loja com dois padrões antigos: desmarca o outro mandando só a flag", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
        storeAddress("a2", { isDefault: true }),
      ]);

      await save(result, formData());

      expect(api.address.updateCompanyAddress.mock.calls.map(([id]) => id)).toEqual(["a1", "a2"]);
      expect(api.address.updateCompanyAddress).toHaveBeenLastCalledWith("a2", { isDefault: false });
    });

    it("endereço apagado (isActive: false) não é desmarcado", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
        storeAddress("apagado", { isDefault: true, isActive: false }),
      ]);

      await save(result, formData());

      expect(api.address.updateCompanyAddress.mock.calls.map(([id]) => id)).toEqual(["a1"]);
    });

    it("se não desmarcar o outro padrão, salva e avisa", async () => {
      api.address.updateCompanyAddress
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValue({ success: false });
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
        storeAddress("a2", { isDefault: true }),
      ]);

      await save(result, formData());

      expect(toast.success).toHaveBeenCalledWith("Endereço atualizado com sucesso!");
      expect(toast.warning).toHaveBeenCalledWith(
        "Não conseguimos desmarcar todos os endereços padrão antigos. Confira a lista de endereços.",
      );
    });

    it("edição recusada não desmarca o outro padrão", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: false, message: "recusado" });
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
        storeAddress("a2", { isDefault: true }),
      ]);

      await save(result, formData());

      expect(api.address.updateCompanyAddress).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith("recusado");
      expect(result.current.isAddressModalOpen).toBe(true);
    });

    it("complemento novo curto é barrado antes do PATCH", async () => {
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
      ]);

      await save(result, formData({ complement: "301" }));

      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Complemento deve ter pelo menos 5 caracteres (ou ficar vazio)",
      );
    });

    it("referência nova curta é barrada antes do PATCH", async () => {
      const { result } = await editing([
        storeAddress("a1", { isDefault: true, latitude: -25.1, longitude: -49.1 }),
      ]);

      await save(result, formData({ reference: "Bar" }));

      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Referência deve ter pelo menos 5 caracteres (ou ficar vazia)",
      );
    });

    it("complemento e referência curtos herdados e intocados são omitidos do PATCH", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing([
        storeAddress("a1", {
          isDefault: true,
          complement: "301",
          reference: "Bar",
          latitude: -25.1,
          longitude: -49.1,
        }),
      ]);

      await save(result, formData({ complement: "301", reference: "Bar" }));

      const patch = api.address.updateCompanyAddress.mock.calls[0][1];
      expect(patch.complement).toBeUndefined();
      expect(patch.reference).toBeUndefined();
    });

    it("endereço antigo sem coordenada não salva até marcar o pino", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing([storeAddress("a1", { isDefault: true })]);

      await save(result, formData());
      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();

      placePin(result);
      await save(result, formData());
      expect(api.address.updateCompanyAddress.mock.calls[0][1]).toMatchObject({
        latitude: -25.44,
        longitude: -49.29,
      });
    });
  });

  describe("CEP", () => {
    it("formatZipCode aplica a máscara e corta no tamanho", async () => {
      const { result } = await renderCompany();

      expect(result.current.formatZipCode("80020310")).toBe("80020-310");
      expect(result.current.formatZipCode("800203109")).toBe("80020-310");
      expect(result.current.formatZipCode("800")).toBe("800");
    });
  });

  describe("validação de senha", () => {
    it("aponta cada regra que falta", async () => {
      const { result } = await renderCompany();

      act(() => result.current.updatePasswordField("newPassword", "abc"));

      expect(result.current.passwordErrors).toEqual([
        "mínimo 6 caracteres",
        "1 letra maiúscula",
        "1 símbolo",
      ]);
    });

    it.each([
      [{ currentPassword: "", newPassword: "Nova@1", confirmPassword: "Nova@1" }, "Preencha todos os campos de senha"],
      [{ currentPassword: "Velha@1", newPassword: "fraca", confirmPassword: "fraca" }, "Senha fraca: mínimo 6 caracteres, 1 letra maiúscula, 1 símbolo"],
      [{ currentPassword: "Velha@1", newPassword: "Nova@1", confirmPassword: "Nova@2" }, "As senhas não coincidem"],
    ])("%o é barrado", async (data, message) => {
      const { result } = await renderCompany();
      act(() => {
        for (const [field, value] of Object.entries(data)) {
          result.current.updatePasswordField(field as never, value);
        }
      });

      await act(async () => {
        await result.current.handleChangePassword();
      });

      expect(toast.error).toHaveBeenCalledWith(message);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("senha válida avisa que a troca não está disponível, sem fingir sucesso", async () => {
      const { result } = await renderCompany();
      act(() => {
        result.current.setIsChangingPassword(true);
        result.current.updatePasswordField("currentPassword", "Velha@1");
        result.current.updatePasswordField("newPassword", "Nova@1");
        result.current.updatePasswordField("confirmPassword", "Nova@1");
      });

      await act(async () => {
        await result.current.handleChangePassword();
      });

      expect(toast.error).toHaveBeenCalledWith(
        "A troca de senha ainda não está disponível. Sua senha não foi alterada.",
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(result.current.isChangingPassword).toBe(true);
      expect(result.current.passwordData.newPassword).toBe("Nova@1");
    });
  });
});
