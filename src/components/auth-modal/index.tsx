"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthModal } from "@/hooks/useAuthModal";
import { PASSWORD_RECOVERY_UNAVAILABLE } from "@/constants/password-change";
import { LEGAL_CONTACT_EMAIL } from "@/components/legal-page";
import type { RawAuthUser } from "@/services/api";
import { getBirthDateError } from "@/utils";
import { BirthDateInput } from "@/components/birth-date-input";
import {
  ArrowRight,
  CheckCircle,
  CreditCard,
  Lock,
  LogIn,
  Mail,
  Phone,
  User,
} from "lucide-react";


interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (userData?: RawAuthUser) => void;
  defaultTab?: "login" | "register";
}

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultTab = "login",
}: AuthModalProps) {
  const {
    activeTab, setActiveTab,
    step, setStep,
    isLoading,
    loginData,
    resetPasswordData, setResetPasswordData,
    registerData,
    acceptedTerms,
    setAcceptedTerms,
    otpData, setOtpData,
    passwordErrors,
    passwordMatch,
    submitMessage, setSubmitMessage,
    formatPhone,
    handleInputChange,
    isFormValid,
    handleSubmit,
    handleOTPSubmit,
    handleResetPasswordSubmit,
    handleClose,
  } = useAuthModal({ isOpen, onClose, onAuthSuccess, defaultTab });

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md border-0 bg-card/95 backdrop-blur-xl shadow-2xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-linear-to-r from-brand-500 to-brand-500 rounded-lg flex items-center justify-center">
                <LogIn className="w-5 h-5 text-white" />
              </div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-foreground">
                {step === "otp" ? "Verificação SMS" : "Autenticação"}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 flex-1">
          {step === "form" ? (
            <div className="space-y-3 sm:space-y-4">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as "login" | "register")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 gap-1 bg-muted rounded-xl">
                  <TabsTrigger
                    value="login"
                    className="data-[state=active]:bg-card data-[state=active]:text-brand-600 dark:text-brand-400 data-[state=active]:shadow-sm
                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-brand-500 data-[state=inactive]:hover:bg-muted 
                              transition-all duration-200 font-medium"
                  >
                    Entrar
                  </TabsTrigger>
                  <TabsTrigger
                    value="register"
                    className="data-[state=active]:bg-card data-[state=active]:text-brand-600 dark:text-brand-400 
                              data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-brand-500 
                            data-[state=inactive]:hover:bg-muted transition-all duration-200 font-medium"
                  >
                    Registrar
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-2.5 sm:space-y-3 mt-3 sm:mt-4">
                  <div className="space-y-1 sm:space-y-1.5">
                    <Label htmlFor="email" className="text-xs sm:text-sm font-semibold text-foreground">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="email@email.com"
                        value={loginData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        className="pl-10 rounded-xl border-2 border-border focus:border-brand-400 h-9 sm:h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 sm:space-y-1.5">
                    <Label htmlFor="password" className="text-xs sm:text-sm font-semibold text-foreground">
                      Senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Sua senha"
                        value={loginData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        className="pl-10 rounded-xl border-2 border-border focus:border-brand-400 h-9 sm:h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setStep("forgot-password")}
                      className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-400 font-medium transition-colors cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                </TabsContent>

                <TabsContent value="register" className="space-y-2.5 sm:space-y-3 mt-3 sm:mt-4">
                  <div className="space-y-1 sm:space-y-1.5">
                    <Label htmlFor="name" className="text-xs sm:text-sm font-semibold text-foreground">
                      Nome Completo
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        id="name"
                        placeholder="Nome completo"
                        value={registerData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        className="pl-10 rounded-xl border-2 border-border focus:border-brand-400 h-9 sm:h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-1 sm:space-y-1.5">
                      <Label htmlFor="emailRegister" className="text-xs sm:text-sm font-semibold text-foreground">
                        Email
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          id="emailRegister"
                          type="email"
                          placeholder="email@email.com"
                          value={registerData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                          className="pl-10 rounded-xl border-2 border-border focus:border-brand-400 h-9 sm:h-10 text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:space-y-1.5">
                      <Label htmlFor="cpf" className="text-xs sm:text-sm font-semibold text-foreground">
                        CPF <span className="font-normal text-muted-foreground">(opcional)</span>
                      </Label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          id="cpf"
                          placeholder="000.000.000-00"
                          value={registerData.cpf}
                          onChange={(e) => handleInputChange("cpf", e.target.value)}
                          maxLength={14}
                          className="pl-10 rounded-xl border-2 border-border focus:border-brand-400 h-9 sm:h-10 text-xs sm:text-sm"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Vamos pedir seu CPF no primeiro pedido. Se preferir, já informe agora.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-1 sm:space-y-1.5">
                      <Label htmlFor="phoneRegister" className="text-xs sm:text-sm font-semibold text-foreground">
                        Telefone
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          id="phoneRegister"
                          placeholder="(11) 99999-9999"
                          value={registerData.phone}
                          onChange={(e) => handleInputChange("phone", e.target.value)}
                          maxLength={15}
                          className="pl-10 rounded-xl border-2 border-border focus:border-brand-400 h-9 sm:h-10 text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:space-y-1.5">
                      <Label htmlFor="birthDate" className="text-xs sm:text-sm font-semibold text-foreground">
                        Nascimento
                      </Label>
                      <BirthDateInput
                        id="birthDate"
                        value={registerData.birthDate}
                        onChange={(value) => handleInputChange("birthDate", value)}
                        error={getBirthDateError(registerData.birthDate)}
                        className="h-9 sm:h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 sm:space-y-1.5">
                    <Label htmlFor="passwordRegister" className="text-xs sm:text-sm font-semibold text-foreground">
                      Senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        id="passwordRegister"
                        type="password"
                        placeholder="Crie uma senha forte"
                        value={registerData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        className={`pl-10 rounded-xl border-2 h-9 sm:h-10 text-xs sm:text-sm ${
                          passwordErrors.length > 0 && registerData.password
                            ? "border-red-300 dark:border-red-700 focus:border-red-400"
                            : "border-border focus:border-brand-400"
                        }`}
                      />
                    </div>
                    {passwordErrors.length > 0 && registerData.password && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Senha inválida, esperado: {passwordErrors.join(", ")}
                      </p>
                    )}
                    {passwordErrors.length === 0 && registerData.password && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Senha válida</p>
                    )}
                  </div>

                  <div className="space-y-1 sm:space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-xs sm:text-sm font-semibold text-foreground">
                      Confirmar Senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Confirme sua senha"
                        value={registerData.confirmPassword}
                        onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                        className={`pl-10 rounded-xl border-2 h-9 sm:h-10 text-xs sm:text-sm ${
                          !passwordMatch && registerData.confirmPassword
                            ? "border-red-300 dark:border-red-700 focus:border-red-400"
                            : "border-border focus:border-brand-400"
                        }`}
                      />
                    </div>
                    {!passwordMatch && registerData.confirmPassword && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">As senhas não coincidem</p>
                    )}
                    {passwordMatch && registerData.confirmPassword && registerData.password && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Senhas coincidem</p>
                    )}
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox
                      id="acceptTerms"
                      checked={acceptedTerms}
                      onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="acceptTerms" className="text-[11px] sm:text-xs font-medium leading-snug text-foreground">
                      <span>
                        Tenho 18 anos ou mais e li e aceito os{" "}
                        {/* Aba nova: navegar aqui fecharia o modal e perderia o cadastro. */}
                        <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline dark:text-brand-400">
                          Termos de uso
                        </Link>{" "}
                        e a{" "}
                        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline dark:text-brand-400">
                          Política de privacidade
                        </Link>
                        .
                      </span>
                    </Label>
                  </div>
                </TabsContent>
              </Tabs>

              {submitMessage && (
                <div
                  className={`p-2 sm:p-3 rounded-xl text-xs sm:text-sm font-medium ${
                    submitMessage.type === "success"
                      ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                  }`}
                >
                  {submitMessage.text}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={isLoading || !isFormValid()}
                className="relative w-full h-10 sm:h-12 rounded-xl bg-linear-to-r from-brand-500 to-brand-500 text-white 
                        font-semibold shadow-lg hover:shadow-xl transition-all overflow-hidden group transform
                        disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm sm:text-base"
              >
                <span className="absolute inset-0 bg-card opacity-30 rotate-45 -translate-x-full group-hover:translate-x-full blur-sm transition-transform duration-500"></span>
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processando...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>{activeTab === "login" ? "Entrar" : "Criar Conta"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </div>
          ) : step === "otp" ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-muted-foreground">Enviamos um código de verificação para</p>
                <p className="font-semibold text-foreground">{otpData.phone}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-semibold text-foreground">Código de Verificação</Label>
                <Input
                  id="code"
                  placeholder="123456"
                  value={otpData.code}
                  onChange={(e) => setOtpData((prev) => ({ ...prev, code: e.target.value }))}
                  className="text-center text-2xl font-mono rounded-xl border-2 border-border focus:border-brand-400"
                  maxLength={6}
                />
              </div>

              {submitMessage && (
                <div className={`p-3 rounded-xl text-sm font-medium ${submitMessage.type === "success" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
                  {submitMessage.text}
                </div>
              )}

              <Button
                onClick={handleOTPSubmit}
                disabled={isLoading || otpData.code.length !== 6}
                className="w-full h-12 rounded-xl bg-linear-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Verificando...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Verificar Código</span>
                  </div>
                )}
              </Button>

              <Button variant="ghost" onClick={() => setStep("form")} className="w-full text-muted-foreground hover:text-foreground cursor-pointer">
                Voltar
              </Button>
            </div>
          ) : step === "forgot-password" ? (
            // Sem envio de código no backend, o formulário prometia um código
            // que nunca chegava. Fica só o aviso até a recuperação voltar.
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Esqueceu sua senha?</h3>
                <p className="text-sm text-muted-foreground">{PASSWORD_RECOVERY_UNAVAILABLE}</p>
                {/* mailto é link externo: <a>, não <Link>. */}
                <p className="mt-3 text-sm text-muted-foreground">
                  Precisa entrar agora? Mande um e-mail para{" "}
                  <a
                    href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                    className="font-medium text-brand-600 dark:text-brand-400 underline break-all"
                  >
                    {LEGAL_CONTACT_EMAIL}
                  </a>{" "}
                  com o telefone da sua conta que a gente ajuda.
                </p>
              </div>

              <Button
                variant="ghost"
                onClick={() => { setStep("form"); setSubmitMessage(null); }}
                className="w-full text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Voltar ao Login
              </Button>
            </div>
          ) : step === "reset-password" ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Redefinir Senha</h3>
                <p className="text-sm text-muted-foreground">Digite o código enviado para <strong>{formatPhone(resetPasswordData.phone)}</strong></p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-code" className="text-sm font-semibold text-foreground">Código de Verificação</Label>
                  <Input
                    id="reset-code"
                    placeholder="123456"
                    inputMode="numeric"
                    value={resetPasswordData.code}
                    onChange={(e) => setResetPasswordData((prev) => ({ ...prev, code: e.target.value.replace(/\D/g, "") }))}
                    className="text-center text-xl font-mono rounded-xl border-2 border-border focus:border-brand-400"
                    maxLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-semibold text-foreground">Nova Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Nova senha"
                      value={resetPasswordData.newPassword}
                      onChange={(e) => setResetPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
                      className="pl-10 rounded-xl border-2 border-border focus:border-brand-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password" className="text-sm font-semibold text-foreground">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      id="confirm-new-password"
                      type="password"
                      placeholder="Confirme a nova senha"
                      value={resetPasswordData.confirmPassword}
                      onChange={(e) => setResetPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      className="pl-10 rounded-xl border-2 border-border focus:border-brand-400"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">A senha deve conter:</p>
                  <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                    <li>• Mínimo 6 caracteres</li>
                    <li>• 1 letra maiúscula</li>
                    <li>• 1 letra minúscula</li>
                    <li>• 1 caractere especial</li>
                  </ul>
                </div>
              </div>

              {submitMessage && (
                <div className={`p-3 rounded-xl text-sm font-medium ${submitMessage.type === "success" ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
                  {submitMessage.text}
                </div>
              )}

              <Button
                onClick={handleResetPasswordSubmit}
                disabled={isLoading || !resetPasswordData.code || !resetPasswordData.newPassword || !resetPasswordData.confirmPassword || resetPasswordData.code.length !== 6}
                className="w-full h-12 rounded-xl bg-linear-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all cursor-pointer"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Redefinindo...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Redefinir Senha</span>
                  </div>
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={() => { setStep("forgot-password"); setSubmitMessage(null); }}
                className="w-full text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Voltar
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}