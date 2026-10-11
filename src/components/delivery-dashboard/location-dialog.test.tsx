import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCourierPositionStore } from "@/stores/courier-position-store";
import { LocationDialog } from "./location-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * PermissionStatus falso: mesma instância a vida toda (referência estável),
 * com `change` disparável pelo teste.
 */
const permissionStatus = {
  state: "prompt" as PermissionState,
  listeners: new Set<() => void>(),
  addEventListener: (_: string, fn: () => void) => permissionStatus.listeners.add(fn),
  removeEventListener: (_: string, fn: () => void) => permissionStatus.listeners.delete(fn),
};
const query = vi.fn(async () => permissionStatus);

function setPermission(state: PermissionState) {
  permissionStatus.state = state;
  permissionStatus.listeners.forEach((fn) => fn());
}

const onClose = vi.fn();
const onConfirmed = vi.fn();

function renderDialog(failure: "denied" | "timeout" | null) {
  return render(
    <LocationDialog
      open
      purpose="accept"
      failure={failure}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />,
  );
}

const gpsButton = () => screen.getByRole("button", { name: /GPS/ });
const unblockHelp = () => screen.queryByText(/Para liberar:/);

describe("LocationDialog - localização bloqueada (LDMF-314)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionStatus.state = "prompt";
    permissionStatus.listeners.clear();
    useCourierPositionStore.setState({ position: null });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
  });

  it("com a permissão negada, explica como liberar e trava o botão do GPS", async () => {
    permissionStatus.state = "denied";
    renderDialog("denied");

    await waitFor(() => expect(gpsButton()).toBeDisabled());
    expect(gpsButton()).toHaveTextContent("GPS bloqueado neste aparelho");
    expect(unblockHelp()).toBeInTheDocument();
  });

  it("liberar nas configurações reabilita o GPS sem fechar o diálogo", async () => {
    permissionStatus.state = "denied";
    renderDialog("denied");
    await waitFor(() => expect(gpsButton()).toBeDisabled());

    act(() => setPermission("granted"));

    await waitFor(() => expect(gpsButton()).toBeEnabled());
    expect(gpsButton()).toHaveTextContent("Tentar pelo GPS");
    expect(unblockHelp()).not.toBeInTheDocument();
  });

  it("sem a Permissions API, a falha 'denied' ainda mostra como liberar, sem travar o botão", async () => {
    Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
    renderDialog("denied");

    expect(unblockHelp()).toBeInTheDocument();
    expect(gpsButton()).toBeEnabled();
  });

  it("GPS que só demorou não mostra instrução de liberar", async () => {
    renderDialog("timeout");

    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(screen.getByText("O GPS demorou demais pra responder.")).toBeInTheDocument();
    expect(unblockHelp()).not.toBeInTheDocument();
    expect(gpsButton()).toBeEnabled();
  });
});

describe("LocationDialog - endereço digitado (LDMF-314)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useCourierPositionStore.setState({ position: null });
    Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
    vi.stubGlobal("fetch", fetchMock);
    // "ai delícia" não existe, mas o Nominatim devolve o mais parecido
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "-23.5", lon: "-46.6", display_name: "Rua Delícia, Vila Nova, São Paulo, Brasil" },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function search(text: string) {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Ou digite onde você está"), {
      target: { value: text },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Buscar endereço" }));
    });
  }

  it("mostra o que achou e só segue depois de confirmar", async () => {
    await search("ai delícia");

    expect(screen.getByText("Rua Delícia, Vila Nova, São Paulo")).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(useCourierPositionStore.getState().position).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sim, estou aqui" }));

    expect(onConfirmed).toHaveBeenCalled();
    expect(useCourierPositionStore.getState().position).toMatchObject({
      coords: { lat: -23.5, lng: -46.6 },
      source: "manual",
    });
  });

  it("não reconhecer o endereço não grava nada e deixa corrigir", async () => {
    await search("ai delícia");

    fireEvent.click(screen.getByRole("button", { name: "Não, corrigir" }));

    expect(screen.queryByText("Rua Delícia, Vila Nova, São Paulo")).not.toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(useCourierPositionStore.getState().position).toBeNull();
    expect(screen.getByRole("button", { name: "Buscar endereço" })).toBeEnabled();
  });

  it("mudar o texto descarta o endereço achado", async () => {
    await search("ai delícia");

    fireEvent.change(screen.getByLabelText("Ou digite onde você está"), {
      target: { value: "Rua Sete 50, Castelo" },
    });

    expect(screen.queryByText("É aqui que você está?")).not.toBeInTheDocument();
  });
});
