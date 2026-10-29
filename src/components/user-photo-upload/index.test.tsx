import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { UserPhotoUpload } from "./index";
import { apiService } from "@/services/api";
import { toast } from "sonner";

vi.mock("@/services/api", () => ({
  apiService: {
    uploadUserPhoto: vi.fn(),
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
  fireEvent.click(screen.getByRole("button", { name: "Foto de perfil" }));
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("UserPhotoUpload", () => {
  it("só sobe a foto depois de confirmar em Salvar foto", async () => {
    const onChange = vi.fn();
    vi.mocked(apiService.uploadUserPhoto).mockResolvedValue({
      success: true,
      data: { photoUrl: "https://r2.test/photo.png" } as never,
    });

    render(<UserPhotoUpload value="" onChange={onChange} userId="user-1" />);
    openDialog();

    const file = new File(["x"], "avatar.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    // Escolher o arquivo não grava nada ainda.
    expect(apiService.uploadUserPhoto).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Salvar foto" }));

    await waitFor(() =>
      expect(apiService.uploadUserPhoto).toHaveBeenCalledTimes(1),
    );
    expect(onChange).toHaveBeenCalledWith("https://r2.test/photo.png");
    expect(toast.success).toHaveBeenCalledWith("Foto atualizada com sucesso!");
  });

  it("arquivo inválido avisa e não deixa salvar", async () => {
    const onChange = vi.fn();
    render(
      <UserPhotoUpload
        value=""
        onChange={onChange}
        userId="user-1"
        maxSizeMB={1}
      />,
    );
    openDialog();

    const bad = new File(["bad"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput(), { target: { files: [bad] } });

    expect(toast.error).toHaveBeenCalledWith(
      "Por favor, selecione uma imagem válida",
    );
    expect(apiService.uploadUserPhoto).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
  });

  it("Remover foto limpa o valor quando já existe foto", () => {
    const onChange = vi.fn();
    render(
      <UserPhotoUpload
        value="https://r2.test/atual.png"
        onChange={onChange}
        userId="user-1"
      />,
    );
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Remover foto" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(apiService.uploadUserPhoto).not.toHaveBeenCalled();
  });
});
