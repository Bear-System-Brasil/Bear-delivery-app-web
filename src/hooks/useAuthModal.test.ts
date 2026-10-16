import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useAuthModal } from "./useAuthModal";
import { BIRTH_DATE_MESSAGES } from "@/utils";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      login: vi.fn(),
      createUser: vi.fn(),
      verifyOtp: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      getSession: vi.fn(),
    },
  };
});

const api = vi.mocked(apiService);

const onClose = vi.fn();
const onAuthSuccess = vi.fn();

const initialAuthState = useAuthStore.getState();

function renderModal(defaultTab: "login" | "register" = "login") {
  return renderHook(
    (props: { isOpen: boolean; defaultTab: "login" | "register" }) =>
      useAuthModal({ ...props, onClose, onAuthSuccess }),
    { initialProps: { isOpen: true, defaultTab } },
  );
}

type Hook = ReturnType<typeof renderModal>["result"];

function type(result: Hook, fields: Record<string, string>) {
  for (const [field, value] of Object.entries(fields)) {
    act(() => result.current.handleInputChange(field, value));
  }
}

const validRegister = {
  name: "Ana",
  email: "Ana@Example.com",
  cpf: "12345678900",
  phone: "41999990000",
  password: "Senha@1",
  confirmPassword: "Senha@1",
  birthDate: "01011990",
};

describe("useAuthModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useAuthStore.setState(initialAuthState, true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("abas e mensagens", () => {
    it("abre na aba pedida e volta a ela ao reabrir", () => {
      const { result, rerender } = renderModal("register");
      expect(result.current.activeTab).toBe("register");

      act(() => result.current.setActiveTab("login"));
      rerender({ isOpen: false, defaultTab: "register" });
      rerender({ isOpen: true, defaultTab: "register" });

      expect(result.current.activeTab).toBe("register");
    });

    it("trocar de aba ou de etapa apaga a mensagem da tela anterior", () => {
      const { result } = renderModal();

      act(() => result.current.setSubmitMessage({ type: "error", text: "Senha errada" }));
      act(() => result.current.setActiveTab("register"));
      expect(result.current.submitMessage).toBeNull();

      act(() => result.current.setSubmitMessage({ type: "error", text: "Outra" }));
      act(() => result.current.setStep("forgot-password"));
      expect(result.current.submitMessage).toBeNull();
    });

    it("fechar limpa tudo e avisa quem abriu", () => {
      const { result } = renderModal();
      type(result, { email: "ana@example.com", password: "x" });
      act(() => result.current.setStep("otp"));

      act(() => result.current.handleClose());

      expect(onClose).toHaveBeenCalled();
      expect(result.current.loginData).toEqual({ email: "", password: "" });
      expect(result.current.step).toBe("form");
    });
  });

  describe("login", () => {
    it("e-mail vai em minúsculas e o formulário exige os dois campos", () => {
      const { result } = renderModal();

      type(result, { email: "Ana@Example.COM" });
      expect(result.current.loginData.email).toBe("ana@example.com");
      expect(result.current.isFormValid()).toBeFalsy();

      type(result, { password: "Senha@1" });
      expect(result.current.isFormValid()).toBeTruthy();
    });

    it("sucesso grava o usuário no store e fecha depois de 2s", async () => {
      api.login.mockResolvedValue({
        success: true,
        data: { data: { user: { id: "u1", email: "ana@example.com", name: "Ana" } } },
      } as never);
      const { result } = renderModal();
      type(result, { email: "ana@example.com", password: "Senha@1" });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(api.login).toHaveBeenCalledWith({ email: "ana@example.com", password: "Senha@1" });
      expect(useAuthStore.getState().user).toMatchObject({ id: "u1", role: "client" });
      expect(result.current.submitMessage?.type).toBe("success");

      // A mensagem de boas-vindas fica 2s na tela antes de fechar.
      act(() => vi.advanceTimersByTime(1999));
      expect(onClose).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));

      expect(onAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: "u1", role: "client", companyId: null }),
      );
      expect(onClose).toHaveBeenCalled();
    });

    it("usuário de empresa entra com role e companyId", async () => {
      api.login.mockResolvedValue({
        success: true,
        data: {
          data: {
            user: { id: "u2", email: "loja@example.com", role: "owner", companyId: "c1", tradeName: "Bear Burger" },
          },
        },
      } as never);
      const { result } = renderModal();
      type(result, { email: "loja@example.com", password: "Senha@1" });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(useAuthStore.getState().user).toMatchObject({
        role: "owner",
        companyId: "c1",
        name: "Bear Burger",
      });
    });

    it("credencial recusada mostra a mensagem do backend e não loga", async () => {
      api.login.mockResolvedValue({ success: false, message: "Usuário bloqueado", status: 403 });
      const { result } = renderModal();
      type(result, { email: "ana@example.com", password: "x" });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.submitMessage).toEqual({ type: "error", text: "Usuário bloqueado" });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it("resposta sem usuário também é falha", async () => {
      api.login.mockResolvedValue({ success: true, data: { data: {} } } as never);
      const { result } = renderModal();

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "Email ou senha incorretos. Tente novamente.",
      });
    });

    it("exceção de rede mostra erro de conexão", async () => {
      api.login.mockRejectedValue(new Error("offline"));
      const { result } = renderModal();

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "Erro de conexão. Verifique sua internet e tente novamente.",
      });
    });
  });

  describe("cadastro", () => {
    it("formata CPF, telefone e data enquanto digita", () => {
      const { result } = renderModal("register");

      type(result, { cpf: "12345678900", phone: "41999990000", birthDate: "01011990" });

      expect(result.current.registerData).toMatchObject({
        cpf: "123.456.789-00",
        phone: "(41) 99999-0000",
        birthDate: "01/01/1990",
      });
    });

    it("aponta cada regra de senha que falta", () => {
      const { result } = renderModal("register");

      type(result, { password: "abc" });

      expect(result.current.passwordErrors).toEqual([
        "mínimo 6 caracteres",
        "1 letra maiúscula",
        "1 símbolo",
      ]);
    });

    it("confere a confirmação de senha nos dois sentidos", () => {
      const { result } = renderModal("register");

      type(result, { password: "Senha@1", confirmPassword: "Senha@2" });
      expect(result.current.passwordMatch).toBe(false);

      type(result, { confirmPassword: "Senha@1" });
      expect(result.current.passwordMatch).toBe(true);

      type(result, { password: "Senha@9" });
      expect(result.current.passwordMatch).toBe(false);
    });

    it("só é válido com todos os campos, senha forte, confirmação igual e termos aceitos", () => {
      const { result } = renderModal("register");

      type(result, { ...validRegister, birthDate: "" });
      act(() => result.current.setAcceptedTerms(true));
      expect(result.current.isFormValid()).toBeFalsy();

      type(result, { birthDate: "01011990" });
      expect(result.current.isFormValid()).toBeTruthy();

      // Sem o aceite dos termos e da política, não cadastra (LDMF-281).
      act(() => result.current.setAcceptedTerms(false));
      expect(result.current.isFormValid()).toBeFalsy();
      act(() => result.current.setAcceptedTerms(true));

      type(result, { password: "fraca" });
      expect(result.current.isFormValid()).toBeFalsy();
    });

    it("envia CPF e telefone só com dígitos, e-mail minúsculo, e vai para o código", async () => {
      api.createUser.mockResolvedValue({ success: true });
      const { result } = renderModal("register");
      type(result, validRegister);

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(api.createUser).toHaveBeenCalledWith({
        name: "Ana",
        email: "ana@example.com",
        cpf: "12345678900",
        phone: "41999990000",
        password: "Senha@1",
        birthDate: "01/01/1990",
        role: "client",
      });
      expect(result.current.step).toBe("otp");
      expect(result.current.otpData.phone).toBe("41999990000");
      expect(result.current.submitMessage).toEqual({
        type: "success",
        text: "Código de verificação enviado para seu telefone!",
      });
    });

    it("permite cadastro sem CPF e não envia a chave cpf para api.createUser", async () => {
      api.createUser.mockResolvedValue({ success: true });
      const { result } = renderModal("register");
      const withoutCpf = { ...validRegister, cpf: "" };
      type(result, withoutCpf);
      act(() => result.current.setAcceptedTerms(true));

      expect(result.current.isFormValid()).toBe(true);

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(api.createUser).toHaveBeenCalledWith({
        name: "Ana",
        email: "ana@example.com",
        phone: "41999990000",
        password: "Senha@1",
        birthDate: "01/01/1990",
        role: "client",
      });
      expect(api.createUser.mock.calls[0][0]).not.toHaveProperty("cpf");
      expect(result.current.step).toBe("otp");
    });

    it("cadastro recusado fica no formulário com a mensagem", async () => {
      api.createUser.mockResolvedValue({ success: false, message: "CPF já cadastrado" });
      const { result } = renderModal("register");
      type(result, validRegister);

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.step).toBe("form");
      expect(result.current.submitMessage).toEqual({ type: "error", text: "CPF já cadastrado" });
    });

    it("menor de 18 anos não conclui o cadastro (LDMF-301)", async () => {
      const { result } = renderModal("register");
      const minorYear = new Date().getFullYear() - 15;
      const minorBirthDate = `0101${minorYear}`;
      type(result, { ...validRegister, birthDate: minorBirthDate });
      act(() => result.current.setAcceptedTerms(true));

      // isFormValid deve ser falso para menor de 18 anos
      expect(result.current.isFormValid()).toBe(false);

      // Submissão direta deve ser bloqueada sem chamar api.createUser
      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(api.createUser).not.toHaveBeenCalled();
      expect(result.current.step).toBe("form");
      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: BIRTH_DATE_MESSAGES.underage,
      });
    });

    it("data futura ou inexistente também bloqueia, com a mensagem da regra (LDMF-303)", async () => {
      const { result } = renderModal("register");
      act(() => result.current.setAcceptedTerms(true));

      type(result, { ...validRegister, birthDate: "31022000" });
      expect(result.current.registerData.birthDate).toBe("31/02/2000");
      expect(result.current.isFormValid()).toBe(false);

      type(result, { birthDate: `0101${new Date().getFullYear() + 1}` });
      expect(result.current.isFormValid()).toBe(false);
      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(api.createUser).not.toHaveBeenCalled();
      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: BIRTH_DATE_MESSAGES.future,
      });
    });

    it("maior de 18 anos conclui o cadastro com sucesso (LDMF-301)", async () => {
      api.createUser.mockResolvedValue({ success: true });
      const { result } = renderModal("register");
      const adultYear = new Date().getFullYear() - 20;
      const adultBirthDate = `0101${adultYear}`;
      type(result, { ...validRegister, birthDate: adultBirthDate });
      act(() => result.current.setAcceptedTerms(true));

      expect(result.current.isFormValid()).toBe(true);

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(api.createUser).toHaveBeenCalled();
      expect(result.current.step).toBe("otp");
    });
  });

  describe("código de verificação", () => {
    it("código certo conclui e fecha depois de 2s", async () => {
      api.verifyOtp.mockResolvedValue({ success: true });
      const { result } = renderModal();
      act(() => result.current.setOtpData({ phone: "(41) 99999-0000", code: "123456" }));

      await act(async () => {
        await result.current.handleOTPSubmit();
      });

      expect(api.verifyOtp).toHaveBeenCalledWith({ phone: "41999990000", code: "123456" });
      act(() => vi.advanceTimersByTime(2000));
      expect(onAuthSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("código errado limpa o campo para digitar de novo", async () => {
      api.verifyOtp.mockResolvedValue({ success: false });
      const { result } = renderModal();
      act(() => result.current.setOtpData({ phone: "41999990000", code: "000000" }));

      await act(async () => {
        await result.current.handleOTPSubmit();
      });

      expect(result.current.otpData).toEqual({ phone: "41999990000", code: "" });
      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "Código inválido. Tente novamente.",
      });
    });
  });

  describe("recuperar senha", () => {
    it("envia o telefone só com dígitos e passa para a redefinição", async () => {
      api.forgotPassword.mockResolvedValue({ success: true });
      const { result } = renderModal();
      act(() => result.current.setForgotPasswordData({ phone: "(41) 99999-0000" }));

      await act(async () => {
        await result.current.handleForgotPasswordSubmit();
      });

      expect(api.forgotPassword).toHaveBeenCalledWith({ phone: "41999990000" });
      expect(result.current.step).toBe("reset-password");
      expect(result.current.resetPasswordData.phone).toBe("41999990000");
    });

    it("telefone desconhecido fica na etapa com a mensagem", async () => {
      api.forgotPassword.mockResolvedValue({ success: false });
      const { result } = renderModal();
      act(() => result.current.setStep("forgot-password"));

      await act(async () => {
        await result.current.handleForgotPasswordSubmit();
      });

      expect(result.current.step).toBe("forgot-password");
      expect(result.current.submitMessage?.text).toBe(
        "Telefone não encontrado. Verifique e tente novamente.",
      );
    });

    it("senha nova fraca é barrada antes de chamar a API", async () => {
      const { result } = renderModal();
      act(() =>
        result.current.setResetPasswordData({
          phone: "41999990000",
          code: "123456",
          newPassword: "fraca",
          confirmPassword: "fraca",
        }),
      );

      await act(async () => {
        await result.current.handleResetPasswordSubmit();
      });

      expect(api.resetPassword).not.toHaveBeenCalled();
      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "Senha inválida: mínimo 6 caracteres, 1 letra maiúscula, 1 símbolo",
      });
    });

    it("confirmação diferente é barrada antes de chamar a API", async () => {
      const { result } = renderModal();
      act(() =>
        result.current.setResetPasswordData({
          phone: "41999990000",
          code: "123456",
          newPassword: "Senha@1",
          confirmPassword: "Senha@2",
        }),
      );

      await act(async () => {
        await result.current.handleResetPasswordSubmit();
      });

      expect(api.resetPassword).not.toHaveBeenCalled();
      expect(result.current.submitMessage?.text).toBe("As senhas não coincidem.");
    });

    it("redefinida com sessão criada, entra direto", async () => {
      api.resetPassword.mockResolvedValue({ success: true } as never);
      api.getSession.mockResolvedValue({
        authenticated: true,
        user: { id: "u1", email: "ana@example.com" },
      } as never);
      const { result } = renderModal();
      act(() =>
        result.current.setResetPasswordData({
          phone: "41999990000",
          code: "123456",
          newPassword: "Senha@1",
          confirmPassword: "Senha@1",
        }),
      );

      await act(async () => {
        await result.current.handleResetPasswordSubmit();
      });

      expect(api.resetPassword).toHaveBeenCalledWith({
        phone: "41999990000",
        code: "123456",
        newPassword: "Senha@1",
      });
      act(() => vi.advanceTimersByTime(1500));
      expect(onAuthSuccess).toHaveBeenCalledWith({ id: "u1", email: "ana@example.com" });
      expect(onClose).toHaveBeenCalled();
    });

    it("redefinida sem sessão, volta para a aba de login", async () => {
      api.resetPassword.mockResolvedValue({ success: true } as never);
      api.getSession.mockResolvedValue({ authenticated: false, user: null } as never);
      const { result } = renderModal("register");
      act(() =>
        result.current.setResetPasswordData({
          phone: "41999990000",
          code: "123456",
          newPassword: "Senha@1",
          confirmPassword: "Senha@1",
        }),
      );

      await act(async () => {
        await result.current.handleResetPasswordSubmit();
      });
      act(() => vi.advanceTimersByTime(1500));

      expect(result.current.activeTab).toBe("login");
      expect(onAuthSuccess).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("código recusado mostra a mensagem do backend", async () => {
      api.resetPassword.mockResolvedValue({ success: false, message: "Código expirado" } as never);
      const { result } = renderModal();
      act(() =>
        result.current.setResetPasswordData({
          phone: "41999990000",
          code: "1",
          newPassword: "Senha@1",
          confirmPassword: "Senha@1",
        }),
      );

      await act(async () => {
        await result.current.handleResetPasswordSubmit();
      });

      expect(result.current.submitMessage).toEqual({ type: "error", text: "Código expirado" });
      expect(api.getSession).not.toHaveBeenCalled();
    });
  });
});
