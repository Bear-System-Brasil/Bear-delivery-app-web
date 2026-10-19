"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { CompanyCoverUpload } from "@/components/company-cover-upload";
import { CompanyLogoUpload } from "@/components/company-logo-upload";
import ProtectedRoute from "@/components/protected-route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { GradientButton } from "@/components/ui/custom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RESTAURANT_CATEGORIES } from "@/constants";
import {
  useCompanyAcceptedPaymentMethods,
  useCompanyOpeningHours,
  useCompanyProfileManagement,
  useSpecialties,
} from "@/hooks";
import {
  ACCEPTED_PAYMENT_METHODS,
  ACCEPTED_PAYMENT_METHOD_LABELS,
} from "@/lib/accepted-payment-methods";
import { cn } from "@/lib/utils";
import { formatCnpj, formatPhoneDisplay } from "@/utils";
import {
  Building2,
  Clock,
  CreditCard,
  ExternalLink,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

export default function CompanyProfilePage() {
  return (
    <ProtectedRoute allowedRoles={["owner", "admin"]}>
      <CompanyProfileContent />
    </ProtectedRoute>
  );
}

function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-[13px] border-border bg-card shadow-none",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 pb-3.5">
        <div>
          <CardTitle className="text-[13px] font-extrabold text-foreground">
            {title}
          </CardTitle>
          <CardDescription className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {subtitle}
          </CardDescription>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function IconInput({
  label,
  icon: Icon,
  className,
  ...inputProps
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <Label className="mb-[5px] block text-[11px] font-bold text-foreground/80">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-[11px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
        <Input
          {...inputProps}
          className="h-[37px] rounded-[9px] border-border bg-background pl-[33px] pr-3 text-[12.5px] text-foreground disabled:cursor-default disabled:opacity-70"
        />
      </div>
    </div>
  );
}

function CompanyProfileContent() {
  const {
    user,
    isMounted,
    isLoadingProfile,
    isLoadingAddresses,
    profileError,
    formData,
    isEditing,
    isSaving,
    selectedCategory,
    isSavingSpecialty,
    handleSaveProfile,
    handleSaveSpecialty,
    handleCancelEdit,
    setIsEditing,
    updateFormField,
    setSelectedCategory,
    addresses,
    newAddress,
    isAddingAddress,
    editingAddressId,
    setIsAddingAddress,
    handleSaveAddress,
    handleEditAddress,
    handleCancelAddressEdit,
    handleDeleteAddress,
    handleSearchZipCode,
    isSearchingZipCode,
    zipCodeHint,
    updateAddressField,
    formatZipCode,
    passwordData,
    passwordErrors,
    isChangingPassword,
    setIsChangingPassword,
    handleChangePassword,
    updatePasswordField,
    resetPasswordForm,
  } = useCompanyProfileManagement();

  // O badge Aberto/Fechado vem da rota pública de horários, não mais do
  // `isOpen` que vinha junto com GET /company.
  const {
    hours: openingHours,
    hasChanges: hasHoursChanges,
    persistedDays,
    updateDay: updateDayHours,
    discardChanges: discardHoursChanges,
    handleSaveHours,
    isSavingHours,
    isLoadingHours,
    isHoursError,
    hoursError,
    refetchHours,
    isOpenNow,
    linkedToCashRegister,
  } = useCompanyOpeningHours(user?.companyId || user?.id);

  const {
    selected: acceptedPaymentMethods,
    hasChanges: hasPaymentMethodsChanges,
    toggleMethod: togglePaymentMethod,
    discardChanges: discardPaymentMethodsChanges,
    handleSave: handleSavePaymentMethods,
    isSaving: isSavingPaymentMethods,
    isLoading: isLoadingPaymentMethods,
    isError: isPaymentMethodsError,
    refetch: refetchPaymentMethods,
  } = useCompanyAcceptedPaymentMethods(user?.companyId || user?.id);

  const { data: specialties } = useSpecialties();
  const specialtyOptions =
    specialties && specialties.length > 0
      ? specialties.map((s) => ({ id: s.id, name: s.name }))
      : RESTAURANT_CATEGORIES.map((c) => ({ id: c.id, name: c.name }));

  const selectedSpecialtyName = specialtyOptions.find(
    (s) => s.id === selectedCategory,
  )?.name;

  if (!isMounted || !user) {
    return null;
  }

  const companyId = user.companyId || user.id;
  const userRoleLabel =
    user.role === "owner"
      ? "Proprietário"
      : user.role === "admin"
        ? "Admin"
        : "Gerente";

  return (
    <AdminPageLayout
      title="Perfil da Empresa"
      icon={Building2}
      mainClassName="p-4 sm:p-6 lg:pl-64 lg:pr-8"
      actions={
        <Badge className="border-0 bg-primary/10 text-primary">
          {userRoleLabel}
        </Badge>
      }
    >
      <div className="mx-auto max-w-[920px]">
        {profileError && !isLoadingProfile ? (
          <Card className="rounded-[13px] border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {profileError}
          </Card>
        ) : (
          <>
            {/* Header row */}
            <div className="mb-4 flex items-start justify-between gap-4">
              <p className="text-[12.5px] font-medium text-muted-foreground">
                A identidade que aparece para o cliente no app
              </p>
              <Link href={`/restaurant/${companyId}`} target="_blank">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-[9px] text-xs font-bold"
                >
                  <span className="flex items-center gap-1.5">
                    Ver página pública
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </Button>
              </Link>
            </div>

            {/* Hero card: cover + logo + summary */}
            <Card className="mb-3 overflow-hidden rounded-[14px] border-border bg-card shadow-none">
              {isLoadingProfile ? (
                <Skeleton className="h-[150px] w-full rounded-none" />
              ) : (
                <CompanyCoverUpload
                  value={formData.cover_url}
                  onChange={(url) => updateFormField("cover_url", url)}
                  companyId={companyId}
                  companyData={{
                    tradeName: formData.tradeName,
                    legalName: formData.legalName,
                    cnpj: formData.cnpj,
                    email: formData.email,
                    phone: formData.phone,
                  }}
                />
              )}

              <div className="flex items-start gap-3.5 px-[18px] pb-4">
                {isLoadingProfile ? (
                  <Skeleton className="-mt-[30px] h-[76px] w-[76px] shrink-0 rounded-full border-[3px] border-background" />
                ) : (
                  <CompanyLogoUpload
                    value={formData.logo_url}
                    onChange={(url) => updateFormField("logo_url", url)}
                    companyId={companyId}
                    companyData={{
                      tradeName: formData.tradeName,
                      legalName: formData.legalName,
                      cnpj: formData.cnpj,
                      email: formData.email,
                      phone: formData.phone,
                    }}
                  />
                )}

                <div className="min-w-0 flex-1 pt-3">
                  {isLoadingProfile ? (
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-3.5 w-56" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[17px] font-extrabold tracking-tight text-foreground">
                          {formData.tradeName || "Sua Empresa"}
                        </span>
                        {isOpenNow !== null && (
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-extrabold",
                              isOpenNow
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                                : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
                            )}
                            title={
                              linkedToCashRegister
                                ? "Status controlado pelo caixa"
                                : "Status calculado pelo horário de funcionamento"
                            }
                          >
                            {isOpenNow ? "Aberto" : "Fechado"}
                          </span>
                        )}
                        {linkedToCashRegister && (
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                            Segue o caixa
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] font-semibold text-muted-foreground">
                        {selectedSpecialtyName && (
                          <span className="whitespace-nowrap">
                            {selectedSpecialtyName}
                          </span>
                        )}
                        <span className="whitespace-nowrap">
                          CNPJ {formatCnpj(formData.cnpj) || "—"}
                        </span>
                        <span className="whitespace-nowrap">
                          {formatPhoneDisplay(formData.phone) || "—"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-[18px] py-2.5 text-[11px] font-semibold text-muted-foreground">
                Clique nas imagens para enviar · capa 1200×400, logo quadrada ·
                até 5MB (JPG, PNG, GIF)
              </div>
            </Card>

            {/* Informações da Empresa */}
            <SectionCard
              title="Informações da Empresa"
              subtitle="Dados fiscais e de contato"
              className="mb-3"
              actions={
                isLoadingProfile ? null : !isEditing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-[9px] text-xs font-bold"
                    onClick={() => setIsEditing(true)}
                  >
                    Editar
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-[9px] text-xs font-bold"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="h-8 rounded-[9px] px-3.5 text-xs font-bold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar
                    </Button>
                  </div>
                )
              }
            >
              {isLoadingProfile ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton
                      key={i}
                      className="h-[37px] w-full rounded-[9px]"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  <IconInput
                    label="Nome Fantasia"
                    icon={User}
                    value={formData.tradeName}
                    onChange={(e) =>
                      updateFormField("tradeName", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="Nome do seu restaurante"
                    maxLength={125}
                  />
                  <IconInput
                    label="Razão Social"
                    icon={Building2}
                    value={formData.legalName}
                    onChange={(e) =>
                      updateFormField("legalName", e.target.value)
                    }
                    disabled={!isEditing}
                    placeholder="Razão social da empresa"
                    maxLength={125}
                  />
                  <IconInput
                    label="CNPJ"
                    icon={CreditCard}
                    value={formatCnpj(formData.cnpj)}
                    onChange={(e) =>
                      updateFormField("cnpj", e.target.value.replace(/\D/g, ""))
                    }
                    disabled={!isEditing}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                  <IconInput
                    label="E-mail"
                    icon={Mail}
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateFormField("email", e.target.value)}
                    disabled={!isEditing}
                    placeholder="contato@restaurante.com"
                  />
                  <IconInput
                    label="Telefone"
                    icon={Phone}
                    type="tel"
                    value={formatPhoneDisplay(formData.phone)}
                    onChange={(e) =>
                      updateFormField(
                        "phone",
                        e.target.value.replace(/\D/g, ""),
                      )
                    }
                    disabled={!isEditing}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />

                  <div>
                    <Label className="mb-[5px] block text-[11px] font-bold text-foreground/80">
                      Tipo de Restaurante
                    </Label>
                    <Select
                      value={selectedCategory}
                      onValueChange={(value) => {
                        setSelectedCategory(value);
                        if (specialties && specialties.length > 0) {
                          handleSaveSpecialty(value);
                        }
                      }}
                      disabled={!isEditing || isSavingSpecialty}
                    >
                      <SelectTrigger className="h-[37px] rounded-[9px] border-border bg-background text-[12.5px] font-semibold">
                        <SelectValue placeholder="Selecione o tipo de restaurante" />
                      </SelectTrigger>
                      <SelectContent>
                        {specialtyOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!specialties || specialties.length === 0) && (
                      <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        ⚠️ Especialidades não encontradas no servidor - usando
                        lista local
                      </p>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Horário de Funcionamento */}
            <SectionCard
              title="Horário de Funcionamento"
              subtitle="Dias e horários em que a loja aceita pedidos"
              className="mb-3"
              actions={
                <div className="flex gap-2">
                  {hasHoursChanges && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={discardHoursChanges}
                      disabled={isSavingHours}
                      className="h-8 rounded-[9px] px-3 text-xs font-bold"
                    >
                      Descartar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={"secondary"}
                    onClick={handleSaveHours}
                    disabled={isSavingHours || isLoadingHours}
                    className="h-8 rounded-[9px] px-3.5 text-xs font-bold"
                  >
                    <div className="flex gap-2">
                      <Save className="h-3.5 w-3.5" />
                      {isSavingHours ? "Salvando..." : "Salvar"}
                    </div>
                  </Button>
                </div>
              }
            >
              {linkedToCashRegister && (
                <div className="mb-3 rounded-[9px] border border-border bg-muted px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                  A loja está seguindo o caixa: quem define Aberto/Fechado
                  agora é o caixa aberto, não a grade abaixo. Os horários
                  continuam valendo quando essa opção for desligada.
                </div>
              )}

              {/* O aviso de falha fica acima da grade, não no lugar dela: sem
                  os sete dias na tela o dono não teria o que preencher. Como
                  o PUT é upsert, salvar depois de um GET que falhou não apaga
                  o que estiver no banco - no pior caso reescreve o mesmo dia. */}
              {isHoursError && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  <span>
                    Não foi possível carregar o horário salvo
                    {hoursError ? `: ${hoursError}` : "."} Dá para preencher e
                    salvar mesmo assim: os dias que você enviar são gravados, e
                    os demais continuam como estão no servidor.
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => refetchHours()}
                    className="h-7 shrink-0 rounded-[9px] px-3 text-[11px] font-bold"
                  >
                    Tentar de novo
                  </Button>
                </div>
              )}

              {persistedDays.length > 0 && (
                <div className="mb-3 rounded-[9px] border border-border bg-muted px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                  Para fechar um dia já cadastrado, fale com o suporte: a rota
                  de horários ainda não apaga dia, só cria e atualiza.
                </div>
              )}

              {isLoadingHours ? (
                <div className="space-y-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                    <Skeleton key={row} className="h-[50px] rounded-[10px]" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {openingHours.map((day) => (
                    <div
                      key={day.day}
                      className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border px-3 py-2 sm:flex-nowrap"
                    >
                      {/* Trava só o que já existe no servidor: o PUT é upsert
                          e não apaga, então desmarcar um dia salvo não teria
                          efeito e o dono acharia que fechou. Dia que ele
                          acabou de marcar aqui ainda não existe lá -
                          desmarcar é só não criar, e isso pode. */}
                      <label
                        className={cn(
                          "flex w-[100px] shrink-0 items-center gap-2",
                          persistedDays.includes(day.day)
                            ? "cursor-default"
                            : "cursor-pointer",
                        )}
                        title={
                          persistedDays.includes(day.day)
                            ? "Fechar um dia já cadastrado depende de uma rota que o backend ainda não tem"
                            : undefined
                        }
                      >
                        <Checkbox
                          checked={day.isOpen}
                          disabled={persistedDays.includes(day.day)}
                          onCheckedChange={(checked) =>
                            updateDayHours(day.day, {
                              isOpen: checked === true,
                            })
                          }
                          className="h-4 w-4 border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                        />
                        <span className="text-[12.5px] font-bold text-foreground">
                          {day.label}
                        </span>
                      </label>
  
                      {day.isOpen ? (
                        <div className="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center">
                          <div className="flex flex-1 items-center gap-2">
                            <div className="relative flex-1">
                              <Clock className="pointer-events-none absolute left-[9px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-muted-foreground" />
                              <Input
                                type="time"
                                aria-label={`Abertura de ${day.label}`}
                                value={day.openTime}
                                onChange={(e) =>
                                  updateDayHours(day.day, {
                                    openTime: e.target.value,
                                  })
                                }
                                className="h-[34px] rounded-[8px] border-border bg-background pl-7 pr-2 text-[12.5px]"
                              />
                            </div>
                            <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                              até
                            </span>
                            <div className="relative flex-1">
                              <Clock className="pointer-events-none absolute left-[9px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-muted-foreground" />
                              <Input
                                type="time"
                                aria-label={`Fechamento de ${day.label}`}
                                value={day.closeTime}
                                onChange={(e) =>
                                  updateDayHours(day.day, {
                                    closeTime: e.target.value,
                                  })
                                }
                                className="h-[34px] rounded-[8px] border-border bg-background pl-7 pr-2 text-[12.5px]"
                              />
                            </div>
                          </div>
  
                          <div className="flex flex-1 items-center gap-2">
                            <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                              intervalo
                            </span>
                            <Input
                              type="time"
                              aria-label={`Início do intervalo de ${day.label}`}
                              value={day.breakStart || ""}
                              onChange={(e) =>
                                updateDayHours(day.day, {
                                  breakStart: e.target.value,
                                })
                              }
                              className="h-[34px] flex-1 rounded-[8px] border-border bg-background px-2 text-[12.5px]"
                            />
                            <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                              até
                            </span>
                            <Input
                              type="time"
                              aria-label={`Fim do intervalo de ${day.label}`}
                              value={day.breakEnd || ""}
                              onChange={(e) =>
                                updateDayHours(day.day, {
                                  breakEnd: e.target.value,
                                })
                              }
                              className="h-[34px] flex-1 rounded-[8px] border-border bg-background px-2 text-[12.5px]"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="flex-1 text-[12px] font-semibold text-muted-foreground">
                          Fechado
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Formas de pagamento aceitas (LDMF-251) */}
            <SectionCard
              title="Formas de Pagamento"
              subtitle="O checkout só oferece ao cliente as formas marcadas"
              className="mb-3"
              actions={
                <div className="flex gap-2">
                  {hasPaymentMethodsChanges && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={discardPaymentMethodsChanges}
                      disabled={isSavingPaymentMethods}
                      className="h-8 rounded-[9px] px-3 text-xs font-bold"
                    >
                      Descartar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={"secondary"}
                    onClick={handleSavePaymentMethods}
                    disabled={
                      isSavingPaymentMethods ||
                      isLoadingPaymentMethods ||
                      isPaymentMethodsError ||
                      !hasPaymentMethodsChanges
                    }
                    className="h-8 rounded-[9px] px-3.5 text-xs font-bold"
                  >
                    <div className="flex gap-2">
                      <Save className="h-3.5 w-3.5" />
                      {isSavingPaymentMethods ? "Salvando..." : "Salvar"}
                    </div>
                  </Button>
                </div>
              }
            >
              {/* Sem a lista gravada a tela mostraria o padrão (todas), e
                  salvar por cima apagaria a configuração real: trava até
                  carregar. */}
              {isPaymentMethodsError ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  <span>Não foi possível carregar as formas de pagamento.</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => refetchPaymentMethods()}
                    className="h-7 shrink-0 rounded-[9px] px-3 text-[11px] font-bold"
                  >
                    Tentar de novo
                  </Button>
                </div>
              ) : isLoadingPaymentMethods ? (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {ACCEPTED_PAYMENT_METHODS.map((method) => (
                    <Skeleton key={method} className="h-[42px] rounded-[10px]" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {ACCEPTED_PAYMENT_METHODS.map((method) => (
                      <label
                        key={method}
                        className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3 py-2.5"
                      >
                        <Checkbox
                          checked={acceptedPaymentMethods.includes(method)}
                          disabled={isSavingPaymentMethods}
                          onCheckedChange={() => togglePaymentMethod(method)}
                          className="h-4 w-4 border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                        />
                        <span className="text-[12.5px] font-bold text-foreground">
                          {ACCEPTED_PAYMENT_METHOD_LABELS[method]}
                        </span>
                      </label>
                    ))}
                  </div>
                  {acceptedPaymentMethods.length === 0 && (
                    <p className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400">
                      Marque pelo menos uma forma de pagamento.
                    </p>
                  )}
                </>
              )}
            </SectionCard>

            {/* Endereço da Empresa */}
            <SectionCard
              title="Endereço da Empresa"
              subtitle="O endereço padrão define o raio de entrega"
              className="mb-3"
              actions={
                !isLoadingAddresses && !isAddingAddress ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-[9px] text-xs font-bold"
                    onClick={() => setIsAddingAddress(true)}
                  >
                    <span className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar
                    </span>
                  </Button>
                ) : null
              }
            >
              {isLoadingAddresses ? (
                <Skeleton className="h-[62px] w-full rounded-[10px]" />
              ) : (!Array.isArray(addresses) || addresses.length === 0) &&
                !isAddingAddress ? (
                <div className="py-6 text-center">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="mb-3 text-[12.5px] text-muted-foreground">
                    Nenhum endereço cadastrado
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-[9px] text-xs font-bold"
                    onClick={() => setIsAddingAddress(true)}
                  >
                    <span className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Endereço
                    </span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.isArray(addresses) &&
                    addresses.map((address) => (
                      <div
                        key={address.id}
                        className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-[11px]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary/10 text-primary">
                          <MapPin className="h-[15px] w-[15px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-bold text-foreground">
                              {address.street}, {address.number}
                            </span>
                            {address.isDefault && (
                              <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Padrão
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[11.5px] font-medium text-muted-foreground">
                            {address.neighborhood} - {address.city}/
                            {address.state} · CEP{" "}
                            {formatZipCode(address.zipCode)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 rounded-lg"
                          onClick={() => handleEditAddress(address)}
                        >
                          <Pencil className="h-[13px] w-[13px]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteAddress(address.id)}
                        >
                          <Trash2 className="h-[13px] w-[13px]" />
                        </Button>
                      </div>
                    ))}

                  {isAddingAddress && (
                    <div className="rounded-[10px] border border-dashed border-border bg-muted/30 p-4">
                      <h3 className="mb-3 text-[13px] font-extrabold text-foreground">
                        {editingAddressId ? "Editar Endereço" : "Novo Endereço"}
                      </h3>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <IconInput
                            label="CEP"
                            icon={MapPin}
                            value={formatZipCode(newAddress.zipCode)}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "");
                              updateAddressField("zipCode", value);
                              if (value.length === 8)
                                handleSearchZipCode(value);
                            }}
                            placeholder="00000-000"
                            maxLength={9}
                          />
                          {/* Cidade de CEP único volta sem rua e bairro, e a
                              busca pode falhar: a tela diz o que preencher. */}
                          {(isSearchingZipCode || zipCodeHint) && (
                            <p
                              role="status"
                              className={cn(
                                "mt-1.5 text-xs font-semibold",
                                zipCodeHint && !isSearchingZipCode
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-muted-foreground",
                              )}
                            >
                              {isSearchingZipCode
                                ? "Buscando CEP..."
                                : zipCodeHint}
                            </p>
                          )}
                        </div>
                        <IconInput
                          label="Rua"
                          icon={MapPin}
                          value={newAddress.street}
                          onChange={(e) =>
                            updateAddressField("street", e.target.value)
                          }
                          placeholder="Nome da rua"
                        />
                        <IconInput
                          label="Número"
                          icon={MapPin}
                          value={newAddress.number}
                          onChange={(e) =>
                            updateAddressField("number", e.target.value)
                          }
                          placeholder="123"
                        />
                        <IconInput
                          label="Bairro"
                          icon={MapPin}
                          value={newAddress.neighborhood}
                          onChange={(e) =>
                            updateAddressField("neighborhood", e.target.value)
                          }
                          placeholder="Nome do bairro"
                        />
                        <IconInput
                          label="Cidade"
                          icon={MapPin}
                          value={newAddress.city}
                          onChange={(e) =>
                            updateAddressField("city", e.target.value)
                          }
                          placeholder="Nome da cidade"
                        />
                        <IconInput
                          label="Estado"
                          icon={MapPin}
                          value={newAddress.state}
                          onChange={(e) =>
                            updateAddressField("state", e.target.value)
                          }
                          placeholder="UF"
                          maxLength={2}
                        />
                        <IconInput
                          label="Complemento"
                          icon={MapPin}
                          value={newAddress.complement}
                          onChange={(e) =>
                            updateAddressField("complement", e.target.value)
                          }
                          placeholder="Apto, sala, etc (opcional)"
                        />
                        <div className="sm:col-span-2">
                          <IconInput
                            label="Referência"
                            icon={MapPin}
                            value={newAddress.reference}
                            onChange={(e) =>
                              updateAddressField("reference", e.target.value)
                            }
                            placeholder="Ponto de referência (opcional)"
                          />
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <Checkbox
                            id="isDefault"
                            checked={newAddress.isDefault}
                            onCheckedChange={(checked) =>
                              updateAddressField("isDefault", checked === true)
                            }
                            className="h-4 w-4 border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                          />
                          <Label
                            htmlFor="isDefault"
                            className="cursor-pointer text-[12.5px] font-semibold text-foreground/80"
                          >
                            Definir como endereço padrão
                          </Label>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 rounded-[9px] text-xs font-bold"
                          onClick={handleCancelAddressEdit}
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            <X className="h-3.5 w-3.5" />
                            Cancelar
                          </span>
                        </Button>
                        <GradientButton
                          onClick={handleSaveAddress}
                          size="sm"
                          className="h-8 flex-1 rounded-[9px] text-xs"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {editingAddressId
                            ? "Atualizar Endereço"
                            : "Salvar Endereço"}
                        </GradientButton>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Segurança */}
            <SectionCard
              title="Segurança"
              subtitle="Alterar sua senha de acesso"
            >
              {!isChangingPassword ? (
                <Button
                  variant="outline"
                  className="h-8 w-full rounded-[9px] text-xs font-bold"
                  onClick={() => setIsChangingPassword(true)}
                >
                  <span className="flex items-center justify-center gap-2 ">
                    <Lock className="h-3.5 w-3.5" />
                    Alterar Senha
                  </span>
                </Button>
              ) : (
                <div className="space-y-3">
                  <IconInput
                    label="Senha Atual"
                    icon={Lock}
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      updatePasswordField("currentPassword", e.target.value)
                    }
                    placeholder="Digite sua senha atual"
                  />
                  <IconInput
                    label="Nova Senha"
                    icon={Lock}
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      updatePasswordField("newPassword", e.target.value)
                    }
                    placeholder="Digite a nova senha"
                  />
                  {passwordErrors.length > 0 && (
                    <div className="space-y-1 text-[11.5px] text-destructive">
                      <p className="font-bold">Requisitos não atendidos:</p>
                      <ul className="list-inside list-disc">
                        {passwordErrors.map((error: string, i: number) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <IconInput
                    label="Confirmar Nova Senha"
                    icon={Lock}
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      updatePasswordField("confirmPassword", e.target.value)
                    }
                    placeholder="Digite a nova senha novamente"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-[9px] text-xs font-bold"
                      onClick={() => {
                        setIsChangingPassword(false);
                        resetPasswordForm();
                      }}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        Cancelar
                      </span>
                    </Button>
                    <GradientButton
                      onClick={handleChangePassword}
                      size="sm"
                      disabled={passwordErrors.length > 0}
                      className="h-8 flex-1 rounded-[9px] text-xs"
                    >
                      <div className="flex gap-2">
                        {" "}
                        <Save className="h-3.5 w-3.5" />
                        Alterar Senha
                      </div>
                    </GradientButton>
                  </div>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
