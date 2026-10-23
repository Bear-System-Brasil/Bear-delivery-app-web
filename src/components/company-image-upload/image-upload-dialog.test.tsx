import { act, fireEvent, render, screen } from "@testing-library/react";
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

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

// Escolhe o arquivo e espera a leitura (arrayBuffer) terminar.
async function pick(name: string) {
  const file = new File(["x"], name, { type: "image/png" });
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await screen.findByRole("button", { name: "Salvar foto" });
  return file;
}

function previewSrc() {
  return screen.getByRole("img", { name: "Foto de perfil" }).getAttribute("src");
}

describe("ImageUploadDialog - object URL do preview", () => {
  it("cancelar revoga o preview pendente uma vez só", async () => {
    renderDialog();

    await pick("a.png");
    expect(previewSrc()).toBe("blob:preview-1");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("escolher outra foto revoga só a anterior, não a nova", async () => {
    renderDialog();

    await pick("a.png");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await pick("b.png");

    expect(previewSrc()).toBe("blob:preview-2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:preview-2");
  });

  it("sair da tela revoga o preview pendente", async () => {
    const { unmount } = renderDialog();

    await pick("a.png");
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });
});

describe("ImageUploadDialog - leitura do arquivo antes do preview", () => {
  it("monta o preview a partir dos bytes lidos, não do File escolhido", async () => {
    renderDialog();

    const file = await pick("a.png");

    const arg = vi.mocked(URL.createObjectURL).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Blob);
    expect(arg).not.toBe(file);
    expect((arg as Blob).type).toBe("image/png");
  });

  it("mostra carregando enquanto lê e só libera o Salvar depois", async () => {
    renderDialog();

    let finish!: (b: ArrayBuffer) => void;
    const file = new File(["x"], "a.png", { type: "image/png" });
    vi.spyOn(file, "arrayBuffer").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(screen.getByRole("status")).toHaveTextContent("Carregando a imagem");
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
    expect(screen.getByRole("button", { name: "Escolher foto" })).toBeDisabled();

    await act(async () => finish(new ArrayBuffer(1)));

    expect(screen.queryByRole("status")).toBeNull();
    expect(previewSrc()).toBe("blob:preview-1");
    expect(screen.getByRole("button", { name: "Salvar foto" })).toBeEnabled();
  });

  it("falha ao ler o arquivo avisa e não deixa salvar", async () => {
    const { toast } = await import("sonner");
    renderDialog();

    const file = new File(["x"], "a.png", { type: "image/png" });
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("leitura"));
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível ler a imagem. Tente de novo.",
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("leitura que termina depois de uma escolha mais nova é descartada", async () => {
    renderDialog();

    let finishOld!: (b: ArrayBuffer) => void;
    const old = new File(["x"], "velha.png", { type: "image/png" });
    vi.spyOn(old, "arrayBuffer").mockReturnValue(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    fireEvent.change(fileInput(), { target: { files: [old] } });

    // A segunda escolha termina primeiro.
    await pick("nova.png");
    expect(previewSrc()).toBe("blob:preview-1");

    await act(async () => finishOld(new ArrayBuffer(1)));

    // A leitura velha não troca o preview nem cria outro object URL.
    expect(previewSrc()).toBe("blob:preview-1");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
