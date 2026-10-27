"use client";

import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AnimatedBackground,
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
  GradientButton,
} from "@/components/ui/custom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BirthDateInput } from "@/components/birth-date-input";
import { useRestaurantRegistration } from "@/hooks";
import { formatCnpj, formatPhoneDisplay, getBirthDateError } from "@/utils";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle,
  Lock,
  Mail,
  Phone,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function RestaurantRegisterPage() {
  const {
    isLoggedIn,
    canRegisterOnAccount,
    accountLabel,
    registerData,
    handleInputChange,
    passwordErrors,
    passwordMatch,
    isFormValid,
    isLoading,
    submitMessage,
    handleSubmit,
  } = useRestaurantRegistration();

  // Aceite dos termos e da política (LDMF-281). Só trava o envio na tela: o
  // backend não tem campo pra guardar o aceite, então não vai no corpo.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  return (
    <>
      <AnimatedBackground
        blobCount={4}
        showBlobs={true}
        className="flex items-center justify-center p-4"
      >
        <div className="w-full max-w-2xl relative z-10">
          <GlassCard variant="glass" className="rounded-2xl shadow-2xl">
            <GlassCardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <Link
                  href="/restaurant-landing-page"
                  className="cursor-pointer"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 hover:bg-brand-50 dark:hover:bg-brand-950/40 cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                </Link>
                <Badge className="gap-1 bg-gradient-to-r from-brand-100 to-brand-100 text-brand-700 dark:text-brand-400 border-0">
                  <Store className="h-3 w-3" />
                  Restaurante
                </Badge>
              </div>
              <div className="space-y-2">
                <GlassCardTitle className="text-3xl font-bold text-foreground flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-brand-500 to-brand-500 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  Cadastro de Restaurante
                </GlassCardTitle>
                <GlassCardDescription className="text-base text-muted-foreground">
                  Preencha os dados para cadastrar seu restaurante na plataforma
                </GlassCardDescription>
              </div>
            </GlassCardHeader>

            <GlassCardContent>
              <div className="mb-6 p-4 bg-gradient-to-r from-brand-50 to-brand-50 border border-brand-200 dark:border-brand-800/50 rounded-xl">
                <p className="text-sm text-foreground">
                  <strong className="text-brand-600 dark:text-brand-400">
                    Processo de cadastro:
                  </strong>{" "}
                  {isLoggedIn
                    ? "Preencha os dados do restaurante. Ele será cadastrado na sua conta, sem criar outra."
                    : "Preencha os dados abaixo para criar sua conta e cadastrar seu restaurante na plataforma. Após o cadastro, faça login para acessar o painel de gerenciamento."}
                </p>
              </div>

              {/* Logado: a empresa vai pra conta atual (LDMF-295). Staff ou
                  dono já têm restaurante - aí só explica, sem formulário útil. */}
              {isLoggedIn && (
                <div
                  className={
                    canRegisterOnAccount
                      ? "rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-foreground dark:border-brand-800/50 dark:bg-brand-950/40"
                      : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  }
                >
                  {canRegisterOnAccount ? (
                    <>
                      Cadastrando o restaurante na conta{" "}
                      <strong className="break-all">{accountLabel}</strong>. Depois
                      do cadastro, você vai entrar de novo para acessar o painel.
                    </>
                  ) : (
                    "Sua conta já está ligada a um restaurante. Para cadastrar outro, use uma conta de cliente."
                  )}
                </div>
              )}

              <form
                onSubmit={(event) => {
                  if (!acceptedTerms) {
                    event.preventDefault();
                    return;
                  }
                  void handleSubmit(event);
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label
                    htmlFor="tradeName"
                    className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                  >
                    <Store className="h-4 w-4 text-brand-500" />
                    Nome Fantasia
                  </Label>
                  <Input
                    id="tradeName"
                    type="text"
                    placeholder="Ex: Pizzaria do João"
                    value={registerData.tradeName}
                    onChange={(e) =>
                      handleInputChange("tradeName", e.target.value)
                    }
                    className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="legalName"
                    className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 text-brand-500" />
                    Razão Social
                  </Label>
                  <Input
                    id="legalName"
                    type="text"
                    placeholder="Ex: Pizzaria do João LTDA"
                    value={registerData.legalName}
                    onChange={(e) =>
                      handleInputChange("legalName", e.target.value)
                    }
                    className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="cnpj"
                    className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 text-brand-500" />
                    CNPJ
                  </Label>
                  <Input
                    id="cnpj"
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={registerData.cnpj}
                    onChange={(e) =>
                      handleInputChange("cnpj", formatCnpj(e.target.value))
                    }
                    maxLength={18}
                    className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                    required
                  />
                </div>


                <div className="space-y-2">
                  <Label
                    htmlFor="description"
                    className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                  >
                    <Store className="h-4 w-4 text-brand-500" />
                    Descrição do Restaurante
                  </Label>
                  <Input
                    id="description"
                    type="text"
                    placeholder="Ex: Pizzaria especializada em massas artesanais"
                    value={registerData.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                    >
                      <Mail className="h-4 w-4 text-brand-500" />
                      E-mail
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="restaurante@email.com"
                      value={registerData.email}
                      onChange={(e) =>
                        handleInputChange("email", e.target.value)
                      }
                      className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="phone"
                      className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                    >
                      <Phone className="h-4 w-4 text-brand-500" />
                      Telefone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={registerData.phone}
                      onChange={(e) =>
                        handleInputChange(
                          "phone",
                          formatPhoneDisplay(e.target.value),
                        )
                      }
                      maxLength={15}
                      className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                      required
                    />
                  </div>
                </div>

                {!isLoggedIn && (
                  <>
                    <div className="space-y-2 pt-4 border-t-2 border-border">
                      <Label
                        htmlFor="password"
                        className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                      >
                        <Lock className="h-4 w-4 text-brand-500" />
                        Senha
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Digite uma senha forte"
                        value={registerData.password}
                        onChange={(e) =>
                          handleInputChange("password", e.target.value)
                        }
                        className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                        required
                      />
                      {registerData.password && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {passwordErrors.length === 0 ? (
                            <Badge className="bg-green-500 hover:bg-green-600 gap-1 border-0">
                              <CheckCircle className="h-3 w-3" />
                              Senha forte
                            </Badge>
                          ) : (
                            passwordErrors.map((error, idx) => (
                              <p
                                key={idx}
                                className="text-destructive text-xs border-0"
                              >
                                {error}
                              </p>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="confirmPassword"
                        className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                      >
                        <Lock className="h-4 w-4 text-brand-500" />
                        Confirmar Senha
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Digite a senha novamente"
                        value={registerData.confirmPassword}
                        onChange={(e) =>
                          handleInputChange("confirmPassword", e.target.value)
                        }
                        className="h-12 rounded-xl border-2 border-border focus:border-brand-400 transition-colors"
                        required
                      />
                      {registerData.confirmPassword && (
                        <div className="mt-2">
                          {passwordMatch ? (
                            <Badge className="bg-green-500 hover:bg-green-600 gap-1 border-0">
                              <CheckCircle className="h-3 w-3" />
                              Senhas coincidem
                            </Badge>
                          ) : (
                            <p className="border-0 text-destructive text-xs">
                              Senhas não coincidem
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="birthDate"
                        className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer"
                      >
                        <Calendar className="h-4 w-4 text-brand-500" />
                        Data de nascimento do responsável
                      </Label>
                      <BirthDateInput
                        id="birthDate"
                        value={registerData.birthDate}
                        onChange={(value) =>
                          handleInputChange("birthDate", value)
                        }
                        error={getBirthDateError(registerData.birthDate)}
                      />
                    </div>
                  </>
                )}

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="acceptTerms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="acceptTerms" className="text-sm font-medium leading-snug text-foreground">
                    <span>
                      {isLoggedIn ? "Li" : "Tenho 18 anos ou mais e li"} e aceito
                      os{" "}
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

                {submitMessage && (
                  <div
                    className={`p-4 rounded-xl text-sm ${
                      submitMessage.type === "success"
                        ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 border-2 border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-2 border-red-200 dark:border-red-800"
                    }`}
                  >
                    {submitMessage.text}
                  </div>
                )}

                <GradientButton
                  type="submit"
                  fullWidth
                  size="lg"
                  className="h-14 text-lg"
                  disabled={!isFormValid || !acceptedTerms || isLoading}
                  isLoading={isLoading}
                  loadingText="Cadastrando..."
                >
                  Cadastrar Restaurante
                </GradientButton>

                <div className="text-center text-sm text-muted-foreground pt-2">
                  Já possui cadastro?{" "}
                  <Link
                    href="/?auth=required"
                    className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-400 font-semibold transition-colors cursor-pointer"
                  >
                    Fazer login
                  </Link>
                </div>
              </form>
            </GlassCardContent>
          </GlassCard>
        </div>
      </AnimatedBackground>

      <Footer />
    </>
  );
}
