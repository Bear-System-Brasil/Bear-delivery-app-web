import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("renderiza com o placeholder recebido", () => {
    render(<Input placeholder="Buscar..." />);
    expect(screen.getByPlaceholderText("Buscar...")).toBeInTheDocument();
  });

  it("aceita digitação do usuário", async () => {
    const user = userEvent.setup();
    render(<Input placeholder="Nome" />);

    const input = screen.getByPlaceholderText("Nome");
    await user.type(input, "Maria");

    expect(input).toHaveValue("Maria");
  });

  it("repassa o type recebido", () => {
    render(<Input type="email" placeholder="E-mail" />);
    expect(screen.getByPlaceholderText("E-mail")).toHaveAttribute("type", "email");
  });

  it("mantém className extra junto das classes padrão", () => {
    render(<Input placeholder="Extra" className="my-custom-class" />);
    expect(screen.getByPlaceholderText("Extra")).toHaveClass("my-custom-class");
  });

  it("fica desabilitado quando disabled", () => {
    render(<Input placeholder="Desabilitado" disabled />);
    expect(screen.getByPlaceholderText("Desabilitado")).toBeDisabled();
  });

  it("permite revelar e esconder a senha quando type='password'", async () => {
    const user = userEvent.setup();
    render(<Input type="password" placeholder="Digite sua senha" />);

    const input = screen.getByPlaceholderText("Digite sua senha");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("não exibe botão de alternar senha para outros tipos de campo", () => {
    render(<Input type="email" placeholder="E-mail" />);
    expect(screen.queryByRole("button", { name: /senha/i })).not.toBeInTheDocument();
  });

  it("não exibe botão quando showPasswordToggle for false", () => {
    render(<Input type="password" placeholder="Repetir senha" showPasswordToggle={false} />);
    expect(screen.getByPlaceholderText("Repetir senha")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("button", { name: /senha/i })).not.toBeInTheDocument();
  });

  it("permite controlar a visibilidade da senha externamente e sincronizar dois campos com um único botão", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const [show, setShow] = React.useState(false);
      return (
        <div>
          <Input
            type="password"
            placeholder="Senha"
            isPasswordVisible={show}
            onTogglePasswordVisibility={() => setShow((v) => !v)}
          />
          <Input
            type="password"
            placeholder="Repetir Senha"
            isPasswordVisible={show}
            showPasswordToggle={false}
          />
        </div>
      );
    }

    render(<TestComponent />);

    const passwordInput = screen.getByPlaceholderText("Senha");
    const confirmInput = screen.getByPlaceholderText("Repetir Senha");

    // Ambos começam mascarados
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(confirmInput).toHaveAttribute("type", "password");

    // Existe apenas um botão de alternância
    const buttons = screen.getAllByRole("button", { name: /senha/i });
    expect(buttons).toHaveLength(1);

    // Clica no botão: ambos campos revelam os valores
    await user.click(buttons[0]);
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(confirmInput).toHaveAttribute("type", "text");

    // Clica novamente: ambos campos voltam a ser mascarados
    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(confirmInput).toHaveAttribute("type", "password");
  });
});
