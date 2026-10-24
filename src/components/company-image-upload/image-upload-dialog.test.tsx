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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const upload = vi.fn();
beforeEach(() => upload.mockReset());

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

  it("leitura recusada pede pra escolher de novo e não libera o Salvar", async () => {
    const { toast } = await import("sonner");
    renderDialog();

    const file = new File(["x"], "a.png", { type: "image/png" });
    const read = vi
      .spyOn(file, "arrayBuffer")
      .mockRejectedValue(new DOMException("x", "NotReadableError"));
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "O celular não liberou essa foto. Escolha de novo.",
    );
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
    expect(screen.getByRole("button", { name: "Escolher de novo" })).toBeEnabled();
  });

  it("escolher de novo depois da recusa monta o preview normalmente", async () => {
    renderDialog();

    const bad = new File(["x"], "a.png", { type: "image/png" });
    vi.spyOn(bad, "arrayBuffer").mockRejectedValue(
      new DOMException("x", "NotReadableError"),
    );
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [bad] } });
    });

    await pick("a.png");

    expect(screen.queryByText(/não liberou essa foto/)).toBeNull();
    expect(previewSrc()).toBe("blob:preview-1");
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

describe("ImageUploadDialog - preview que o navegador não desenha", () => {
  it("troca o ícone quebrado por um aviso e mantém o Salvar", async () => {
    renderDialog();

    await pick("a.png");
    fireEvent.error(screen.getByRole("img", { name: "Foto de perfil" }));

    expect(screen.queryByRole("img", { name: "Foto de perfil" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não deu pra mostrar a prévia, mas a foto pode ser salva.",
    );
    expect(screen.getByRole("button", { name: "Salvar foto" })).toBeEnabled();
  });

  it("cancelar tira o aviso e escolher de novo tenta mostrar a prévia", async () => {
    renderDialog();

    await pick("a.png");
    fireEvent.error(screen.getByRole("img", { name: "Foto de perfil" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("status")).toBeNull();

    await pick("b.png");
    expect(previewSrc()).toBe("blob:preview-2");
  });
});

describe("ImageUploadDialog - arquivo que vai pro upload", () => {
  it("leitura certa: sobe a cópia em memória, com o mesmo nome e tipo", async () => {
    upload.mockResolvedValue({ success: true, url: "https://r2.test/x.png" });
    renderDialog();

    const picked = await pick("avatar.png");
    fireEvent.click(screen.getByRole("button", { name: "Salvar foto" }));

    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const sent = upload.mock.calls[0][0] as File;
    expect(sent).not.toBe(picked);
    expect(sent.name).toBe("avatar.png");
    expect(sent.type).toBe("image/png");
    expect(sent.size).toBe(picked.size);
  });

});

describe("ImageUploadDialog - limpeza do input de arquivo", () => {
  it("só limpa o input depois de terminar a leitura", async () => {
    renderDialog();

    const input = fileInput();
    const cleared = vi.fn();
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => "",
      set: cleared,
    });

    let finish!: (b: ArrayBuffer) => void;
    const file = new File(["x"], "a.png", { type: "image/png" });
    vi.spyOn(file, "arrayBuffer").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.change(input, { target: { files: [file] } });

    expect(cleared).not.toHaveBeenCalled();

    await act(async () => finish(new ArrayBuffer(1)));

    expect(cleared).toHaveBeenCalledWith("");
  });
});

// DIAGNOSTICO TEMPORARIO (LDMF-412) - sai junto com o diagnóstico, antes do PR.
describe("ImageUploadDialog - diagnóstico temporário da leitura", () => {
  it("mostra o erro que o navegador devolveu na leitura", async () => {
    renderDialog();

    const file = new File(["x"], "a.png", { type: "image/png" });
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new DOMException("sem acesso", "NotReadableError"),
    );
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });

    expect(screen.getByTestId("read-diag")).toHaveTextContent(
      "leitura falhou (NotReadableError: sem acesso)",
    );
  });
});

describe("ImageUploadDialog - seletor de arquivo no Android", () => {
  it("no Android aceita também qualquer arquivo, pra fugir do seletor de fotos", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 13; SM-M127F) AppleWebKit/537.36 Chrome/155.0 Mobile Safari/537.36",
    );
    renderDialog();

    expect(fileInput()).toHaveAttribute("accept", "image/*,*/*");
  });

  it("fora do Android continua aceitando só imagens", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );
    renderDialog();

    expect(fileInput()).toHaveAttribute("accept", "image/*");
  });

  it("no Android, arquivo que não é imagem continua barrado", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Linux; Android 13");
    renderDialog();

    const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [pdf] } });
    });

    expect(toast.error).toHaveBeenCalledWith("Por favor, selecione uma imagem válida");
    expect(screen.queryByRole("button", { name: "Salvar foto" })).toBeNull();
  });
});
