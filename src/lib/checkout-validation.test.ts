import { describe, expect, it } from "vitest";
import {
  describeMissingFields,
  getCheckoutFieldErrors,
} from "./checkout-validation";

const COMPLETE = {
  name: "Cliente",
  phone: "11999999999",
  cpf: "",
  zipCode: "13930-000",
  street: "Rua Coronel Pedro Penteado",
  number: "100",
  neighborhood: "Centro",
  city: "Serra Negra",
  state: "SP",
};

describe("getCheckoutFieldErrors", () => {
  it("entrega completa não tem erro", () => {
    expect(
      getCheckoutFieldErrors({
        values: COMPLETE,
        orderType: "delivery",
        hasCpf: true,
      }),
    ).toEqual({});
  });

  it("aponta cada campo de endereço que falta", () => {
    expect(
      getCheckoutFieldErrors({
        values: { ...COMPLETE, street: "", number: "  ", neighborhood: "" },
        orderType: "delivery",
        hasCpf: true,
      }),
    ).toEqual({
      street: "Informe a rua.",
      number: "Informe o número.",
      neighborhood: "Informe o bairro.",
    });
  });

  it("CEP pela metade é erro no CEP", () => {
    expect(
      getCheckoutFieldErrors({
        values: { ...COMPLETE, zipCode: "1393-0" },
        orderType: "delivery",
        hasCpf: true,
      }),
    ).toEqual({ zipCode: "Informe o CEP com 8 dígitos." });
  });

  it("nome, telefone e CPF (só quando a conta não tem CPF)", () => {
    const values = { ...COMPLETE, name: "", phone: "", cpf: "123" };

    expect(
      getCheckoutFieldErrors({ values, orderType: "delivery", hasCpf: false }),
    ).toEqual({
      name: "Informe seu nome completo.",
      phone: "Informe seu telefone.",
      cpf: "Informe um CPF válido.",
    });
    expect(
      getCheckoutFieldErrors({ values, orderType: "delivery", hasCpf: true }),
    ).not.toHaveProperty("cpf");
  });

  it("retirada ignora o endereço, como antes", () => {
    const noAddress = {
      ...COMPLETE,
      zipCode: "",
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "",
    };

    expect(
      getCheckoutFieldErrors({
        values: noAddress,
        orderType: "pickup",
        hasCpf: true,
      }),
    ).toEqual({});
    expect(
      getCheckoutFieldErrors({
        values: { ...noAddress, phone: "" },
        orderType: "pickup",
        hasCpf: true,
      }),
    ).toEqual({ phone: "Informe seu telefone." });
  });
});

describe("describeMissingFields", () => {
  it("um campo: a mensagem dele; vários: a lista", () => {
    expect(describeMissingFields({ number: "Informe o número." })).toBe(
      "Informe o número.",
    );
    expect(
      describeMissingFields({ street: "x", number: "y", state: "z" }),
    ).toBe("Falta preencher: Rua, Número, Estado.");
  });
});
