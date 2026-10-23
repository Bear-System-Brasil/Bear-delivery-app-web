import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { CompanyLogoUpload } from "./index";
import { apiService } from "@/services/api";
import { toast } from "sonner";

vi.mock("@/services/api", () => ({
  apiService: {
    uploadCompanyLogo: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

beforeAll(() => {
  // O Dialog do Radix usa APIs que o jsdom não traz por padrão.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
});

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Logo da empresa" }));
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("CompanyLogoUpload", () => {
  it("só sobe a imagem depois de confirmar em Salvar foto", async () => {
    const onChange = vi.fn();
    vi.mocked(apiService.uploadCompanyLogo).mockResolvedValue({
      success: true,
      data: { logo_url: "https://r2.test/logo.png" } as never,
    });

    render(<CompanyLogoUpload value="" onChange={onChange} companyId="comp-1" />);
    openDialog();

    const file = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    // Escolher o arquivo não grava nada ainda.
    expect(apiService.uploadCompanyLogo).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Salvar foto" }));

    await waitFor(() =>
      expect(apiService.uploadCompanyLogo).toHaveBeenCalledTimes(1),
    );
    expect(onChange).toHaveBeenCalledWith("https://r2.test/logo.png");
    expect(toast.success).toHaveBeenCalledWith("Logo atualizado com sucesso!");
  });

  it("arquivo inválido avisa e não deixa salvar", async () => {
    const onChange = vi.fn();
    render(
      <CompanyLogoUpload
        value=""
        onChange={onChange}
        companyId="comp-1"
        maxSizeMB={1}
      />,
    );
    openDialog();

    const bad = new File(["bad"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput(), { target: { files: [bad] } });

    expect(toast.error).toHaveBeenCalledWith(
      "Por favor, selecione uma imagem válida",
    );
    expect(apiService.uploadCompanyLogo).not.toHaveBeenCalled();
    // Sem arquivo válido pendente, "Salvar foto" nem aparece.
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
  });
});
