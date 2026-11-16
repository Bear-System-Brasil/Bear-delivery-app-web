import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MercadoPagoOAuthCallbackPage from "./page";
import { apiService } from "@/services/api";

const mockSearchParams = new Map<string, string>();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
}));

vi.mock("@/services/api", () => ({
  apiService: {
    payments: {
      oauthCallback: vi.fn(),
    },
  },
}));

describe("MercadoPagoOAuthCallbackPage", () => {
  beforeEach(() => {
    mockSearchParams.clear();
    vi.clearAllMocks();
  });

  it("exibe erro se code ou state estiverem ausentes", async () => {
    render(<MercadoPagoOAuthCallbackPage />);

    expect(await screen.findByText("Falha na Conexão")).toBeInTheDocument();
    expect(
      screen.getByText("Código de autorização ou estado ausentes na URL de retorno."),
    ).toBeInTheDocument();
  });

  it("chama oauthCallback e exibe sucesso quando conectado", async () => {
    mockSearchParams.set("code", "test-code");
    mockSearchParams.set("state", "test-state");

    vi.mocked(apiService.payments.oauthCallback).mockResolvedValueOnce({
      success: true,
      data: { connected: true },
    });

    render(<MercadoPagoOAuthCallbackPage />);

    expect(
      screen.getByText("Conectando conta Mercado Pago..."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Mercado Pago Conectado!")).toBeInTheDocument();
    });

    expect(apiService.payments.oauthCallback).toHaveBeenCalledWith(
      "test-code",
      "test-state",
    );
  });

  it("exibe mensagem de erro quando o backend rejeita", async () => {
    mockSearchParams.set("code", "invalid-code");
    mockSearchParams.set("state", "expired-state");

    vi.mocked(apiService.payments.oauthCallback).mockResolvedValueOnce({
      success: false,
      message: "State expirado ou inválido.",
    });

    render(<MercadoPagoOAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText("Falha na Conexão")).toBeInTheDocument();
      expect(screen.getByText("State expirado ou inválido.")).toBeInTheDocument();
    });
  });

  it("exibe sucesso direto quando o backend redireciona com connected=true", async () => {
    mockSearchParams.set("connected", "true");

    render(<MercadoPagoOAuthCallbackPage />);

    expect(await screen.findByText("Mercado Pago Conectado!")).toBeInTheDocument();
    expect(apiService.payments.oauthCallback).not.toHaveBeenCalled();
  });

  it("exibe erro direto quando a URL traz parâmetro error", async () => {
    mockSearchParams.set("error", "access_denied");
    mockSearchParams.set("error_description", "Usuário cancelou autorização.");

    render(<MercadoPagoOAuthCallbackPage />);

    expect(await screen.findByText("Falha na Conexão")).toBeInTheDocument();
    expect(screen.getByText("Usuário cancelou autorização.")).toBeInTheDocument();
  });
});
