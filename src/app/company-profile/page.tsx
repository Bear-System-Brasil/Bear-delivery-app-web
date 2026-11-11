"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { CompanyCoverUpload } from "@/components/company-cover-upload";
import { CompanyLogoUpload } from "@/components/company-logo-upload";
import { DeliveryForm } from "@/components/profile/delivery-form";
import { OpeningHoursCopy } from "@/components/opening-hours-copy";
import ProtectedRoute from "@/components/protected-route";
import { TimeInput } from "@/components/time-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { GradientButton } from "@/components/ui/custom";
import { Input, type InputProps } from "@/components/ui/input";
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
import { MAX_SPECIALTIES, useCompanyProfileManagement } from "@/hooks/use-company-profile-management";
import { useCompanyAcceptedPaymentMethods } from "@/hooks/use-company-accepted-payment-methods";
import { useCompanyOpeningHours } from "@/hooks/use-opening-hours";
import { useSpecialties } from "@/hooks/use-specialties";
import { dedupeSpecialties } from "@/lib/specialty-dedupe";
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
  TriangleAlert,
  User,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

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
  subtitleBelow = false,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  /**
   * Subtítulo numa linha própria, embaixo do título. Para card estreito:
   * ao lado do título ele quebrava e empurrava o Salvar para baixo.
   */
  subtitleBelow?: boolean;
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
        {subtitleBelow ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-brand-500" />
              <h2 className="text-[13.5px] font-semibold text-foreground">
                {title}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <Icon className="h-4 w-4 shrink-0 text-brand-500" />
            <h2 className="text-[13.5px] font-semibold text-foreground">
              {title}
            </h2>
            <span className="text-xs text-muted-foreground">· {subtitle}</span>
          </div>
        )}
        {/* ml-auto segura as ações à direita mesmo quando elas quebram pra
            uma linha só delas no mobile — sem isso "Salvar" caía à esquerda,
            diferente do desktop. */}
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
      </div>
      {children !== undefined && <div className="@container p-4">{children}</div>}
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
} & InputProps) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-semibold text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
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
    storeAddress,
    isAddressModalOpen,
    isSavingAddress,
    editingAddressId,
    openAddressModal,
    closeAddressModal,
    handleSaveAddress,
    addressEditor,
    formatZipCode,
    passwordData,
    passwordErrors,
    isChangingPassword,
    setIsChangingPassword,
    handleChangePassword,
    updatePasswordField,
    resetPasswordForm,
  } = useCompanyProfileManagement();

  const [showNewPassword, setShowNewPassword] = useState(false);

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
  // O back tem o mesmo tipo cadastrado mais de uma vez ("Bebidas"/"BeBidas"):
  // cada nome aparece uma vez, representado pelo id que a loja já escolheu
  // (LDMF-497).
  const availableSpecialties = dedupeSpecialties(
    specialties ?? [],
    specialtyDraft,
  );

  if (!isMounted || !user) {
    return null;
  }

  const companyId = user.companyId || user.id;

  // Barra global de Salvar/Descartar (LDMF-464): coordena as 3 seções de campo
  // que têm salvamento próprio (Especialidades, Horários, Pagamento). Cada
  // seção segue dona do seu dirty/handler; a barra só dispara as sujas, em
  // paralelo e independentes (uma falha não barra a outra — Promise.allSettled),
  // e cada handler já dá o próprio toast. Só aparece quando há mudança pendente.
  // Dados fiscais, Endereço e Senha ficam de fora (fluxo próprio).
  const globalSaveSections = [
    {
      dirty: hasSpecialtyChanges,
      save: handleSaveSpecialties,
      discard: discardSpecialtyChanges,
    },
    {
      dirty: hasHoursChanges,
      save: handleSaveHours,
      discard: discardHoursChanges,
    },
    {
      dirty: hasPaymentMethodsChanges,
      save: handleSavePaymentMethods,
      discard: discardPaymentMethodsChanges,
    },
  ];
  const pendingSaveSections = globalSaveSections.filter(
    (section) => section.dirty,
  );
  const pendingSaveCount = pendingSaveSections.length;
  const isSavingAnySection =
    isSavingSpecialty || isSavingHours || isSavingPaymentMethods;

  const handleSaveAllSections = async () => {
    await Promise.allSettled(
      pendingSaveSections.map((section) => section.save()),
    );
  };
  const handleDiscardAllSections = () => {
    pendingSaveSections.forEach((section) => section.discard());
  };

  return (
    <AdminPageLayout
      title="Perfil da Empresa"
      icon={Building2}
      mainClassName="p-4 sm:p-6 lg:px-8"
      subtitle="A identidade que aparece para o cliente no app"
    >
      <div className="mx-auto max-w-[920px]">
        {profileError && !isLoadingProfile ? (
          <Card className="rounded-lg border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-none">
            {profileError}
          </Card>
        ) : (
          <>
            {/* Header row */}
            <div className="mb-4 flex justify-end">
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

            {/* No PC, Horário na coluna da esquerda e, à direita, Tipo de
                restaurante e Formas de Pagamento. Com o horário na largura
                toda os campos esticavam e sobrava um vão no meio da linha.
                No celular a ordem continua a do código: Tipo, Horário,
                Pagamento (LDMF-351). */}
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
              {/* Tipo de restaurante (até 3) — LDMF-395. Saiu das Informações
                  e virou seção própria. Salva pela barra global (LDMF-464). */}
              <SectionCard
                icon={UtensilsCrossed}
                title="Tipo de restaurante"
                subtitle={`até ${MAX_SPECIALTIES} — o que o cliente vê no app`}
                subtitleBelow
                className="lg:col-start-2 lg:row-start-1"
              >
                {isLoadingProfile ? (
                  <div className="grid grid-cols-1 gap-3 @lg:grid-cols-3">
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
                    <div className="grid grid-cols-1 gap-3 @lg:grid-cols-3">
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
                      Escolha os tipos e salve na barra. Até {MAX_SPECIALTIES}{" "}
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
                subtitleBelow
                className="lg:col-start-1 lg:row-span-2 lg:row-start-1"
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
                          className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2 @md:flex-nowrap"
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
                            // Card estreito (celular, ou meia tela no PC): os
                            // campos descem para uma linha inteira, senão o
                            // intervalo cortava a hora. As quebras seguem a
                            // largura do card, não a da tela (LDMF-351).
                            <div className="flex w-full flex-col gap-2 @md:w-auto @md:flex-1 @3xl:flex-row @3xl:items-center">
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
                subtitleBelow
                className="lg:col-start-2 lg:row-start-2"
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
                  <div className="grid grid-cols-1 gap-1.5 @sm:grid-cols-2">
                    {ACCEPTED_PAYMENT_METHODS.map((method) => (
                      <Skeleton key={method} className="h-10 rounded-md" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-1.5 @sm:grid-cols-2">
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
            </div>

            {/* Endereço da Empresa: um único endereço, editado no mesmo
                modal do perfil do cliente (LDMF-263). */}
            <SectionCard
              icon={MapPin}
              title="Endereço da Empresa"
              subtitle="O endereço da loja define o raio de entrega"
              className="mb-4"
            >
              {isLoadingAddresses ? (
                <Skeleton className="h-14 w-full rounded-md" />
              ) : !storeAddress ? (
                <div className="py-6 text-center">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="mb-3 text-[12.5px] text-muted-foreground">
                    Nenhum endereço cadastrado
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-md text-xs font-semibold"
                    onClick={openAddressModal}
                  >
                    <span className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Endereço
                    </span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                    <MapPin className="h-[15px] w-[15px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-foreground">
                      {storeAddress.street}, {storeAddress.number}
                    </span>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {storeAddress.neighborhood} - {storeAddress.city}/
                      {storeAddress.state} · CEP{" "}
                      {formatZipCode(storeAddress.zipCode)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-md"
                    aria-label="Editar endereço"
                    onClick={openAddressModal}
                  >
                    <Pencil className="h-[13px] w-[13px]" />
                  </Button>
                </div>
              )}
            </SectionCard>

            {isAddressModalOpen && (
              <DeliveryForm
                handleCloseAddressModal={closeAddressModal}
                handleAddAddress={handleSaveAddress}
                applyCoords={addressEditor.applyCoords}
                addressForm={addressEditor.addressForm}
                addressCoords={addressEditor.addressCoords}
                isSavingAddress={isSavingAddress}
                isLoadingCep={addressEditor.isLoadingCep}
                zipCodeHint={addressEditor.zipCodeHint}
                isEditing={!!editingAddressId}
                neighborhoodOptions={addressEditor.neighborhoodOptions}
                isLocatingPin={addressEditor.isLocatingPin}
                stateOptions={addressEditor.stateOptions}
                cityOptions={addressEditor.cityOptions}
                isLoadingCities={addressEditor.isLoadingCities}
                citiesError={addressEditor.citiesError}
                fieldLocks={addressEditor.fieldLocks}
                onStateChange={addressEditor.changeState}
                onCityChange={addressEditor.changeCity}
                onNeighborhoodChange={addressEditor.changeNeighborhood}
                isOtherNeighborhood={addressEditor.isOtherNeighborhood}
                isLoadingNeighborhoods={addressEditor.isLoadingNeighborhoods}
                onSelectOtherNeighborhood={addressEditor.selectOtherNeighborhood}
                onOtherNeighborhoodChange={addressEditor.changeOtherNeighborhood}
                isSearchingAddress={addressEditor.isSearchingAddress}
                addressNotFound={addressEditor.addressNotFound}
                streetSuggestion={addressEditor.streetSuggestion}
                onAcceptStreetSuggestion={addressEditor.acceptStreetSuggestion}
                onDismissStreetSuggestion={addressEditor.dismissStreetSuggestion}
                pinZoom={addressEditor.pinZoom}
                pinRecenterKey={addressEditor.pinRecenterKey}
                showReference
                showDefaultOption={false}
                placeLabel="sua loja"
              />
            )}

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
                    isPasswordVisible={showNewPassword}
                    onTogglePasswordVisibility={() => setShowNewPassword((prev) => !prev)}
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
                    isPasswordVisible={showNewPassword}
                    showPasswordToggle={false}
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

        {/* Barra global de Salvar/Descartar (LDMF-464): só aparece com mudança
            pendente. Fixa no rodapé no mobile (acima da navegação), estática no
            fim do conteúdo no desktop. Um único elemento responsivo (fixed no
            mobile, static no md+) pra não duplicar o nó. */}
        {pendingSaveCount > 0 && (
          <>
            {/* Respiro no mobile pra barra fixa não cobrir a última seção. */}
            <div className="h-24 md:hidden" aria-hidden />
            <div
              className={cn(
                "fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-40",
                "flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-lg",
                "md:static md:inset-x-0 md:bottom-auto md:z-auto md:mt-4 md:rounded-lg md:p-3 md:shadow-none",
              )}
            >
              <span className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
                {pendingSaveCount}{" "}
                {pendingSaveCount === 1
                  ? "alteração não salva"
                  : "alterações não salvas"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDiscardAllSections}
                disabled={isSavingAnySection}
                className="h-9 rounded-md px-3 text-xs font-semibold"
              >
                Descartar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSaveAllSections}
                disabled={isSavingAnySection}
                className="h-9 rounded-md px-3.5 text-xs font-semibold"
              >
                <div className="flex items-center gap-2">
                  <Save className="h-3.5 w-3.5" />
                  {isSavingAnySection ? "Salvando..." : "Salvar alterações"}
                </div>
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
