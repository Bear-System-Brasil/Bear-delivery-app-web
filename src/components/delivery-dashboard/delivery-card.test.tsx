import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Delivery } from "@/services/api";
import { DeliveryCard } from "./delivery-card";

const delivery = (status: Delivery["status"], phone?: string) =>
  ({
    id: "d1",
    orderId: "order-1",
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deliveryAddress: {
      street: "Rua das Flores",
      number: "10",
      neighborhood: "Centro",
      city: "Castelo",
      state: "ES",
      reference: "Portão azul",
    },
    order: {
      customer: { id: "c1", name: "Maria Souza", phone },
    },
  }) as unknown as Delivery;

const callLink = () => screen.queryByRole("link", { name: /Ligar/ });

describe("DeliveryCard - botão Ligar", () => {
  it("não mostra o telefone em entrega disponível, antes do aceite", () => {
    render(<DeliveryCard delivery={delivery("PENDING", "27999998888")} />);

    expect(callLink()).toBeNull();
  });

  it.each(["ACCEPTED", "PICKED_UP"] as const)(
    "mostra o Ligar com o número em %s",
    (status) => {
      render(<DeliveryCard delivery={delivery(status, "(27) 99999-8888")} />);

      expect(callLink()).toHaveAttribute("href", "tel:27999998888");
    },
  );

  it("sem telefone no payload, não mostra o botão mesmo depois do aceite", () => {
    render(<DeliveryCard delivery={delivery("ACCEPTED")} />);

    expect(callLink()).toBeNull();
  });
});

describe("DeliveryCard - dados do cliente antes do aceite", () => {
  it("disponível mostra só bairro e cidade, sem nome, rua, referência nem Maps", () => {
    render(<DeliveryCard delivery={delivery("PENDING", "27999998888")} />);

    expect(screen.getByText("Centro · Castelo · ES")).toBeInTheDocument();
    expect(screen.queryByText(/Rua das Flores/)).toBeNull();
    expect(screen.queryByText(/Portão azul/)).toBeNull();
    expect(screen.queryByText("Maria Souza")).toBeNull();
    expect(screen.queryByRole("link", { name: /Maps/ })).toBeNull();
  });

  it("depois do aceite mostra endereço completo, nome e Maps", () => {
    render(<DeliveryCard delivery={delivery("ACCEPTED", "27999998888")} />);

    expect(screen.getByText("Rua das Flores, 10")).toBeInTheDocument();
    expect(screen.getByText(/Portão azul/)).toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Maps/ })).toBeInTheDocument();
  });
});

describe("DeliveryCard - coleta só com o pedido pronto", () => {
  const accepted = (orderStatus?: string) => {
    const base = delivery("ACCEPTED");
    return {
      ...base,
      order: { ...base.order, status: orderStatus },
    } as unknown as Delivery;
  };

  it.each(["IN_PRODUCTION", "ORDERED", undefined])(
    "pedido %s: mostra aguardando a cozinha, sem botão de coletar",
    (orderStatus) => {
      render(<DeliveryCard delivery={accepted(orderStatus)} onAdvance={vi.fn()} />);

      expect(screen.getByRole("status")).toHaveTextContent("Aguardando a cozinha");
      expect(screen.queryByRole("button", { name: /Coletei/ })).toBeNull();
    },
  );

  it("pedido pronto: libera o botão de coletar", () => {
    render(
      <DeliveryCard delivery={accepted("READY_FOR_PICKUP")} onAdvance={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Coletei o pedido/ })).toBeInTheDocument();
    expect(screen.queryByText("Aguardando a cozinha")).toBeNull();
  });

  it("em rota não depende do status do pedido", () => {
    render(<DeliveryCard delivery={delivery("PICKED_UP")} onAdvance={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Entreguei o pedido/ })).toBeInTheDocument();
  });
});

describe("DeliveryCard - um aceite por vez", () => {
  it("com outra entrega sendo aceita, o Aceitar trava sem dizer Aceitando", () => {
    render(
      <DeliveryCard delivery={delivery("PENDING")} onAccept={vi.fn()} acceptLocked />,
    );

    expect(screen.getByRole("button", { name: /Aceitar entrega/ })).toBeDisabled();
  });
});
