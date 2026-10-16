import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PaymentMethod } from "./index";

// Intl usa espaço não separável depois de "R$"; normaliza para comparar.
const normalize = (value: string | null) => (value ?? "").replace(/ /g, " ");

// Estado de verdade, como o useCheckoutProcess guarda na página.
let latest: { paymentMethod: string; needsChange: boolean; changeAmount: string };

function Checkout({
  total = 35.9,
  initial = "cash",
  availableMethods,
}: {
  total?: number;
  initial?: string;
  availableMethods?: string[];
}) {
  const [paymentMethod, setPaymentMethod] = useState(initial);
  const [needsChange, setNeedsChange] = useState(false);
  const [changeAmount, setChangeAmount] = useState("");
  latest = { paymentMethod, needsChange, changeAmount };

  return (
    <PaymentMethod
      total={total}
      paymentMethod={paymentMethod}
      setPaymentMethod={setPaymentMethod}
      needsChange={needsChange}
      setNeedsChange={setNeedsChange}
      changeAmount={changeAmount}
      setChangeAmount={setChangeAmount}
      availableMethods={availableMethods}
    />
  );
}

async function askForChange(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByRole("button", { name: "Sim" }));
  await user.type(screen.getByLabelText("Troco para quanto?"), value);
}

describe("PaymentMethod", () => {
  it("oferece só pagamento na entrega", () => {
    render(<Checkout />);

    expect(screen.getByRole("button", { name: /Dinheiro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crédito na maquininha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Débito na maquininha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pix na entrega/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Dinheiro|maquininha|Pix/ })).toHaveLength(4);
  });

  it("mostra só as formas que o restaurante aceita (LDMF-251)", () => {
    render(
      <Checkout
        initial="pix_on_delivery"
        availableMethods={["debit_card_machine", "pix_on_delivery"]}
      />,
    );

    expect(screen.getByRole("button", { name: /Débito na maquininha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pix na entrega/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dinheiro/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crédito na maquininha/ })).not.toBeInTheDocument();
  });

  it("em dinheiro, pergunta do troco e só mostra o campo depois do 'Sim'", async () => {
    const user = userEvent.setup();
    render(<Checkout />);

    expect(screen.getByText("Precisa de troco?")).toBeInTheDocument();
    expect(screen.queryByLabelText("Troco para quanto?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim" }));

    expect(screen.getByLabelText("Troco para quanto?")).toBeInTheDocument();
    expect(latest.needsChange).toBe(true);
  });

  it("mostra quanto volta de troco, aceitando vírgula", async () => {
    const user = userEvent.setup();
    render(<Checkout total={35.9} />);

    await askForChange(user, "50,00");

    expect(latest.changeAmount).toBe("50,00");
    expect(normalize(screen.getByText(/Troco:/).textContent)).toBe("Troco: R$ 14,10");
  });

  it("valor exato do total é válido, com troco zero", async () => {
    const user = userEvent.setup();
    render(<Checkout total={35.9} />);

    await askForChange(user, "35,90");

    expect(normalize(screen.getByText(/Troco:/).textContent)).toBe("Troco: R$ 0,00");
    expect(screen.queryByText(/Valor menor que o total/)).not.toBeInTheDocument();
  });

  it("valor abaixo do total avisa com o total", async () => {
    const user = userEvent.setup();
    render(<Checkout total={35.9} />);

    await askForChange(user, "20");

    expect(normalize(screen.getByText(/Valor menor que o total/).textContent)).toBe(
      "Valor menor que o total (R$ 35,90).",
    );
    expect(screen.queryByText(/Troco:/)).not.toBeInTheDocument();
  });

  it("texto que não é número também avisa", async () => {
    const user = userEvent.setup();
    render(<Checkout total={35.9} />);

    await askForChange(user, "abc");

    expect(screen.getByText(/Valor menor que o total/)).toBeInTheDocument();
  });

  it("responder 'Não' esconde o campo e apaga o valor", async () => {
    const user = userEvent.setup();
    render(<Checkout />);
    await askForChange(user, "50");

    await user.click(screen.getByRole("button", { name: "Não" }));

    expect(latest).toMatchObject({ needsChange: false, changeAmount: "" });
    expect(screen.queryByLabelText("Troco para quanto?")).not.toBeInTheDocument();
  });

  it("trocar para cartão apaga o troco e explica o pagamento na entrega", async () => {
    const user = userEvent.setup();
    render(<Checkout />);
    await askForChange(user, "50");

    await user.click(screen.getByRole("button", { name: /Débito na maquininha/ }));

    expect(latest).toEqual({ paymentMethod: "debit_card_machine", needsChange: false, changeAmount: "" });
    expect(screen.queryByText("Precisa de troco?")).not.toBeInTheDocument();
    expect(screen.getByText("Pagamento no recebimento")).toBeInTheDocument();
  });

  it("voltar para dinheiro não traz de volta o troco antigo", async () => {
    const user = userEvent.setup();
    render(<Checkout />);
    await askForChange(user, "50");
    await user.click(screen.getByRole("button", { name: /Pix na entrega/ }));

    await user.click(screen.getByRole("button", { name: /Dinheiro/ }));

    expect(latest).toEqual({ paymentMethod: "cash", needsChange: false, changeAmount: "" });
  });
});
