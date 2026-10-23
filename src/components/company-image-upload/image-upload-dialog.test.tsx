import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageUploadDialog } from "./image-upload-dialog";

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

let urlCount = 0;
beforeEach(() => {
  urlCount = 0;
  // Um object URL diferente por chamada, pra saber qual foi revogado.
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    () => `blob:preview-${++urlCount}`,
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const upload = vi.fn();

function renderDialog() {
  return render(
    <ImageUploadDialog
      open
      onOpenChange={() => {}}
      currentUrl=""
      title="Foto de perfil"
      alt="Foto de perfil"
      shape="avatar"
      emptyHint="Nenhuma foto enviada ainda"
      successMessage="Foto atualizada com sucesso!"
      upload={upload}
      onUploaded={() => {}}
    />,
  );
}

function pick(name: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], name, { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
}

function previewSrc() {
  return screen.getByRole("img", { name: "Foto de perfil" }).getAttribute("src");
}

describe("ImageUploadDialog - object URL do preview", () => {
  it("cancelar revoga o preview pendente uma vez só", () => {
    renderDialog();

    pick("a.png");
    expect(previewSrc()).toBe("blob:preview-1");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("escolher outra foto revoga só a anterior, não a nova", () => {
    renderDialog();

    pick("a.png");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    pick("b.png");

    expect(previewSrc()).toBe("blob:preview-2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:preview-2");
  });

  it("sair da tela revoga o preview pendente", () => {
    const { unmount } = renderDialog();

    pick("a.png");
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });
});
