import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom não implementa ResizeObserver, mas os primitivos do Radix (Checkbox,
// Switch...) medem o elemento ao montar - sem isso qualquer tela com eles
// quebra no teste antes da primeira asserção.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom não implementa URL.createObjectURL/revokeObjectURL, usados no preview
// de upload de imagem (ImageUploadDialog). Sem o stub, escolher um arquivo no
// teste quebra.
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock";
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}

afterEach(() => {
  cleanup();
});
