import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { CompanyCoverUpload } from "./index";
import { apiService } from "@/services/api";
import { toast } from "sonner";

vi.mock("@/services/api", () => ({
  apiService: {
    uploadCompanyCover: vi.fn(),
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
  fireEvent.click(screen.getByRole("button", { name: "Imagem de capa" }));
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("CompanyCoverUpload", () => {
  it("só sobe a imagem depois de confirmar em Salvar foto", async () => {
    const onChange = vi.fn();
    vi.mocked(apiService.uploadCompanyCover).mockResolvedValue({
      success: true,
      data: { cover_url: "https://r2.test/cover.png" } as never,
    });

    render(<CompanyCoverUpload value="" onChange={onChange} companyId="comp-1" />);
    openDialog();

    const file = new File(["x"], "cover.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(apiService.uploadCompanyCover).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Salvar foto" }));

    await waitFor(() =>
      expect(apiService.uploadCompanyCover).toHaveBeenCalledTimes(1),
    );
    expect(onChange).toHaveBeenCalledWith("https://r2.test/cover.png");
    expect(toast.success).toHaveBeenCalledWith(
      "Imagem de capa atualizada com sucesso!",
    );
  });

  it("arquivo inválido avisa e não deixa salvar", async () => {
    const onChange = vi.fn();
    render(
      <CompanyCoverUpload
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
    expect(apiService.uploadCompanyCover).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
  });
});
