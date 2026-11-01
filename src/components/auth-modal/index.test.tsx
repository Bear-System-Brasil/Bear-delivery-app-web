import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AuthModal from "./index";

// Referências estáveis: mock com identidade nova a cada render causa laço.
const noop = vi.fn();
const hookState = {
  activeTab: "login",
  setActiveTab: noop,
  step: "forgot-password",
  setStep: noop,
  isLoading: false,
  loginData: { identifier: "", password: "" },
  forgotPasswordData: { email: "" },
  setForgotPasswordData: noop,
  resetPasswordData: { email: "", code: "", newPassword: "", confirmPassword: "" },
  setResetPasswordData: noop,
  registerData: {},
  acceptedTerms: false,
  setAcceptedTerms: noop,
  otpData: { email: "", code: "" },
  setOtpData: noop,
  passwordErrors: [],
  passwordMatch: false,
  submitMessage: null,
  setSubmitMessage: noop,
  formatPhone: (value: string) => value,
  handleInputChange: noop,
  isFormValid: false,
  handleSubmit: noop,
  handleOTPSubmit: noop,
  handleForgotPasswordSubmit: noop,
  handleResetPasswordSubmit: noop,
  handleClose: noop,
};

vi.mock("@/hooks/useAuthModal", () => ({
  useAuthModal: () => hookState,
}));

describe("AuthModal - Esqueci minha senha", () => {
  it("pede o e-mail da conta, sem pedir telefone", () => {
    render(<AuthModal isOpen onClose={noop} />);

    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.queryByLabelText(/telefone/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /voltar ao login/i }),
    ).toBeInTheDocument();
  });

  it("só libera o envio com e-mail preenchido", () => {
    render(<AuthModal isOpen onClose={noop} />);

    expect(screen.getByRole("button", { name: /enviar código/i })).toBeDisabled();
  });

  it("digitar o e-mail atualiza o formulário em minúsculas", () => {
    hookState.setForgotPasswordData.mockClear();
    render(<AuthModal isOpen onClose={noop} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "Ana@Example.com" },
    });

    expect(hookState.setForgotPasswordData).toHaveBeenCalledWith({ email: "ana@example.com" });
  });
});
