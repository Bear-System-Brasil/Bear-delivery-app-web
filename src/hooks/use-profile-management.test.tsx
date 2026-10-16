import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  restorePendingDefaultAddress,
  setDefaultAddress,
} from "@/lib/default-address";
import { nominatim } from "@/lib/nominatim";
import { apiService, type Address } from "@/services/api";
import { getNeighborhoods } from "@/services/neighborhoods";
import { useAuthStore } from "@/stores";
import type { AddressFormData } from "./use-form-validation";
import { useProfileManagement } from "./use-profile-management";

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/services/neighborhoods", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/neighborhoods")>();
  return { ...actual, getNeighborhoods: vi.fn(actual.getNeighborhoods) };
});

vi.mock("@/lib/default-address", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/default-address")>();
  return {
    ...actual,
    setDefaultAddress: vi.fn(),
    restorePendingDefaultAddress: vi.fn(),
  };
});

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      getMe: vi.fn(),
      updateUser: vi.fn(),
      address: {
        getUserAddresses: vi.fn(),
        createUserAddress: vi.fn(),
        updateUserAddress: vi.fn(),
        deleteUserAddress: vi.fn(),
      },
    },
  };
});

const api = vi.mocked(apiService, true);

const user = {
  id: "user-1",
  name: "Ana",
  email: "ana@example.com",
  cpf: "12345678900",
  phone: "41999990000",
  birthDate: "1990-01-01",
  role: "client",
};

const stored = (id: string, extra: Partial<Address> = {}) =>
  ({
    id,
    street: "Rua A",
    number: "10",
    complement: "",
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    zipCode: "80000000",
    isDefault: false,
    latitude: -25.1,
    longitude: -49.1,
    ...extra,
  }) as Address;

const formData = (extra: Partial<AddressFormData> = {}): AddressFormData => ({
  street: "Rua Nova",
  number: "200",
  complement: "",
  neighborhood: "Batel",
  city: "Curitiba",
  state: "PR",
  zipCode: "80420-000",
  isDefault: false,
  ...extra,
});

const { getNeighborhoods: realGetNeighborhoods } = await vi.importActual<
  typeof import("@/services/neighborhoods")
>("@/services/neighborhoods");

const PIN = { lat: -25.44, lng: -49.29 };
// `center` de es-castelo.json (média dos 32 bairros).
const CASTELO_CENTER = { lat: -20.6153082, lng: -41.2063262 };

// Todos os bairros da lista real têm coordenada; o caso "bairro sem
// coordenada" usa uma lista simulada com o mesmo center.
const UNPINNED = "Bairro Sem Ponto";
const LIST_WITH_UNPINNED = {
  state: "ES",
  city: "Castelo",
  ibgeCode: null,
  cep: null,
  center: CASTELO_CENTER,
  neighborhoods: [
    { name: "Centro", lat: -20.6030775, lng: -41.2051535 },
    { name: UNPINNED, lat: null, lng: null },
  ],
};

/** Resultado do Nominatim dentro (ou fora) de Castelo/ES. */
const nominatimHit = (lat: string, lon: string, town = "Castelo") => [
  { lat, lon, address: { town, "ISO3166-2-lvl4": "BR-ES" } },
];

function stubNominatim(results: unknown[]) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => results }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const nominatimCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.hostname === "nominatim.openstreetmap.org");

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;
let savedAddresses: Address[] = [];

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderProfile() {
  const hook = renderHook(() => useProfileManagement(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoadingAddresses).toBe(false));
  return hook;
}

type ProfileHook = Awaited<ReturnType<typeof renderProfile>>["result"];

/** Cliente toca no mapa: é o que o salvar manda. */
function placePin(result: ProfileHook, coords = PIN) {
  act(() => result.current.applyCoords(coords, "manual"));
}

describe("useProfileManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedAddresses = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.setState(
      { ...initialAuthState, isAuthenticated: true, _hasHydrated: true, user },
      true,
    );
    api.getMe.mockResolvedValue({ success: true, data: user as never });
    api.address.getUserAddresses.mockImplementation(async () => ({
      success: true,
      data: savedAddresses,
    }));
    nominatim.reset();
    // mockResolvedValue de um teste não pode vazar para o próximo.
    vi.mocked(getNeighborhoods).mockImplementation(realGetNeighborhoods);
    vi.mocked(restorePendingDefaultAddress).mockResolvedValue(false);
    vi.mocked(setDefaultAddress).mockResolvedValue({ promoted: true, demotedAll: true });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  describe("acesso à tela", () => {
    it("sem login, depois de hidratar, manda para a home pedindo login", async () => {
      useAuthStore.setState({ ...initialAuthState, _hasHydrated: true }, true);

      renderHook(() => useProfileManagement(), { wrapper });

      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/?auth=required"));
    });

    it("antes de hidratar, não redireciona", async () => {
      useAuthStore.setState({ ...initialAuthState, _hasHydrated: false }, true);

      const { result } = renderHook(() => useProfileManagement(), { wrapper });

      await waitFor(() => expect(result.current.isMounted).toBe(true));
      expect(router.push).not.toHaveBeenCalled();
    });

    it("admin da empresa vai para o perfil da empresa, sem buscar /user/me", async () => {
      useAuthStore.setState(
        { ...initialAuthState, isAuthenticated: true, _hasHydrated: true, user: { ...user, role: "owner" } },
        true,
      );

      renderHook(() => useProfileManagement(), { wrapper });

      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/company-profile"));
      expect(api.getMe).not.toHaveBeenCalled();
    });

    it("cliente fica e carrega /user/me no store", async () => {
      api.getMe.mockResolvedValue({ success: true, data: { ...user, name: "Ana Maria" } as never });

      await renderProfile();

      await waitFor(() => expect(useAuthStore.getState().user?.name).toBe("Ana Maria"));
      expect(router.push).not.toHaveBeenCalled();
    });

    it("falha no /user/me vira profileError", async () => {
      api.getMe.mockResolvedValue({ success: false, message: "Sessão expirada" });

      const { result } = await renderProfile();

      await waitFor(() => expect(result.current.profileError).toBe("Sessão expirada"));
    });
  });

  describe("perfil", () => {
    it("salvar manda apenas campos modificados sem email/id, atualiza o store e fecha a edição", async () => {
      api.updateUser.mockResolvedValue({ success: true, data: user as never });
      const { result } = await renderProfile();
      act(() => result.current.editingState.open());

      const data = { name: "Ana Paula", email: user.email, cpf: user.cpf, phone: "41988887777", birthDate: user.birthDate };
      await act(async () => {
        await result.current.handleSaveProfile(data);
      });

      expect(api.updateUser).toHaveBeenCalledWith({
        name: "Ana Paula",
        phone: "41988887777",
        birthDate: user.birthDate,
      });
      expect(useAuthStore.getState().user).toMatchObject({ name: "Ana Paula", phone: "41988887777" });
      expect(result.current.editingState.isOpen).toBe(false);
      expect(toast.success).toHaveBeenCalledWith("Perfil atualizado com sucesso!");
    });

    it("salvar perfil com dados inalterados não envia email, cpf nem phone", async () => {
      api.updateUser.mockResolvedValue({ success: true, data: user as never });
      const { result } = await renderProfile();
      act(() => result.current.editingState.open());

      const data = { name: "Ana Paula", email: user.email, cpf: user.cpf, phone: user.phone, birthDate: user.birthDate };
      await act(async () => {
        await result.current.handleSaveProfile(data);
      });

      expect(api.updateUser).toHaveBeenCalledWith({
        name: "Ana Paula",
        birthDate: user.birthDate,
      });
      expect(result.current.editingState.isOpen).toBe(false);
    });

    it("recusa do backend não salva no store e mostra a razão", async () => {
      api.updateUser.mockResolvedValue({ success: false, message: "E-mail já cadastrado" });
      const { result } = await renderProfile();
      act(() => result.current.editingState.open());

      await act(async () => {
        await result.current.handleSaveProfile({ ...user, name: "Outro Nome" });
      });

      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("E-mail já cadastrado");
      expect(useAuthStore.getState().user?.name).toBe("Ana");
      expect(result.current.editingState.isOpen).toBe(true);
      await waitFor(() => expect(result.current.updateProfile.isError).toBe(true));
    });

    it("exceção ao salvar avisa erro e mantém a edição aberta", async () => {
      api.updateUser.mockRejectedValue(new Error("offline"));
      const { result } = await renderProfile();
      act(() => result.current.editingState.open());

      await act(async () => {
        await result.current.handleSaveProfile({ ...user });
      });

      expect(toast.error).toHaveBeenCalledWith("offline");
      expect(result.current.editingState.isOpen).toBe(true);
    });

    it("trocar a foto atualiza só a foto no store", async () => {
      const { result } = await renderProfile();

      act(() => result.current.handleUpdatePhoto("https://r2.test/foto.jpg"));

      expect(useAuthStore.getState().user).toMatchObject({
        name: "Ana",
        photoUrl: "https://r2.test/foto.jpg",
      });
    });
  });

  describe("recarregar a página", () => {
    // F5: o hook monta com o store ainda vazio e o persist hidrata depois
    function renderBeforeHydration() {
      useAuthStore.setState({ ...initialAuthState }, true);
      const hook = renderHook(() => useProfileManagement(), { wrapper });
      act(() => {
        useAuthStore.setState({ isAuthenticated: true, _hasHydrated: true, user });
      });
      return hook;
    }

    it("preenche o formulário quando o usuário hidrata depois da montagem", async () => {
      const { result } = renderBeforeHydration();

      await waitFor(() =>
        expect(result.current.profileForm.getValues()).toMatchObject({
          name: "Ana",
          email: "ana@example.com",
          cpf: "12345678900",
          phone: "41999990000",
          // O campo do perfil usa a máscara dd/mm/aaaa do cadastro (LDMF-303)
          birthDate: "01/01/1990",
        }),
      );
    });

    it("cancelar a edição volta para os dados carregados, não para vazio", async () => {
      const { result } = renderBeforeHydration();
      await waitFor(() => expect(result.current.profileForm.getValues("name")).toBe("Ana"));

      act(() => {
        result.current.editingState.open();
        result.current.profileForm.setValue("name", "Rascunho");
      });
      act(() => result.current.handleCancelEdit());

      expect(result.current.profileForm.getValues("name")).toBe("Ana");
    });

    it("não apaga o que o usuário está digitando quando o perfil chega do backend", async () => {
      let resolveMe: (value: unknown) => void = () => {};
      api.getMe.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)) as never);
      const { result } = await renderProfile();

      act(() => {
        result.current.editingState.open();
        result.current.profileForm.setValue("name", "Rascunho", { shouldDirty: true });
      });
      await act(async () => {
        resolveMe({ success: true, data: { ...user, phone: "41911112222" } });
      });

      await waitFor(() =>
        expect(useAuthStore.getState().user?.phone).toBe("41911112222"),
      );
      expect(result.current.profileForm.getValues("name")).toBe("Rascunho");
    });

    it("carrega os endereços quando o usuário hidrata depois da montagem", async () => {
      savedAddresses = [stored("a1", { isDefault: true })];
      const { result } = renderBeforeHydration();

      await waitFor(() => expect(result.current.addresses).toHaveLength(1));
      expect(result.current.addresses[0]).toMatchObject({ id: "a1", street: "Rua A" });
    });
  });

  describe("salvar endereço", () => {
    it("novo endereço sai com todos os campos, CEP só com dígitos e exatamente a posição do pino", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderProfile();
      placePin(result);

      await act(async () => {
        await result.current.handleAddAddress(formData({ complement: "Casa 2" }));
      });

      expect(api.address.createUserAddress).toHaveBeenCalledWith({
        street: "Rua Nova",
        number: "200",
        complement: "Casa 2",
        neighborhood: "Batel",
        city: "Curitiba",
        state: "PR",
        zipCode: "80420000",
        latitude: -25.44,
        longitude: -49.29,
        isDefault: false,
      });
      expect(toast.success).toHaveBeenCalledWith("Endereço adicionado com sucesso!");
      expect(setDefaultAddress).not.toHaveBeenCalled();
      // Nenhuma geocodificação escondida no salvar.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("complemento vazio sai como undefined", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const { result } = await renderProfile();
      placePin(result);

      await act(async () => {
        await result.current.handleAddAddress(formData({ complement: "" }));
      });

      expect(api.address.createUserAddress.mock.calls[0][0].complement).toBeUndefined();
    });

    it("sem pino no mapa, não salva e avisa", async () => {
      const { result } = await renderProfile();
      act(() => result.current.addingAddressState.open());

      await act(async () => {
        await result.current.handleAddAddress(formData());
      });

      expect(api.address.createUserAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Marque no mapa onde fica o endereço antes de salvar.",
      );
      expect(result.current.addingAddressState.isOpen).toBe(true);
    });

    it("pino arrastado depois de uma busca: salva a posição final do pino", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const { result } = await renderProfile();
      placePin(result, { lat: -20.6, lng: -41.2 });
      placePin(result, { lat: -20.61, lng: -41.21 });

      await act(async () => {
        await result.current.handleAddAddress(formData());
      });

      expect(api.address.createUserAddress.mock.calls[0][0]).toMatchObject({
        latitude: -20.61,
        longitude: -41.21,
      });
    });

    it("novo endereço marcado como padrão promove o id que o backend devolveu", async () => {
      savedAddresses = [stored("antigo", { isDefault: true }), stored("novo")];
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const { result } = await renderProfile();
      placePin(result);

      await act(async () => {
        await result.current.handleAddAddress(formData({ isDefault: true }));
      });

      expect(api.address.createUserAddress.mock.calls[0][0].isDefault).toBe(true);
      expect(setDefaultAddress).toHaveBeenCalledWith(savedAddresses, "novo");
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("se não conseguir desmarcar o padrão antigo, salva e avisa", async () => {
      vi.mocked(setDefaultAddress).mockResolvedValue({ promoted: true, demotedAll: false });
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const { result } = await renderProfile();
      placePin(result);

      await act(async () => {
        await result.current.handleAddAddress(formData({ isDefault: true }));
      });

      expect(toast.success).toHaveBeenCalledWith("Endereço adicionado com sucesso!");
      expect(toast.warning).toHaveBeenCalledWith(
        "Não conseguimos desmarcar todos os endereços padrão antigos. Confira sua lista de endereços.",
      );
    });

    it("salvamento recusado não mexe no padrão e mantém o formulário aberto", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: false, message: "CEP inválido" });
      const { result } = await renderProfile();
      placePin(result);
      act(() => result.current.addingAddressState.open());

      await act(async () => {
        await result.current.handleAddAddress(formData({ isDefault: true }));
      });

      expect(setDefaultAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("CEP inválido");
      expect(result.current.addingAddressState.isOpen).toBe(true);
      expect(result.current.isSavingAddress).toBe(false);
    });

    it("sucesso fecha o formulário e recarrega a lista", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const { result } = await renderProfile();
      placePin(result);
      act(() => result.current.addingAddressState.open());
      const calls = api.address.getUserAddresses.mock.calls.length;

      await act(async () => {
        await result.current.handleAddAddress(formData());
      });

      expect(result.current.addingAddressState.isOpen).toBe(false);
      await waitFor(() =>
        expect(api.address.getUserAddresses.mock.calls.length).toBeGreaterThan(calls),
      );
    });

    it("exceção ao salvar avisa erro genérico", async () => {
      api.address.createUserAddress.mockRejectedValue(new Error("offline"));
      const { result } = await renderProfile();
      placePin(result);

      await act(async () => {
        await result.current.handleAddAddress(formData());
      });

      expect(toast.error).toHaveBeenCalledWith("Erro ao adicionar endereço");
      expect(result.current.isSavingAddress).toBe(false);
    });

    it("marca isDefault como true automaticamente ao abrir o formulário se o usuário não tem endereço padrão", async () => {
      savedAddresses = [];
      const { result } = await renderProfile();

      expect(result.current.addressForm.getValues("isDefault")).toBeFalsy();

      act(() => {
        result.current.addingAddressState.open();
      });

      expect(result.current.addressForm.getValues("isDefault")).toBe(true);
    });

    it("define isDefault como true no payload se o usuário não tem endereço padrão e não especificou isDefault", async () => {
      savedAddresses = [];
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const { result } = await renderProfile();
      placePin(result);

      await act(async () => {
        const data = formData();
        delete (data as { isDefault?: boolean }).isDefault;
        await result.current.handleAddAddress(data);
      });

      expect(api.address.createUserAddress.mock.calls[0][0].isDefault).toBe(true);
    });
  });

  describe("editar endereço", () => {
    async function editing(address: Address) {
      savedAddresses = [address];
      const hook = await renderProfile();
      await waitFor(() => expect(hook.result.current.addresses).toHaveLength(1));
      act(() => hook.result.current.handleEditAddress(hook.result.current.addresses[0]));
      return hook;
    }

    it("abre o formulário preenchido e salva por PATCH no mesmo id", async () => {
      api.address.updateUserAddress.mockResolvedValue({ success: true });
      const { result } = await editing(stored("a1", { complement: "Bloco B" }));

      expect(result.current.addingAddressState.isOpen).toBe(true);
      expect(result.current.editingAddressId).toBe("a1");
      expect(result.current.addressForm.getValues()).toMatchObject({
        street: "Rua A",
        complement: "Bloco B",
        zipCode: "80000000",
      });

      await act(async () => {
        await result.current.handleAddAddress(formData({ complement: "Bloco B" }));
      });

      expect(api.address.updateUserAddress).toHaveBeenCalledWith(
        "a1",
        expect.objectContaining({ complement: "Bloco B", street: "Rua Nova" }),
      );
      expect(api.address.createUserAddress).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Endereço atualizado com sucesso!");
    });

    it("complemento novo com menos de 5 caracteres é barrado antes do PATCH", async () => {
      const { result } = await editing(stored("a1", { complement: "" }));

      await act(async () => {
        await result.current.handleAddAddress(formData({ complement: "301" }));
      });

      expect(api.address.updateUserAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Complemento deve ter pelo menos 5 caracteres (ou ficar vazio)",
      );
    });

    it("complemento curto herdado e intocado é omitido do PATCH", async () => {
      api.address.updateUserAddress.mockResolvedValue({ success: true });
      const { result } = await editing(stored("a1", { complement: "301" }));

      await act(async () => {
        await result.current.handleAddAddress(formData({ complement: "301" }));
      });

      expect(api.address.updateUserAddress).toHaveBeenCalled();
      expect(api.address.updateUserAddress.mock.calls[0][1].complement).toBeUndefined();
    });

    it("endereço editado como padrão promove o próprio id", async () => {
      api.address.updateUserAddress.mockResolvedValue({ success: true });
      const { result } = await editing(stored("a1"));

      await act(async () => {
        await result.current.handleAddAddress(formData({ isDefault: true }));
      });

      expect(setDefaultAddress).toHaveBeenCalledWith(expect.any(Array), "a1");
    });

    it("o pino abre na coordenada salva e o PATCH a reenvia se nada mudou", async () => {
      api.address.updateUserAddress.mockResolvedValue({ success: true });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await editing(stored("a1", { latitude: -25.1, longitude: -49.1 }));

      expect(result.current.addressCoords).toEqual({
        coords: { lat: -25.1, lng: -49.1 },
        source: "stored",
      });

      act(() => result.current.addressForm.setValue("complement", "Casa dos fundos"));
      await act(async () => {
        await result.current.handleAddAddress(
          formData({ street: "Rua A", number: "10", complement: "Casa dos fundos" }),
        );
      });

      expect(api.address.updateUserAddress.mock.calls[0][1]).toMatchObject({
        latitude: -25.1,
        longitude: -49.1,
      });
      // Abrir a edição e mudar só o complemento não busca nada no mapa.
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("mudar a rua faz nova busca; sem resultado, o pino fica onde estava", async () => {
      const fetchMock = stubNominatim([]);
      const { result } = await editing(
        stored("a1", { city: "Castelo", state: "ES", latitude: -20.6, longitude: -41.2 }),
      );

      act(() => result.current.addressForm.setValue("street", "Rua Trocada"));

      await waitFor(() => expect(nominatimCalls(fetchMock)).toHaveLength(1), { timeout: 3000 });
      await waitFor(() => expect(result.current.isLocatingPin).toBe(false));
      expect(result.current.addressCoords?.coords).toEqual({ lat: -20.6, lng: -41.2 });
    });

    it("PATCH recusado não promove o endereço a padrão", async () => {
      api.address.updateUserAddress.mockResolvedValue({ success: false, message: "complement too short" });
      const { result } = await editing(stored("a1"));

      await act(async () => {
        await result.current.handleAddAddress(formData({ isDefault: true }));
      });

      // Promover e depois falhar deixava o cliente sem padrão nenhum.
      expect(setDefaultAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("complement too short");
    });

    it("erro no PATCH usa a mensagem de atualização", async () => {
      api.address.updateUserAddress.mockResolvedValue({ success: false });
      const { result } = await editing(stored("a1"));

      await act(async () => {
        await result.current.handleAddAddress(formData());
      });

      expect(toast.error).toHaveBeenCalledWith("Erro ao atualizar endereço");
    });

    it("fechar o modal limpa o estado de edição", async () => {
      const { result } = await editing(stored("a1"));

      act(() => result.current.handleCloseAddressModal());

      expect(result.current.editingAddressId).toBeNull();
      expect(result.current.addressCoords).toBeNull();
      expect(result.current.addingAddressState.isOpen).toBe(false);
    });
  });

  describe("padrão direto da lista", () => {
    it("sucesso avisa e recarrega a lista", async () => {
      savedAddresses = [stored("a1"), stored("a2", { isDefault: true })];
      const { result } = await renderProfile();
      await waitFor(() => expect(result.current.addresses).toHaveLength(2));

      await act(async () => {
        await result.current.handleSetDefaultAddress("a1");
      });

      expect(setDefaultAddress).toHaveBeenCalledWith(savedAddresses, "a1");
      expect(toast.success).toHaveBeenCalledWith("Endereço padrão atualizado!");
      expect(result.current.settingDefaultAddressId).toBeNull();
    });

    it("recusa mostra a razão do backend", async () => {
      vi.mocked(setDefaultAddress).mockResolvedValue({
        promoted: false,
        demotedAll: false,
        message: "latitude must be a number",
      });
      const { result } = await renderProfile();

      await act(async () => {
        await result.current.handleSetDefaultAddress("a1");
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível definir este endereço como padrão: latitude must be a number",
      );
    });

    it("promovido sem desmarcar o anterior avisa os dois padrões", async () => {
      vi.mocked(setDefaultAddress).mockResolvedValue({ promoted: true, demotedAll: false });
      const { result } = await renderProfile();

      await act(async () => {
        await result.current.handleSetDefaultAddress("a1");
      });

      expect(toast.warning).toHaveBeenCalledWith(
        "Endereço marcado como padrão, mas não conseguimos desmarcar o anterior. Confira sua lista de endereços.",
      );
    });

    it("marca qual endereço está sendo promovido enquanto espera", async () => {
      vi.mocked(setDefaultAddress).mockReturnValue(new Promise(() => {}));
      const { result } = await renderProfile();

      act(() => {
        void result.current.handleSetDefaultAddress("a1");
      });

      expect(result.current.settingDefaultAddressId).toBe("a1");
    });
  });

  describe("excluir endereço", () => {
    it("sem confirmação, não chama a API", async () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      const { result } = await renderProfile();

      await act(async () => {
        await result.current.handleDeleteAddress("a1");
      });

      expect(api.address.deleteUserAddress).not.toHaveBeenCalled();
    });

    it("confirmado, exclui e avisa", async () => {
      api.address.deleteUserAddress.mockResolvedValue({ success: true });
      const { result } = await renderProfile();

      await act(async () => {
        await result.current.handleDeleteAddress("a1");
      });

      expect(api.address.deleteUserAddress).toHaveBeenCalledWith("a1");
      expect(toast.success).toHaveBeenCalledWith("Endereço excluído com sucesso!");
    });

    it("recusa mostra a mensagem do backend", async () => {
      api.address.deleteUserAddress.mockResolvedValue({ success: false, message: "Endereço em uso" });
      const { result } = await renderProfile();

      await act(async () => {
        await result.current.handleDeleteAddress("a1");
      });

      expect(toast.error).toHaveBeenCalledWith("Endereço em uso");
    });
  });

  describe("pino acompanha o preenchimento", () => {
    function fillCity(result: ProfileHook) {
      act(() => {
        result.current.addressForm.setValue("state", "ES");
        result.current.addressForm.setValue("city", "Castelo");
      });
    }

    it("trocar estado, cidade ou bairro limpa os campos seguintes e o pino", async () => {
      const { result } = await renderProfile();
      act(() => {
        result.current.changeState("ES");
        result.current.changeCity("Castelo");
        result.current.addressForm.setValue("neighborhood", "Centro");
        result.current.addressForm.setValue("street", "Rua Principal");
        result.current.addressForm.setValue("number", "45");
      });
      placePin(result);

      act(() => result.current.changeCity("Alegre"));

      expect(result.current.addressCoords).toBeNull();
      expect(result.current.addressForm.getValues()).toMatchObject({
        state: "ES",
        city: "Alegre",
        neighborhood: "",
        street: "",
        number: "",
      });
    });

    it("CEP de outra cidade limpa os campos seguintes e o pino", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ state: "ES", city: "Castelo", neighborhood: "", street: "" }),
        }),
      );
      const { result } = await renderProfile();
      act(() => {
        result.current.changeState("PR");
        result.current.changeCity("Curitiba");
        result.current.addressForm.setValue("neighborhood", "Batel");
        result.current.addressForm.setValue("street", "Rua Nova");
      });
      placePin(result);

      act(() => result.current.addressForm.setValue("zipCode", "29360-000"));

      await waitFor(() => expect(result.current.addressForm.getValues("city")).toBe("Castelo"));
      expect(result.current.addressForm.getValues()).toMatchObject({
        state: "ES",
        neighborhood: "",
        street: "",
      });
      expect(result.current.addressCoords).toBeNull();
    });

    it("Outro: pino no center da cidade, sem Nominatim, e o nome digitado é salvo como foi escrito", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const fetchMock = stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      act(() => result.current.selectOtherNeighborhood());

      await waitFor(() =>
        expect(result.current.addressCoords).toEqual({
          coords: CASTELO_CENTER,
          source: "neighborhood",
        }),
      );
      expect(result.current.pinZoom).toBe(13);
      expect(result.current.isOtherNeighborhood).toBe(true);
      expect(nominatimCalls(fetchMock)).toHaveLength(0);

      // Mesmo um nome alternativo da lista fica como foi digitado em "Outro".
      act(() => result.current.changeOtherNeighborhood("pombal "));
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(result.current.addressForm.getValues("neighborhood")).toBe("pombal ");
      expect(result.current.addressCoords?.coords).toEqual(CASTELO_CENTER);

      await act(async () => {
        await result.current.handleAddAddress(
          formData({
            ...result.current.addressForm.getValues(),
            street: "Rua A",
            number: "1",
            zipCode: "29360-000",
          }),
        );
      });

      expect(api.address.createUserAddress.mock.calls[0][0]).toMatchObject({
        neighborhood: "pombal ",
        latitude: CASTELO_CENTER.lat,
        longitude: CASTELO_CENTER.lng,
      });
    });

    it("Outro sem nome do bairro não salva", async () => {
      stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());
      act(() => result.current.selectOtherNeighborhood());
      await waitFor(() => expect(result.current.addressCoords).not.toBeNull());

      await act(async () => {
        await result.current.handleAddAddress(
          formData({ city: "Castelo", state: "ES", neighborhood: "   " }),
        );
      });

      expect(api.address.createUserAddress).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("Informe qual é o seu bairro.");
    });

    it("trocar de Outro para um bairro da lista volta ao fluxo normal", async () => {
      stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());
      act(() => result.current.selectOtherNeighborhood());
      act(() => result.current.changeOtherNeighborhood("Boa Fé"));

      act(() => result.current.changeNeighborhood("Centro"));

      expect(result.current.isOtherNeighborhood).toBe(false);
      expect(result.current.addressForm.getValues("neighborhood")).toBe("Centro");
      await waitFor(() =>
        expect(result.current.addressCoords?.coords).toEqual({ lat: -20.6030775, lng: -41.2051535 }),
      );
    });

    it("Castelo/ES oferece os bairros da lista oficial", async () => {
      const { result } = await renderProfile();
      expect(result.current.neighborhoodOptions).toBeNull();

      fillCity(result);

      await waitFor(() => expect(result.current.neighborhoodOptions).toHaveLength(32));
      expect(result.current.neighborhoodOptions).toContainEqual({
        value: "Castelo III",
        label: "Castelo III (Pombal, Ivo Martins)",
      });
      expect(result.current.neighborhoodOptions).toContainEqual({
        value: "Pantanal",
        label: "Pantanal",
      });
      expect(result.current.neighborhoodOptions).toContainEqual({
        value: "Jardim Primavera",
        label: "Jardim Primavera",
      });
      expect(result.current.neighborhoodOptions).toContainEqual({
        value: "Cava-Roxa",
        label: "Cava-Roxa",
      });
    });

    it("busca por nome alternativo encontra o bairro oficial e exibe o oficial", async () => {
      stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      act(() => result.current.addressForm.setValue("neighborhood", "Pombal"));

      await waitFor(() =>
        expect(result.current.addressForm.getValues("neighborhood")).toBe("Castelo III"),
      );
      expect(result.current.neighborhoodOptions?.map((option) => option.value)).not.toContain(
        "Pombal",
      );
    });

    it("endereço salvo como Jardim Primavera abre como Jardim Primavera, não como Pantanal", async () => {
      savedAddresses = [
        stored("a1", {
          city: "Castelo",
          state: "ES",
          neighborhood: "Jardim Primavera",
          latitude: -20.649,
          longitude: -41.2075,
        }),
      ];
      const fetchMock = stubNominatim([]);
      const { result } = await renderProfile();
      await waitFor(() => expect(result.current.addresses).toHaveLength(1));
      act(() => result.current.handleEditAddress(result.current.addresses[0]));
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

      expect(result.current.addressForm.getValues("neighborhood")).toBe("Jardim Primavera");
      expect(result.current.isOtherNeighborhood).toBe(false);
      expect(result.current.addressCoords).toEqual({
        coords: { lat: -20.649, lng: -41.2075 },
        source: "stored",
      });
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("endereço salvo com nome alternativo abre com o oficial e mantém o pino salvo", async () => {
      savedAddresses = [
        stored("a1", {
          city: "Castelo",
          state: "ES",
          neighborhood: "Pombal",
          latitude: -20.64,
          longitude: -41.2,
        }),
      ];
      const fetchMock = stubNominatim([]);
      const { result } = await renderProfile();
      await waitFor(() => expect(result.current.addresses).toHaveLength(1));
      act(() => result.current.handleEditAddress(result.current.addresses[0]));

      await waitFor(() =>
        expect(result.current.addressForm.getValues("neighborhood")).toBe("Castelo III"),
      );
      expect(result.current.addressCoords).toEqual({
        coords: { lat: -20.64, lng: -41.2 },
        source: "stored",
      });
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("bairro com coordenada move o pino para o centro do bairro", async () => {
      vi.mocked(getNeighborhoods).mockResolvedValue({
        state: "ES",
        city: "Castelo",
        ibgeCode: null,
        cep: null,
        neighborhoods: [{ name: "Centro", lat: -20.6033, lng: -41.1847 }],
      });
      const fetchMock = stubNominatim([]);
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() =>
        expect(result.current.neighborhoodOptions).toEqual([{ value: "Centro", label: "Centro" }]),
      );

      act(() => result.current.addressForm.setValue("neighborhood", "Centro"));

      await waitFor(() =>
        expect(result.current.addressCoords).toEqual({
          coords: { lat: -20.6033, lng: -41.1847 },
          source: "neighborhood",
        }),
      );
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("bairro com coordenada na lista real move o pino para o bairro com zoom de bairro", async () => {
      const fetchMock = stubNominatim([]);
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      act(() => result.current.addressForm.setValue("neighborhood", "Centro"));

      await waitFor(() =>
        expect(result.current.addressCoords).toEqual({
          coords: { lat: -20.6030775, lng: -41.2051535 },
          source: "neighborhood",
        }),
      );
      expect(result.current.pinZoom).toBe(15);
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("Caparaó vai para a coordenada do mapa oficial, com zoom de bairro", async () => {
      const fetchMock = stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      act(() => result.current.addressForm.setValue("neighborhood", "Caparaó"));

      await waitFor(() =>
        expect(result.current.addressCoords).toEqual({
          coords: { lat: -20.60403, lng: -41.20758 },
          source: "neighborhood",
        }),
      );
      expect(result.current.pinZoom).toBe(15);
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("bairro sem coordenada move o pino para o center da cidade, sem Nominatim", async () => {
      vi.mocked(getNeighborhoods).mockResolvedValue(LIST_WITH_UNPINNED);
      const fetchMock = stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      act(() => result.current.addressForm.setValue("neighborhood", UNPINNED));

      await waitFor(() =>
        expect(result.current.addressCoords).toEqual({
          coords: CASTELO_CENTER,
          source: "neighborhood",
        }),
      );
      expect(result.current.pinZoom).toBe(13);
      expect(nominatimCalls(fetchMock)).toHaveLength(0);
    });

    it("lista sem center: bairro sem coordenada e Outro buscam o centro da cidade no Nominatim", async () => {
      vi.mocked(getNeighborhoods).mockResolvedValue({
        state: "ES",
        city: "Castelo",
        ibgeCode: null,
        cep: null,
        neighborhoods: [
          { name: "Centro", lat: -20.6033, lng: -41.1847 },
          { name: UNPINNED, lat: null, lng: null },
        ],
      });
      const fetchMock = stubNominatim(nominatimHit("-20.6", "-41.2"));
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      act(() => result.current.selectOtherNeighborhood());
      await waitFor(() =>
        expect(result.current.addressCoords?.coords).toEqual({ lat: -20.6, lng: -41.2 }),
      );
      expect(nominatimCalls(fetchMock)).toHaveLength(1);

      act(() => result.current.changeNeighborhood(UNPINNED));

      await waitFor(() =>
        expect(result.current.addressCoords).toEqual({
          coords: { lat: -20.6, lng: -41.2 },
          source: "neighborhood",
        }),
      );
      const [call] = nominatimCalls(fetchMock);
      expect(call.searchParams.get("city")).toBe("Castelo");
      expect(call.searchParams.get("state")).toBe("Espírito Santo");
      expect(call.searchParams.has("street")).toBe(false);
    });

    it("preencher o número dispara uma única busca de rua e número", async () => {
      const fetchMock = stubNominatim(nominatimHit("-20.61", "-41.19"));
      const { result } = await renderProfile();
      fillCity(result);

      act(() => result.current.addressForm.setValue("street", "Rua Principal"));
      act(() => result.current.addressForm.setValue("number", "4"));
      // Pausa de digitação menor que o atraso da busca: ainda não busca.
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      act(() => result.current.addressForm.setValue("number", "45"));

      await waitFor(
        () =>
          expect(result.current.addressCoords).toEqual({
            coords: { lat: -20.61, lng: -41.19 },
            source: "geocode",
          }),
        { timeout: 3000 },
      );
      const calls = nominatimCalls(fetchMock);
      expect(calls).toHaveLength(1);
      expect(calls[0].searchParams.get("street")).toBe("45 Rua Principal");
    });

    it("Sem número (S/N) busca só pela rua e salva S/N", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const fetchMock = stubNominatim(nominatimHit("-20.61", "-41.19"));
      const { result } = await renderProfile();
      fillCity(result);

      act(() => {
        result.current.addressForm.setValue("street", "Rua Principal");
        result.current.addressForm.setValue("number", "S/N");
      });

      await waitFor(() => expect(result.current.addressCoords?.source).toBe("geocode"), {
        timeout: 3000,
      });
      const calls = nominatimCalls(fetchMock);
      expect(calls).toHaveLength(1);
      expect(calls[0].searchParams.get("street")).toBe("Rua Principal");

      await act(async () => {
        await result.current.handleAddAddress(
          formData({ ...result.current.addressForm.getValues(), zipCode: "29360-000" }),
        );
      });

      expect(api.address.createUserAddress.mock.calls[0][0]).toMatchObject({
        street: "Rua Principal",
        number: "S/N",
      });
    });

    it("resultado fora da cidade é ignorado e o pino fica onde estava", async () => {
      const fetchMock = stubNominatim(nominatimHit("-20.3", "-40.3", "Vitória"));
      const { result } = await renderProfile();
      fillCity(result);
      placePin(result, { lat: -20.6, lng: -41.2 });

      act(() => {
        result.current.addressForm.setValue("street", "Rua Principal");
        result.current.addressForm.setValue("number", "45");
      });

      await waitFor(() => expect(nominatimCalls(fetchMock)).toHaveLength(1), { timeout: 3000 });
      await waitFor(() => expect(result.current.isLocatingPin).toBe(false));
      expect(result.current.addressCoords).toEqual({
        coords: { lat: -20.6, lng: -41.2 },
        source: "manual",
      });
      expect(result.current.addressNotFound).toBe(true);
    });

    it("Nominatim sem resultado avisa e o aviso sai quando o cliente arrasta o pino", async () => {
      const fetchMock = stubNominatim([]);
      const { result } = await renderProfile();
      fillCity(result);
      act(() => {
        result.current.addressForm.setValue("street", "Rua Sem Mapa");
        result.current.addressForm.setValue("number", "7");
      });

      await waitFor(() => expect(result.current.addressNotFound).toBe(true), { timeout: 3000 });
      expect(nominatimCalls(fetchMock)).toHaveLength(1);
      expect(result.current.addressCoords).toBeNull();
      expect(result.current.isSearchingAddress).toBe(false);

      placePin(result, { lat: -20.6, lng: -41.2 });

      expect(result.current.addressNotFound).toBe(false);
    });

    it("zoom de rua para a busca de rua e número, de cidade para o centro da cidade", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        const params = new URL(url).searchParams;
        const body = params.get("street")
          ? nominatimHit("-20.61", "-41.19")
          : nominatimHit("-20.6", "-41.2");
        return { ok: true, status: 200, json: async () => body };
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.mocked(getNeighborhoods).mockResolvedValue(LIST_WITH_UNPINNED);
      const { result } = await renderProfile();
      fillCity(result);
      await waitFor(() => expect(result.current.neighborhoodOptions).not.toBeNull());

      // Bairro sem coordenada: o pino vai para o center da cidade.
      act(() => result.current.addressForm.setValue("neighborhood", UNPINNED));
      await waitFor(() => expect(result.current.addressCoords?.source).toBe("neighborhood"));
      expect(result.current.pinZoom).toBe(13);
      const keyAfterNeighborhood = result.current.pinRecenterKey;

      act(() => {
        result.current.addressForm.setValue("street", "Rua Principal");
        result.current.addressForm.setValue("number", "45");
      });
      await waitFor(() => expect(result.current.addressCoords?.source).toBe("geocode"), {
        timeout: 3000,
      });
      expect(result.current.pinZoom).toBe(17);
      expect(result.current.pinRecenterKey).not.toBe(keyAfterNeighborhood);
    });

    it("salvar usa o pino posicionado pela busca, sem buscar de novo", async () => {
      api.address.createUserAddress.mockResolvedValue({ success: true, data: stored("novo") });
      const fetchMock = stubNominatim(nominatimHit("-20.61", "-41.19"));
      const { result } = await renderProfile();
      fillCity(result);
      act(() => {
        result.current.addressForm.setValue("street", "Rua Principal");
        result.current.addressForm.setValue("number", "45");
      });
      await waitFor(() => expect(result.current.addressCoords?.source).toBe("geocode"), {
        timeout: 3000,
      });
      const callsBeforeSave = fetchMock.mock.calls.length;

      await act(async () => {
        await result.current.handleAddAddress(
          formData({ street: "Rua Principal", number: "45", city: "Castelo", state: "ES" }),
        );
      });

      expect(api.address.createUserAddress.mock.calls[0][0]).toMatchObject({
        latitude: -20.61,
        longitude: -41.19,
      });
      expect(fetchMock.mock.calls.length).toBe(callsBeforeSave);
    });
  });

  describe("CEP", () => {
    it("CEP completo busca na BrasilAPI e preenche o endereço", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          street: "Rua XV de Novembro",
          neighborhood: "Centro",
          city: "Curitiba",
          state: "PR",
          location: { coordinates: { latitude: "-25.43", longitude: "-49.27" } },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderProfile();

      act(() => result.current.addressForm.setValue("zipCode", "80020-310"));

      await waitFor(() =>
        expect(result.current.addressForm.getValues("street")).toBe("Rua XV de Novembro"),
      );
      expect(fetchMock).toHaveBeenCalledWith("https://brasilapi.com.br/api/cep/v2/80020310");
      expect(result.current.addressForm.getValues()).toMatchObject({
        neighborhood: "Centro",
        city: "Curitiba",
        state: "PR",
      });
      expect(result.current.addressCoords).toEqual({
        coords: { lat: -25.43, lng: -49.27 },
        source: "cep",
      });
      expect(result.current.isLoadingCep).toBe(false);
    });

    it("CEP inexistente avisa sem preencher", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      const { result } = await renderProfile();

      act(() => result.current.addressForm.setValue("zipCode", "99999999"));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("CEP não encontrado"));
      expect(result.current.addressForm.getValues("street")).toBeUndefined();
    });

    it("CEP incompleto não busca", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderProfile();

      act(() => result.current.addressForm.setValue("zipCode", "8002"));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("formatCep aplica a máscara 00000-000", async () => {
      const { result } = await renderProfile();

      expect(result.current.formatCep("80020310")).toBe("80020-310");
      expect(result.current.formatCep("800")).toBe("800");
      expect(result.current.formatCep("80020-3109999")).toBe("80020-310");
    });
  });

  it("desfaz a troca de padrão interrompida do checkout ao abrir a tela", async () => {
    // O restore faz PATCHs de verdade: termina depois da primeira leitura da lista.
    vi.mocked(restorePendingDefaultAddress).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 20)),
    );
    await renderProfile();

    expect(restorePendingDefaultAddress).toHaveBeenCalledWith("user-1");
    await waitFor(() => expect(api.address.getUserAddresses).toHaveBeenCalledTimes(2));
  });
});
