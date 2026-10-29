import { useState, useEffect } from "react";
import { apiService, getBirthDateApiError } from "@/services/api";
import { useAuthStore } from "@/stores";
import { normalizeAuthUser } from "@/stores/auth-store";
import type { RawAuthUser } from "@/services/api";
import { formatCpfDisplay, getBirthDateError, maskBirthDate } from "@/utils";

interface UseAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (userData?: RawAuthUser) => void;
  defaultTab?: "login" | "register";
}

export function useAuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultTab = "login",
}: UseAuthModalProps) {
  const { login: zustandLogin } = useAuthStore();

  const [activeTab, setActiveTabInternal] = useState<"login" | "register">(defaultTab);
  const [step, setStepInternal] = useState<"form" | "otp" | "forgot-password" | "reset-password">("form");
  const [isLoading, setIsLoading] = useState(false);

  // Formulários
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [forgotPasswordData, setForgotPasswordData] = useState({ email: "" });
  const [resetPasswordData, setResetPasswordData] = useState({ email: "", code: "", newPassword: "", confirmPassword: "" });
  const [registerData, setRegisterData] = useState({
    name: "", email: "", cpf: "", phone: "", password: "", confirmPassword: "", birthDate: "", role: "client",
  });
  const [otpData, setOtpData] = useState({ email: "", code: "" });
  // Aceite dos termos e da política (LDMF-281). Fora do `registerData` de
  // propósito: o backend não tem esse campo e roda com forbidNonWhitelisted,
  // então mandar no corpo do cadastro derrubaria a requisição com 400.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Validações e Feedbacks
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [passwordMatch, setPasswordMatch] = useState(true);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Recusa da data pelo back (UNDERAGE / INVALID_BIRTH_DATE), mostrada no
  // próprio campo até a pessoa mexer na data de novo.
  const [birthDateServerError, setBirthDateServerError] = useState<string | null>(null);

  // Troca de aba/etapa nunca deve deixar o feedback (erro/sucesso) de uma
  // tela vazar pra outra - ex: errar a senha no login e ver essa mensagem
  // ainda visível ao abrir "Criar conta" ou "Esqueci minha senha".
  const setActiveTab = (tab: "login" | "register") => {
    setSubmitMessage(null);
    setActiveTabInternal(tab);
  };

  const setStep = (
    newStep: "form" | "otp" | "forgot-password" | "reset-password",
  ) => {
    setSubmitMessage(null);
    setStepInternal(newStep);
  };

  useEffect(() => {
    if (isOpen) setActiveTab(defaultTab);
  }, [isOpen, defaultTab]);

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 6) errors.push("mínimo 6 caracteres");
    if (!/[A-Z]/.test(password)) errors.push("1 letra maiúscula");
    if (!/[a-z]/.test(password)) errors.push("1 letra minúscula");
    if (!/[^A-Za-z0-9]/.test(password)) errors.push("1 símbolo");
    return errors;
  };

  const handleInputChange = (field: string, value: string) => {
    const normalizedValue = field === "email" ? value.toLowerCase() : value;

    if (activeTab === "login") {
      setLoginData((prev) => ({ ...prev, [field]: normalizedValue }));
      return;
    }

    let formattedValue = normalizedValue;
    if (field === "cpf") formattedValue = formatCpfDisplay(value);
    if (field === "phone") formattedValue = formatPhone(value);
    if (field === "birthDate") {
      formattedValue = maskBirthDate(value);
      setBirthDateServerError(null);
    }

    setRegisterData((prev) => {
      const newData = { ...prev, [field]: formattedValue };

      if (field === "password") {
        setPasswordErrors(validatePassword(formattedValue));
        setPasswordMatch(formattedValue === prev.confirmPassword);
      }

      if (field === "confirmPassword") {
        setPasswordMatch(formattedValue === prev.password);
      }

      return newData;
    });
  };

  const isCpfValid = (cpf: string) => {
    const numbers = cpf.replace(/\D/g, "");
    return numbers.length === 0 || numbers.length === 11;
  };

  const isFormValid = () => {
    if (activeTab === "login") {
      return loginData.email && loginData.password;
    } else {
      return Boolean(
        registerData.name &&
        registerData.email &&
        isCpfValid(registerData.cpf) &&
        registerData.phone &&
        registerData.password &&
        registerData.confirmPassword &&
        registerData.birthDate &&
        !getBirthDateError(registerData.birthDate) &&
        passwordErrors.length === 0 &&
        passwordMatch &&
        acceptedTerms
      );
    }
  };

  const resetForm = () => {
    setStep("form");
    setLoginData({ email: "", password: "" });
    setRegisterData({ name: "", email: "", cpf: "", phone: "", password: "", confirmPassword: "", birthDate: "", role: "client" });
    setOtpData({ email: "", code: "" });
    setAcceptedTerms(false);
    setForgotPasswordData({ email: "" });
    setResetPasswordData({ email: "", code: "", newPassword: "", confirmPassword: "" });
    setSubmitMessage(null);
    setPasswordErrors([]);
    setPasswordMatch(true);
    setBirthDateServerError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setSubmitMessage(null);

    try {
      if (activeTab === "login") {
        const loginResponse = await apiService.login(loginData);

        if (loginResponse.success && loginResponse.data?.data?.user) {
          const user = loginResponse.data.data.user;
          const companyId = user.companyId ?? null;
          const userRole = user.role || "client";
          const userForStore = normalizeAuthUser(user);

          const userWithRole = { ...user, role: userRole, companyId };
          zustandLogin(userForStore);

          setSubmitMessage({ type: "success", text: "Login realizado com sucesso! Bem-vindo de volta!" });

          setTimeout(() => {
            if (userWithRole) onAuthSuccess?.(userWithRole);
            else onAuthSuccess?.();
            onClose();
            resetForm();
          }, 2000);
        } else {
          setSubmitMessage({ type: "error", text: loginResponse.message || "Email ou senha incorretos. Tente novamente." });
        }
      } else {
        const birthDateError = getBirthDateError(registerData.birthDate);
        if (birthDateError) {
          setSubmitMessage({ type: "error", text: birthDateError });
          return;
        }

        const cpfDigits = registerData.cpf.replace(/\D/g, "");
        const apiData = {
          name: registerData.name,
          email: registerData.email,
          ...(cpfDigits ? { cpf: cpfDigits } : {}),
          phone: registerData.phone.replace(/\D/g, ""),
          password: registerData.password,
          birthDate: registerData.birthDate,
          role: registerData.role,
        };

        const response = await apiService.createUser(apiData);

        if (response.success) {
          // O código de confirmação do cadastro vai por e-mail (LDMF-294), e o
          // POST /user/complet identifica a conta pelo mesmo e-mail.
          setOtpData((prev) => ({ ...prev, email: registerData.email }));
          setStep("otp");
          setSubmitMessage({ type: "success", text: "Código de verificação enviado para seu e-mail!" });
        } else {
          const birthDateError = getBirthDateApiError(response);
          setBirthDateServerError(birthDateError);
          setSubmitMessage({
            type: "error",
            text: birthDateError || response.message || "Erro ao criar conta. Tente novamente.",
          });
        }
      }
    } catch (error) {
      setSubmitMessage({ type: "error", text: "Erro de conexão. Verifique sua internet e tente novamente." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async () => {
    setIsLoading(true);
    setSubmitMessage(null);
    try {
      const response = await apiService.verifyOtp({ email: otpData.email, code: otpData.code });
      if (response.success) {
        setSubmitMessage({ type: "success", text: "Conta verificada com sucesso!" });
        setTimeout(() => {
          onAuthSuccess?.();
          onClose();
          resetForm();
        }, 2000);
      } else {
        setSubmitMessage({ type: "error", text: response.message || "Código inválido. Tente novamente." });
        setOtpData((prev) => ({ ...prev, code: "" }));
      }
    } catch (error) {
      setSubmitMessage({ type: "error", text: "Erro de conexão. Tente novamente." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async () => {
    setIsLoading(true);
    setSubmitMessage(null);
    try {
      const email = forgotPasswordData.email.trim().toLowerCase();
      const response = await apiService.forgotPassword({ email });
      if (response.success) {
        // O back responde 200 mesmo para e-mail sem cadastro, pra não revelar
        // quem tem conta. Por isso o texto não confirma que o e-mail existe.
        setResetPasswordData((prev) => ({ ...prev, email }));
        setStep("reset-password");
        setSubmitMessage({ type: "success", text: "Se o e-mail estiver cadastrado, você vai receber um código de recuperação." });
      } else {
        setSubmitMessage({ type: "error", text: response.message || "Não foi possível enviar o código. Tente novamente." });
      }
    } catch (error) {
      setSubmitMessage({ type: "error", text: "Erro de conexão. Tente novamente." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPasswordSubmit = async () => {
    setIsLoading(true);
    setSubmitMessage(null);

    const errors = validatePassword(resetPasswordData.newPassword);
    if (errors.length > 0) {
      setSubmitMessage({ type: "error", text: `Senha inválida: ${errors.join(", ")}` });
      setIsLoading(false);
      return;
    }

    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      setSubmitMessage({ type: "error", text: "As senhas não coincidem." });
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiService.resetPassword({
        email: resetPasswordData.email,
        code: resetPasswordData.code,
        newPassword: resetPasswordData.newPassword,
      });

      if (response.success) {
        setSubmitMessage({ type: "success", text: "Senha redefinida com sucesso! Entrando na sua conta..." });
        const { authenticated, user } = await apiService.getSession();
        setTimeout(() => {
          if (authenticated && user) {
            onAuthSuccess?.(user);
            onClose();
          } else {
            setActiveTab("login");
          }
          resetForm();
        }, 1500);
      } else {
        setSubmitMessage({ type: "error", text: response.message || "Código inválido. Verifique e tente novamente." });
      }
    } catch (error) {
      setSubmitMessage({ type: "error", text: "Erro de conexão. Tente novamente." });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    activeTab, setActiveTab,
    step, setStep,
    isLoading,
    loginData,
    forgotPasswordData, setForgotPasswordData,
    resetPasswordData, setResetPasswordData,
    registerData,
    birthDateServerError,
    acceptedTerms, setAcceptedTerms,
    otpData, setOtpData,
    passwordErrors,
    passwordMatch,
    submitMessage, setSubmitMessage,
    formatPhone,
    handleInputChange,
    isFormValid,
    handleSubmit,
    handleOTPSubmit,
    handleForgotPasswordSubmit,
    handleResetPasswordSubmit,
    handleClose,
  };
}