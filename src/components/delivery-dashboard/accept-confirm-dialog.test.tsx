import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Delivery } from "@/services/api";
import { AcceptConfirmDialog } from "./accept-confirm-dialog";

const DELIVERY = {
  id: "n1",
  orderId: "order-n1",
  status: "PENDING",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as Delivery;

function renderDialog(state: { isAccepting?: boolean; isLocating?: boolean }) {
  const onClose = vi.fn();
  render(
    <AcceptConfirmDialog
      delivery={DELIVERY}
      isAccepting={state.isAccepting ?? false}
      isLocating={state.isLocating}
      onClose={onClose}
      onConfirm={vi.fn()}
    />,
  );
  return { onClose };
}

describe("AcceptConfirmDialog", () => {
  // LDMF-314: com o aviso de permissão sem resposta, Voltar desativado
  // prendia o entregador no diálogo.
  it("procurando a localização, Voltar continua livre e desiste", () => {
    const { onClose } = renderDialog({ isLocating: true });

    expect(
      screen.getByRole("button", { name: "Buscando localização..." }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("com o request no backend, os dois botões travam", () => {
    renderDialog({ isAccepting: true });

    expect(screen.getByRole("button", { name: "Aceitando..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();
  });
});
