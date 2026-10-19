import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { geocodeAddress } from "@/lib/geocode";
import { apiService, type Address } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useCompanyProfileManagement } from "./use-company-profile-management";

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/geocode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geocode")>();
  return { ...actual, geocodeAddress: vi.fn() };
});

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

const addressForm = {
  zipCode: "80420-000",
  state: "PR",
  city: "Curitiba",
  neighborhood: "Batel",
  street: "Av. Sete",
  number: "700",
};

let serverAddresses: Address[] = [];

const initialAuthState = useAuthStore.getState();

async function renderCompany() {
  const hook = renderHook(() => useCompanyProfileManagement());
  await waitFor(() => {
    expect(hook.result.current.isLoadingProfile).toBe(false);
    expect(hook.result.current.isLoadingAddresses).toBe(false);
  });
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderCompany>>["result"];

function fillAddress(result: Hook, fields: Record<string, string | boolean>) {
  act(() => {
    for (const [key, value] of Object.entries(fields)) {
      result.current.updateAddressField(key as never, value);
    }
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
    vi.mocked(geocodeAddress).mockResolvedValue({ lat: -25.44, lng: -49.28 });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("carga", () => {
    it("sem login, depois de hidratar, manda abrir o login", async () => {
      useAuthStore.setState({ ...initialAuthState, _hasHydrated: true }, true);

      renderHook(() => useCompanyProfileManagement());

      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/?openAuth=true"));
    });

    it("antes de hidratar, nem busca nem redireciona", async () => {
      useAuthStore.setState({ ...initialAuthState, _hasHydrated: false }, true);

      const { result } = renderHook(() => useCompanyProfileManagement());

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

  describe("novo endereço", () => {
    it("exige os campos obrigatórios", async () => {
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, number: "" });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(toast.error).toHaveBeenCalledWith("Preencha todos os campos obrigatórios do endereço");
      expect(api.address.createCompanyAddress).not.toHaveBeenCalled();
    });

    it("sai com CEP limpo, coordenada geocodificada e sem textos opcionais vazios", async () => {
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      act(() => result.current.setIsAddingAddress(true));
      fillAddress(result, { ...addressForm, complement: "  ", reference: "Ao lado do mercado" });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.createCompanyAddress).toHaveBeenCalledWith({
        ...addressForm,
        zipCode: "80420000",
        complement: undefined,
        reference: "Ao lado do mercado",
        isDefault: false,
        latitude: -25.44,
        longitude: -49.28,
      });
      expect(toast.success).toHaveBeenCalledWith("Endereço adicionado com sucesso!");
      expect(result.current.isAddingAddress).toBe(false);
      expect(result.current.newAddress.street).toBe("");
    });

    it("sem localização no mapa, salva sem coordenada e avisa", async () => {
      vi.mocked(geocodeAddress).mockResolvedValue(null);
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      fillAddress(result, addressForm);

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      const payload = api.address.createCompanyAddress.mock.calls[0][0];
      expect(payload).not.toHaveProperty("latitude");
      expect(toast.warning).toHaveBeenCalledWith(
        "Nao localizamos esse endereço no mapa",
        expect.objectContaining({ duration: 6000 }),
      );
    });

    it("como padrão, desmarca o padrão antigo mandando só a flag", async () => {
      serverAddresses = [
        storeAddress("antigo", { isDefault: true, complement: "Loja 2", latitude: -25.1, longitude: -49.1 }),
        storeAddress("outro"),
      ];
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, isDefault: true });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.updateCompanyAddress).toHaveBeenCalledTimes(1);
      expect(api.address.updateCompanyAddress).toHaveBeenCalledWith("antigo", { isDefault: false });
      expect(api.address.createCompanyAddress.mock.calls[0][0].isDefault).toBe(true);
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("se só a flag for recusada, tenta de novo sem reenviar CEP incompleto nem complemento", async () => {
      serverAddresses = [
        storeAddress("antigo", { isDefault: true, zipCode: "8000", complement: "301", reference: "Bar" }),
      ];
      api.address.updateCompanyAddress
        .mockResolvedValueOnce({ success: false, message: "recusado" })
        .mockResolvedValueOnce({ success: true });
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, isDefault: true });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.updateCompanyAddress).toHaveBeenCalledTimes(2);
      const retry = api.address.updateCompanyAddress.mock.calls[1][1];
      expect(retry).toMatchObject({ isDefault: false, street: "Rua A", number: "10" });
      expect(retry.zipCode).toBeUndefined();
      expect(retry.complement).toBeUndefined();
      expect(retry.reference).toBeUndefined();
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("endereço apagado (isActive: false) não é desmarcado", async () => {
      serverAddresses = [storeAddress("apagado", { isDefault: true, isActive: false })];
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, isDefault: true });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();
    });

    it("se não desmarcar o antigo, salva e avisa", async () => {
      serverAddresses = [storeAddress("antigo", { isDefault: true })];
      api.address.updateCompanyAddress.mockResolvedValue({ success: false });
      api.address.createCompanyAddress.mockResolvedValue({ success: true, data: storeAddress("novo") });
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, isDefault: true });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(toast.success).toHaveBeenCalledWith("Endereço adicionado com sucesso!");
      expect(toast.warning).toHaveBeenCalledWith(
        "Não conseguimos desmarcar todos os endereços padrão antigos. Confira a lista de endereços.",
      );
    });

    it("como padrão, desmarca o antigo só depois de criar, e nunca o recém-criado", async () => {
      serverAddresses = [storeAddress("antigo", { isDefault: true })];
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      api.address.createCompanyAddress.mockImplementation(async () => {
        // A listagem depois de criar já traz o novo como padrão.
        serverAddresses = [...serverAddresses, storeAddress("novo", { isDefault: true })];
        return { success: true, data: storeAddress("novo", { isDefault: true }) };
      });
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, isDefault: true });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.createCompanyAddress.mock.invocationCallOrder[0]).toBeLessThan(
        api.address.updateCompanyAddress.mock.invocationCallOrder[0],
      );
      expect(api.address.updateCompanyAddress.mock.calls.map(([id]) => id)).toEqual(["antigo"]);
    });

    it("criação recusada não mexe no padrão atual", async () => {
      serverAddresses = [storeAddress("antigo", { isDefault: true })];
      api.address.createCompanyAddress.mockResolvedValue({ success: false, message: "CEP inválido" });
      const { result } = await renderCompany();
      fillAddress(result, { ...addressForm, isDefault: true });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("CEP inválido");
    });

    it("recusa do backend mantém o formulário aberto", async () => {
      api.address.createCompanyAddress.mockResolvedValue({ success: false, message: "CEP inválido" });
      const { result } = await renderCompany();
      act(() => result.current.setIsAddingAddress(true));
      fillAddress(result, addressForm);

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(toast.error).toHaveBeenCalledWith("CEP inválido");
      expect(result.current.isAddingAddress).toBe(true);
      expect(result.current.newAddress.street).toBe("Av. Sete");
    });
  });

  describe("editar endereço", () => {
    async function editing(address: Address) {
      serverAddresses = [address];
      const hook = await renderCompany();
      act(() => hook.result.current.handleEditAddress(hook.result.current.addresses[0]));
      return hook;
    }

    it("abre o formulário com o endereço e salva por PATCH no mesmo id", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing(storeAddress("a1", { complement: "Loja 2" }));

      expect(result.current.editingAddressId).toBe("a1");
      expect(result.current.isAddingAddress).toBe(true);
      expect(result.current.newAddress).toMatchObject({ street: "Rua A", complement: "Loja 2" });

      fillAddress(result, { number: "12" });
      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.updateCompanyAddress).toHaveBeenCalledWith(
        "a1",
        expect.objectContaining({ number: "12", complement: "Loja 2", latitude: -25.44 }),
      );
      expect(api.address.createCompanyAddress).not.toHaveBeenCalled();
      expect(result.current.editingAddressId).toBeNull();
    });

    it.each([
      ["complement", "Sl 2", "Complemento deve ter pelo menos 5 caracteres (ou ficar vazio)"],
      ["reference", "Bar", "Referência deve ter pelo menos 5 caracteres (ou ficar vazia)"],
    ])("%s novo curto é barrado antes do PATCH", async (field, value, message) => {
      const { result } = await editing(storeAddress("a1"));
      fillAddress(result, { [field]: value });

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(toast.error).toHaveBeenCalledWith(message);
      expect(api.address.updateCompanyAddress).not.toHaveBeenCalled();
    });

    it("complemento e referência curtos herdados e intocados são omitidos do PATCH", async () => {
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await editing(storeAddress("a1", { complement: "301", reference: "Bar" }));

      await act(async () => {
        await result.current.handleSaveAddress();
      });

      const payload = api.address.updateCompanyAddress.mock.calls[0][1];
      expect(payload.complement).toBeUndefined();
      expect(payload.reference).toBeUndefined();
    });

    it("virar padrão desmarca os outros padrões, não ele mesmo", async () => {
      serverAddresses = [storeAddress("a1", { isDefault: true }), storeAddress("a2", { isDefault: true })];
      api.address.updateCompanyAddress.mockResolvedValue({ success: true });
      const hook = await renderCompany();
      act(() => hook.result.current.handleEditAddress(hook.result.current.addresses[0]));

      await act(async () => {
        await hook.result.current.handleSaveAddress();
      });

      // Salva primeiro; só então desmarca o outro padrão.
      const ids = api.address.updateCompanyAddress.mock.calls.map(([id]) => id);
      expect(ids).toEqual(["a1", "a2"]);
    });

    it("edição recusada não desmarca o outro padrão", async () => {
      serverAddresses = [storeAddress("a1"), storeAddress("a2", { isDefault: true })];
      api.address.updateCompanyAddress.mockResolvedValue({ success: false, message: "complement too short" });
      const hook = await renderCompany();
      act(() => hook.result.current.handleEditAddress(hook.result.current.addresses[0]));
      fillAddress(hook.result, { isDefault: true });

      await act(async () => {
        await hook.result.current.handleSaveAddress();
      });

      expect(api.address.updateCompanyAddress.mock.calls.map(([id]) => id)).toEqual(["a1"]);
    });

    it("cancelar limpa a edição", async () => {
      const { result } = await editing(storeAddress("a1"));

      act(() => result.current.handleCancelAddressEdit());

      expect(result.current.editingAddressId).toBeNull();
      expect(result.current.isAddingAddress).toBe(false);
      expect(result.current.newAddress.street).toBe("");
    });
  });

  describe("excluir endereço", () => {
    it("confirmado, remove e tira da lista", async () => {
      serverAddresses = [storeAddress("a1"), storeAddress("a2")];
      api.address.deleteCompanyAddress.mockResolvedValue({ success: true });
      const { result } = await renderCompany();

      await act(async () => {
        await result.current.handleDeleteAddress("a1");
      });

      expect(api.address.deleteCompanyAddress).toHaveBeenCalledWith("a1");
      expect(result.current.addresses.map((a) => a.id)).toEqual(["a2"]);
    });

    it("sem confirmação não chama a API", async () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      const { result } = await renderCompany();

      await act(async () => {
        await result.current.handleDeleteAddress("a1");
      });

      expect(api.address.deleteCompanyAddress).not.toHaveBeenCalled();
    });

    it("recusa mantém na lista", async () => {
      serverAddresses = [storeAddress("a1")];
      api.address.deleteCompanyAddress.mockResolvedValue({ success: false, message: "Endereço padrão" });
      const { result } = await renderCompany();

      await act(async () => {
        await result.current.handleDeleteAddress("a1");
      });

      expect(toast.error).toHaveBeenCalledWith("Endereço padrão");
      expect(result.current.addresses).toHaveLength(1);
    });
  });

  describe("CEP", () => {
    // Respostas reais da BrasilAPI v2 (medidas em 17/10): cidade de CEP
    // único volta com rua e bairro null.
    const brasilApi = (body: Record<string, unknown>, status = 200) =>
      vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      });
    const castelo = {
      cep: "29360000",
      state: "ES",
      city: "Castelo",
      neighborhood: null,
      street: null,
      location: { type: "Point", coordinates: { longitude: "-41.18472", latitude: "-20.60361" } },
    };
    const alegre = {
      cep: "29500000",
      state: "ES",
      city: "Alegre",
      neighborhood: null,
      street: null,
      location: { type: "Point", coordinates: { longitude: "-41.53306", latitude: "-20.76361" } },
    };

    async function searchZipCode(result: Hook, zipCode: string) {
      await act(async () => {
        await result.current.handleSearchZipCode(zipCode);
      });
    }

    it("CEP com rua busca na BrasilAPI e preenche tudo", async () => {
      const fetchMock = brasilApi({
        cep: "80020310",
        state: "PR",
        city: "Curitiba",
        neighborhood: "Centro",
        street: "Rua XV de Novembro",
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderCompany();

      await searchZipCode(result, "80020-310");

      expect(fetchMock).toHaveBeenCalledWith("https://brasilapi.com.br/api/cep/v2/80020310");
      expect(result.current.newAddress).toMatchObject({
        zipCode: "80020310",
        street: "Rua XV de Novembro",
        neighborhood: "Centro",
        city: "Curitiba",
        state: "PR",
      });
      expect(result.current.zipCodeHint).toBeNull();
      expect(toast.success).toHaveBeenCalledWith("CEP encontrado!");
    });

    it.each([
      ["29360000", "Castelo", castelo],
      ["29500000", "Alegre", alegre],
    ])(
      "CEP único %s (%s) depois de digitar rua e bairro não apaga nada",
      async (zipCode, city, body) => {
        vi.stubGlobal("fetch", brasilApi(body));
        const { result } = await renderCompany();
        fillAddress(result, { street: "Rua Projetada", number: "45", neighborhood: "Centro" });

        fillAddress(result, { zipCode });
        await searchZipCode(result, zipCode);

        expect(result.current.newAddress).toMatchObject({
          zipCode,
          street: "Rua Projetada",
          number: "45",
          neighborhood: "Centro",
          city,
          state: "ES",
        });
        expect(result.current.zipCodeHint).toBe(
          "Este CEP vale para a cidade inteira. Preencha rua, número e bairro abaixo.",
        );
        expect(toast.success).toHaveBeenCalledWith(
          "CEP da cidade encontrado. Preencha rua, número e bairro.",
        );
      },
    );

    it("CEP único antes de digitar: rua e bairro ficam vazios para preencher e o endereço sai completo", async () => {
      vi.stubGlobal("fetch", brasilApi(castelo));
      api.address.createCompanyAddress.mockResolvedValue({
        success: true,
        data: storeAddress("novo"),
      } as never);
      const { result } = await renderCompany();

      fillAddress(result, { zipCode: "29360000" });
      await searchZipCode(result, "29360000");
      expect(result.current.newAddress).toMatchObject({ street: "", neighborhood: "", city: "Castelo", state: "ES" });

      fillAddress(result, { street: "Rua Projetada", number: "45", neighborhood: "Centro" });
      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.createCompanyAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          zipCode: "29360000",
          street: "Rua Projetada",
          number: "45",
          neighborhood: "Centro",
          city: "Castelo",
          state: "ES",
        }),
      );
    });

    it("CEP sem bairro mantém o bairro digitado e pede só o bairro", async () => {
      vi.stubGlobal(
        "fetch",
        brasilApi({ cep: "29360001", state: "ES", city: "Castelo", neighborhood: null, street: "Rua Nova" }),
      );
      const { result } = await renderCompany();
      fillAddress(result, { neighborhood: "Aracui" });

      await searchZipCode(result, "29360001");

      expect(result.current.newAddress).toMatchObject({ street: "Rua Nova", neighborhood: "Aracui" });
      expect(result.current.zipCodeHint).toBe("Este CEP não traz o bairro. Preencha o bairro abaixo.");
    });

    it("busca falhou: não apaga nada, avisa e o endereço preenchido à mão salva", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
      api.address.createCompanyAddress.mockResolvedValue({
        success: true,
        data: storeAddress("novo"),
      } as never);
      const { result } = await renderCompany();
      fillAddress(result, { street: "Rua Projetada", number: "45", neighborhood: "Centro" });

      fillAddress(result, { zipCode: "29360000" });
      await searchZipCode(result, "29360000");

      expect(result.current.newAddress).toMatchObject({
        street: "Rua Projetada",
        neighborhood: "Centro",
        city: "",
        state: "",
      });
      expect(result.current.isSearchingZipCode).toBe(false);
      expect(result.current.zipCodeHint).toBe(
        "Não conseguimos consultar o CEP agora. Preencha cidade, UF, rua, número e bairro à mão.",
      );
      expect(toast.error).toHaveBeenCalledWith("Erro ao buscar CEP. Preencha o endereço à mão.");

      fillAddress(result, { city: "Castelo", state: "ES" });
      await act(async () => {
        await result.current.handleSaveAddress();
      });

      expect(api.address.createCompanyAddress).toHaveBeenCalledWith(
        expect.objectContaining({ zipCode: "29360000", city: "Castelo", state: "ES", street: "Rua Projetada" }),
      );
    });

    it("resposta fora do ar (500) também vira preenchimento manual", async () => {
      vi.stubGlobal("fetch", brasilApi({}, 500));
      const { result } = await renderCompany();
      fillAddress(result, { city: "Castelo", state: "ES" });

      await searchZipCode(result, "29360000");

      expect(result.current.newAddress).toMatchObject({ city: "Castelo", state: "ES" });
      expect(result.current.zipCodeHint).toMatch(/Preencha cidade, UF/);
    });

    it("CEP inexistente avisa sem apagar", async () => {
      vi.stubGlobal("fetch", brasilApi({ message: "CEP não encontrado" }, 404));
      const { result } = await renderCompany();
      fillAddress(result, { street: "Rua Projetada" });

      await searchZipCode(result, "99999998");

      expect(toast.error).toHaveBeenCalledWith("CEP não encontrado");
      expect(result.current.newAddress.street).toBe("Rua Projetada");
      expect(result.current.zipCodeHint).toMatch(/^CEP não encontrado/);
    });

    it("trocar o CEP limpa o aviso anterior", async () => {
      vi.stubGlobal("fetch", brasilApi(castelo));
      const { result } = await renderCompany();
      await searchZipCode(result, "29360000");
      expect(result.current.zipCodeHint).not.toBeNull();

      fillAddress(result, { zipCode: "2936" });

      expect(result.current.zipCodeHint).toBeNull();
    });

    it("CEP incompleto não busca", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderCompany();

      await act(async () => {
        await result.current.handleSearchZipCode("8002");
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

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
