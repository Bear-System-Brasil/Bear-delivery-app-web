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

function renderDialog(state: {
  isAccepting?: boolean;
  isLocating?: boolean;
  delivery?: Delivery;
}) {
  const onClose = vi.fn();
  render(
    <AcceptConfirmDialog
      delivery={state.delivery ?? DELIVERY}
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

  describe("troco", () => {
    // Formato observado em GET /delivery/delivery-person/me: `changeFor`
    // vem como texto dentro do pedido.
    const withPayment = (paymentMethod: string, changeFor?: string) =>
      ({
        ...DELIVERY,
        order: {
          totalValue: 14,
          changeFor,
          payments: [{ id: "p1", paymentMethod, status: "PENDING", amount: 14 }],
        },
      }) as unknown as Delivery;

    it("pedido em dinheiro com troco mostra quanto o cliente paga e o troco", () => {
      renderDialog({ delivery: withPayment("CASH", "151") });

      expect(screen.getByText(/Cliente paga com R\$\s*151,00/)).toBeInTheDocument();
      expect(screen.getByText(/Levar R\$\s*137,00 de troco/)).toBeInTheDocument();
    });

    it("pedido em dinheiro sem troco não mostra troco", () => {
      renderDialog({ delivery: withPayment("CASH") });

      expect(screen.getByText(/Receber na entrega/)).toBeInTheDocument();
      expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
      expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
    });

    it("pagamento que não é dinheiro não mostra troco", () => {
      renderDialog({ delivery: withPayment("PIX", "151") });

      expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
      expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
    });
  });
});
