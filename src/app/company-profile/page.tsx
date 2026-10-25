"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { CompanyCoverUpload } from "@/components/company-cover-upload";
import { CompanyLogoUpload } from "@/components/company-logo-upload";
import { OpeningHoursCopy } from "@/components/opening-hours-copy";
import ProtectedRoute from "@/components/protected-route";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { isMidnightClose } from "@/constants/opening-hours";
import {
  MAX_SPECIALTIES,
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
  Info,
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
  TriangleAlert,
  User,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

// Valor-sentinela do item "remover" no seletor: o Radix Select não aceita
// item com value vazio, então o "limpar" precisa de um valor próprio.
const NONE_SPECIALTY = "__none__";

export default function CompanyProfilePage() {
  return (
    <ProtectedRoute allowedRoles={["owner", "admin"]}>
      <CompanyProfileContent />
    </ProtectedRoute>
  );
}

/**
 * Cartão de seção do design novo: cabeçalho com ícone + título + subtítulo e
 * as ações da seção à direita. Sem `children`, o cartão é só o cabeçalho.
 */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
          children !== undefined && "border-b border-border",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Icon className="h-4 w-4 shrink-0 text-brand-500" />
          <h2 className="text-[13.5px] font-semibold text-foreground">
            {title}
          </h2>
          <span className="text-xs text-muted-foreground">· {subtitle}</span>
        </div>
        {/* ml-auto segura as ações à direita mesmo quando elas quebram pra
            uma linha só delas no mobile — sem isso "Salvar" caía à esquerda,
            diferente do desktop. */}
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
      </div>
      {children !== undefined && <div className="p-4">{children}</div>}
    </section>
  );
}

/** Aviso dentro de uma seção (neutro ou de atenção). */
function SectionNotice({
  tone = "neutral",
  children,
  action,
}: {
  tone?: "neutral" | "warning";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span className="flex min-w-0 flex-1 items-start gap-1.5">
        {tone === "warning" ? (
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span>{children}</span>
      </span>
      {action}
    </div>
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
      <Label className="mb-1.5 block text-xs font-semibold text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          {...inputProps}
          className="h-9 rounded-md border-border bg-background pl-9 pr-3 text-[13px] text-foreground disabled:cursor-default disabled:opacity-70"
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
    companySpecialties,
    specialtyDraft,
    hasSpecialtyChanges,
    isSavingSpecialty,
    setSpecialtySlot,
    discardSpecialtyChanges,
    handleSaveSpecialties,
    handleSaveProfile,
    handleCancelEdit,
    setIsEditing,
    updateFormField,
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
    copyHours,
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

  // Só a lista do servidor é escolhível: salvar um id da lista local (fallback
  // antigo) falharia no back, que não conhece esses ids (LDMF-395).
  const { data: specialties } = useSpecialties();
  const availableSpecialties = specialties ?? [];

  if (!isMounted || !user) {
    return null;
  }

  const companyId = user.companyId || user.id;

  return (
    <AdminPageLayout
      title="Perfil da Empresa"
      icon={Building2}
      mainClassName="p-4 sm:p-6 lg:pl-64 lg:pr-8"
    >
      <div className="mx-auto max-w-[920px]">
        {profileError && !isLoadingProfile ? (
          <Card className="rounded-lg border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-none">
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
            <Card className="mb-4 overflow-hidden rounded-lg border-border bg-card shadow-none">
              {isLoadingProfile ? (
                <Skeleton className="aspect-[3/1] max-h-[210px] min-h-[150px] w-full rounded-none" />
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
                        <span className="text-base font-bold text-foreground">
                          {formData.tradeName || "Sua Empresa"}
                        </span>
                        {isOpenNow !== null && (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
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
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                            Segue o caixa
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        {companySpecialties.map((spec) => (
                          <span
                            key={spec.id}
                            className="whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 font-medium text-foreground"
                          >
                            {spec.name}
                          </span>
                        ))}
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

              <div className="flex items-start gap-1.5 border-t border-border px-[18px] py-2.5 text-[11.5px] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Clique nas imagens para enviar · capa 1200×400, logo quadrada
                  · até 5MB (JPG, PNG, GIF)
                </span>
              </div>
            </Card>

            {/* Informações da Empresa */}
            <SectionCard
              icon={Building2}
              title="Informações da Empresa"
              subtitle="Dados fiscais e de contato"
              className="mb-4"
              actions={
                isLoadingProfile ? null : !isEditing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-md text-xs font-semibold"
                    onClick={() => setIsEditing(true)}
                  >
                    Editar
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-md text-xs font-semibold"
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
                      className="h-8 rounded-md px-3.5 text-xs font-semibold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar
                    </Button>
                  </div>
                )
              }
            >
              {isLoadingProfile ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton
                      key={i}
                      className="h-9 w-full rounded-md"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Colunas explícitas: o auto-fit que estava aqui perdia
                      para o grid-cols-1 e deixava um campo por linha até no
                      desktop. */}
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
                </div>
              )}
            </SectionCard>

            {/* Tipo de restaurante (até 3) — LDMF-395. Saiu das Informações
                e virou seção própria. Salva no botão, como as outras. */}
            <SectionCard
              icon={UtensilsCrossed}
              title="Tipo de restaurante"
              subtitle={`até ${MAX_SPECIALTIES} — o que o cliente vê no app`}
              className="mb-4"
              actions={
                availableSpecialties.length === 0 ? undefined : (
                  <div className="flex gap-2">
                    {hasSpecialtyChanges && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={discardSpecialtyChanges}
                        disabled={isSavingSpecialty}
                        className="h-8 rounded-md px-3 text-xs font-semibold"
                      >
                        Descartar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSaveSpecialties}
                      disabled={isSavingSpecialty || !hasSpecialtyChanges}
                      className="h-8 rounded-md px-3.5 text-xs font-semibold"
                    >
                      <div className="flex gap-2">
                        <Save className="h-3.5 w-3.5" />
                        {isSavingSpecialty ? "Salvando..." : "Salvar"}
                      </div>
                    </Button>
                  </div>
                )
              }
            >
              {isLoadingProfile ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-9 w-full rounded-md" />
                  ))}
                </div>
              ) : availableSpecialties.length === 0 ? (
                <SectionNotice tone="warning">
                  Nenhum tipo de restaurante cadastrado no sistema ainda.
                </SectionNotice>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((slot) => {
                      const currentId = specialtyDraft[slot] ?? "";
                      // Esconde dos outros campos o que já está escolhido no
                      // rascunho, pra não repetir a mesma especialidade.
                      const takenByOthers = specialtyDraft.filter(
                        (id, j) => j !== slot && id,
                      );
                      const options = availableSpecialties.filter(
                        (s) => !takenByOthers.includes(s.id),
                      );
                      return (
                        <div key={slot}>
                          <Label className="mb-1.5 block text-xs font-semibold text-foreground">
                            {slot + 1}º tipo
                          </Label>
                          <Select
                            value={currentId}
                            onValueChange={(value) =>
                              setSpecialtySlot(
                                slot,
                                value === NONE_SPECIALTY ? "" : value,
                              )
                            }
                            disabled={isSavingSpecialty}
                          >
                            <SelectTrigger
                              aria-label={`${slot + 1}º tipo`}
                              className="h-9 rounded-md border-border bg-background text-[13px] font-medium"
                            >
                              <SelectValue placeholder="Opcional" />
                            </SelectTrigger>
                            <SelectContent>
                              {currentId && (
                                <SelectItem value={NONE_SPECIALTY}>
                                  — Remover —
                                </SelectItem>
                              )}
                              {options.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 text-[11.5px] text-muted-foreground">
                    Escolha os tipos e clique em Salvar. Até {MAX_SPECIALTIES}{" "}
                    tipos.
                  </p>
                </>
              )}
            </SectionCard>

            {/* Horário de Funcionamento */}
            <SectionCard
              icon={Clock}
              title="Horário de Funcionamento"
              subtitle="Dias e horários em que a loja aceita pedidos"
              className="mb-4"
              actions={
                <div className="flex gap-2">
                  {hasHoursChanges && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={discardHoursChanges}
                      disabled={isSavingHours}
                      className="h-8 rounded-md px-3 text-xs font-semibold"
                    >
                      Descartar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={"secondary"}
                    onClick={handleSaveHours}
                    disabled={isSavingHours || isLoadingHours}
                    className="h-8 rounded-md px-3.5 text-xs font-semibold"
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
                <SectionNotice>
                  A loja está seguindo o caixa: quem define Aberto/Fechado
                  agora é o caixa aberto, não a grade abaixo. Os horários
                  continuam valendo quando essa opção for desligada.
                </SectionNotice>
              )}

              {/* O aviso de falha fica acima da grade, não no lugar dela: sem
                  os sete dias na tela o dono não teria o que preencher. Como
                  o PUT é upsert, salvar depois de um GET que falhou não apaga
                  o que estiver no banco - no pior caso reescreve o mesmo dia. */}
              {isHoursError && (
                <SectionNotice
                  tone="warning"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => refetchHours()}
                      className="h-7 shrink-0 rounded-md px-3 text-[11px] font-semibold"
                    >
                      Tentar de novo
                    </Button>
                  }
                >
                  Não foi possível carregar o horário salvo
                  {hoursError ? `: ${hoursError}` : "."} Dá para preencher e
                  salvar mesmo assim: os dias que você enviar são gravados, e
                  os demais continuam como estão no servidor.
                </SectionNotice>
              )}

              {persistedDays.length > 0 && (
                <SectionNotice>
                  Para fechar um dia já cadastrado, fale com o suporte: a rota
                  de horários ainda não apaga dia, só cria e atualiza.
                </SectionNotice>
              )}

              {isLoadingHours ? (
                <div className="space-y-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                    <Skeleton key={row} className="h-11 rounded-md" />
                  ))}
                </div>
              ) : (
                <OpeningHoursCopy hours={openingHours} onCopy={copyHours}>
                  <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                    {openingHours.map((day) => (
                      <div
                        key={day.day}
                        className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2 sm:flex-nowrap"
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
                          <span
                            className={cn(
                              "text-[13px] font-semibold",
                              day.isOpen ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {day.label}
                          </span>
                        </label>
  
                        {day.isOpen ? (
                          // No celular os campos descem para uma linha
                          // inteira: ao lado do dia, o intervalo cortava a
                          // hora (LDMF-351).
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-1 lg:flex-row lg:items-center">
                            <div className="flex flex-1 items-center gap-2">
                              <div className="relative flex-1">
                                <Clock className="pointer-events-none absolute left-[9px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-muted-foreground" />
                                <TimeInput
                                  aria-label={`Abertura de ${day.label}`}
                                  value={day.openTime}
                                  onChange={(value) =>
                                    updateDayHours(day.day, {
                                      openTime: value,
                                    })
                                  }
                                  className="h-8 rounded-md border-border bg-background pl-7 pr-2 text-[13px]"
                                />
                              </div>
                              <span className="shrink-0 text-[11.5px] text-muted-foreground">
                                até
                              </span>
                              <div className="relative flex-1">
                                <Clock className="pointer-events-none absolute left-[9px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-muted-foreground" />
                                <TimeInput
                                  aria-label={`Fechamento de ${day.label}`}
                                  value={day.closeTime}
                                  invalid={isMidnightClose(day.closeTime)}
                                  onChange={(value) =>
                                    updateDayHours(day.day, {
                                      closeTime: value,
                                    })
                                  }
                                  className="h-8 rounded-md border-border bg-background pl-7 pr-2 text-[13px]"
                                />
                              </div>
                            </div>
  
                            {/* Intervalo é opcional e nunca fica vazio
                                pela metade: liga no "+ intervalo" e tira no
                                "×", que limpa as duas pontas. */}
                            {day.hasBreak || day.breakStart || day.breakEnd ? (
                              <div className="flex flex-1 items-center gap-2">
                                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                                  intervalo
                                </span>
                                <TimeInput
                                  aria-label={`Início do intervalo de ${day.label}`}
                                  value={day.breakStart || ""}
                                  onChange={(value) =>
                                    updateDayHours(day.day, {
                                      breakStart: value,
                                    })
                                  }
                                  className="h-8 min-w-[64px] flex-1 rounded-md border-border bg-background px-2 text-[13px]"
                                />
                                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                                  até
                                </span>
                                <TimeInput
                                  aria-label={`Fim do intervalo de ${day.label}`}
                                  value={day.breakEnd || ""}
                                  onChange={(value) =>
                                    updateDayHours(day.day, {
                                      breakEnd: value,
                                    })
                                  }
                                  className="h-8 min-w-[64px] flex-1 rounded-md border-border bg-background px-2 text-[13px]"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Tirar intervalo de ${day.label}`}
                                  onClick={() =>
                                    updateDayHours(day.day, {
                                      hasBreak: false,
                                      breakStart: "",
                                      breakEnd: "",
                                    })
                                  }
                                  className="h-8 w-8 shrink-0 rounded-md text-muted-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-1 items-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Adicionar intervalo em ${day.label}`}
                                  onClick={() =>
                                    updateDayHours(day.day, { hasBreak: true })
                                  }
                                  className="h-8 rounded-md px-2 text-[11.5px] font-semibold text-muted-foreground"
                                >
                                  <span className="flex items-center gap-1">
                                    <Plus className="h-3.5 w-3.5" />
                                    intervalo
                                  </span>
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="flex-1 text-[12.5px] text-muted-foreground">
                            Fechado
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </OpeningHoursCopy>
              )}
            </SectionCard>

            {/* Formas de pagamento aceitas (LDMF-251) */}
            <SectionCard
              icon={CreditCard}
              title="Formas de Pagamento"
              subtitle="O checkout só oferece ao cliente as formas marcadas"
              className="mb-4"
              actions={
                <div className="flex gap-2">
                  {hasPaymentMethodsChanges && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={discardPaymentMethodsChanges}
                      disabled={isSavingPaymentMethods}
                      className="h-8 rounded-md px-3 text-xs font-semibold"
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
                    className="h-8 rounded-md px-3.5 text-xs font-semibold"
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
                <SectionNotice
                  tone="warning"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => refetchPaymentMethods()}
                      className="h-7 shrink-0 rounded-md px-3 text-[11px] font-semibold"
                    >
                      Tentar de novo
                    </Button>
                  }
                >
                  Não foi possível carregar as formas de pagamento.
                </SectionNotice>
              ) : isLoadingPaymentMethods ? (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {ACCEPTED_PAYMENT_METHODS.map((method) => (
                    <Skeleton key={method} className="h-10 rounded-md" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {ACCEPTED_PAYMENT_METHODS.map((method) => (
                      <label
                        key={method}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={acceptedPaymentMethods.includes(method)}
                          disabled={isSavingPaymentMethods}
                          onCheckedChange={() => togglePaymentMethod(method)}
                          className="h-4 w-4 border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                        />
                        <span className="text-[13px] font-medium text-foreground">
                          {ACCEPTED_PAYMENT_METHOD_LABELS[method]}
                        </span>
                      </label>
                    ))}
                  </div>
                  {acceptedPaymentMethods.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                      Marque pelo menos uma forma de pagamento.
                    </p>
                  )}
                </>
              )}
            </SectionCard>

            {/* Endereço da Empresa */}
            <SectionCard
              icon={MapPin}
              title="Endereço da Empresa"
              subtitle="O endereço padrão define o raio de entrega"
              className="mb-4"
              actions={
                !isLoadingAddresses && !isAddingAddress ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-md text-xs font-semibold"
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
                <Skeleton className="h-14 w-full rounded-md" />
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
                    className="h-8 rounded-md text-xs font-semibold"
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
                        className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                          <MapPin className="h-[15px] w-[15px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground">
                              {address.street}, {address.number}
                            </span>
                            {address.isDefault && (
                              <span className="flex shrink-0 items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Padrão
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {address.neighborhood} - {address.city}/
                            {address.state} · CEP{" "}
                            {formatZipCode(address.zipCode)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 rounded-md"
                          aria-label="Editar endereço"
                          onClick={() => handleEditAddress(address)}
                        >
                          <Pencil className="h-[13px] w-[13px]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Excluir endereço"
                          onClick={() => handleDeleteAddress(address.id)}
                        >
                          <Trash2 className="h-[13px] w-[13px]" />
                        </Button>
                      </div>
                    ))}

                  {isAddingAddress && (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
                      <h3 className="mb-3 text-[13px] font-semibold text-foreground">
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
                          className="h-8 flex-1 rounded-md text-xs font-semibold"
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
                          className="h-8 flex-1 rounded-md text-xs"
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
              icon={Lock}
              title="Segurança"
              subtitle="Alterar sua senha de acesso"
              actions={
                !isChangingPassword ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-md text-xs font-semibold"
                    onClick={() => setIsChangingPassword(true)}
                  >
                    <span className="flex items-center justify-center gap-2 ">
                      <Lock className="h-3.5 w-3.5" />
                      Alterar Senha
                    </span>
                  </Button>
                ) : undefined
              }
            >
              {!isChangingPassword ? undefined : (
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
                      className="h-8 flex-1 rounded-md text-xs font-semibold"
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
                      className="h-8 flex-1 rounded-md text-xs"
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
