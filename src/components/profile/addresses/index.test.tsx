import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Addresses } from "./index";

/** Lista "Meus Endereços": o que o cliente vê de cada endereço salvo. */

const base = {
  type: "Endereço",
  number: "10",
  complement: "",
  neighborhood: "Centro",
  city: "Castelo",
  state: "ES",
};

function renderList(addresses: Parameters<typeof Addresses>[0]["addresses"]) {
  const props = {
    addresses,
    isLoadingAddresses: false,
    addingAddressState: { isOpen: false, toggle: vi.fn(), open: vi.fn(), close: vi.fn(), setIsOpen: vi.fn() },
    handleDeleteAddress: vi.fn(),
    handleEditAddress: vi.fn(),
    handleSetDefaultAddress: vi.fn(),
  } as unknown as Parameters<typeof Addresses>[0];
  return render(<Addresses {...props} />);
}

describe("Addresses (lista)", () => {
  it("o padrão vem primeiro, com selo; CEP com traço; referência aparece", () => {
    renderList([
      { ...base, id: "a1", street: "Rua Um", zipCode: "29360000", isDefault: false },
      {
        ...base,
        id: "a2",
        street: "Avenida Dois",
        zipCode: "29360000",
        isDefault: true,
        reference: "Casa amarela ao lado da igreja",
      },
    ]);

    const streets = screen.getAllByText(/^(Rua Um|Avenida Dois), 10/).map((el) => el.textContent);
    expect(streets[0]).toContain("Avenida Dois");
    expect(screen.getAllByText("Padrão")).toHaveLength(1);
    expect(screen.getAllByText("CEP: 29360-000")).toHaveLength(2);
    expect(screen.getByText("Referência: Casa amarela ao lado da igreja")).toBeTruthy();
    // O selo genérico "Endereço" saiu.
    expect(screen.queryByText("Endereço")).toBeNull();
  });
});
