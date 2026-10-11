"use client";

import { useRef, useState } from "react";
import { Bell, BellOff, Crosshair, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ChangePaymentMethodDialog } from "@/components/change-payment-method-dialog";
import {
  AcceptBlockedDialog,
  type AcceptBlock,
} from "@/components/delivery-dashboard/accept-blocked-dialog";
import { AcceptConfirmDialog } from "@/components/delivery-dashboard/accept-confirm-dialog";
import { DeliveryCard } from "@/components/delivery-dashboard/delivery-card";
import { LocationDialog } from "@/components/delivery-dashboard/location-dialog";
import { ReturnDialog } from "@/components/delivery-dashboard/return-dialog";
import {
  HeaderIconButton,
  ScreenHeader,
} from "@/components/delivery-dashboard/screen-header";
import { Button } from "@/components/ui/button";
import { useAcceptConfirmation } from "@/hooks/use-accept-confirmation";
import {
  useCourierPosition,
  type PositionFailure,
} from "@/hooks/use-courier-position";
import { useDeliveryDriver } from "@/hooks/use-delivery-driver";
import {
  getChangeablePayment,
  getNextStatus,
  pluralizeAvailable,
} from "@/lib/delivery";
import { checkAcceptDistance } from "@/lib/accept-distance";
import { buildPaymentMethodUpdate } from "@/lib/payment-update";
import { cn } from "@/lib/utils";
import type { Delivery, PaymentMethod } from "@/services/api";
import { PAYMENT_CHANGE_REQUEST_ENABLED } from "@/services/manager-requests";
import { useAuthStore } from "@/stores";
import { isManagementRole } from "@/utils/role-helpers";

type Filter = "all" | "inRoute" | "toPickUp" | "available";

function Group({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="text-[12px] font-bold text-muted-foreground">
          {count}
        </span>
      </div>
      {hint && (
        <p className="px-1 text-[12px] font-medium text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center">
      <p className="text-[13px] font-semibold text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

/**
 * Filtro no topo. Rolagem horizontal em vez de quebrar linha: com os
 * contadores, os botões não cabem numa tela de 320px, e duas linhas de
 * filtro empurram as entregas pra baixo.
 */
function FilterBar({
  value,
  onChange,
  options,
}: {
  value: Filter;
  onChange: (filter: Filter) => void;
  options: { key: Filter; label: string; count?: number }[];
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar entregas"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={cn(
            "h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold transition-colors",
            value === option.key
              ? "bg-selected text-selected-foreground"
              : "border border-border bg-card text-foreground hover:bg-muted",
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="ml-1.5 opacity-70">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function DeliveryDashboardPage() {
  const {
    isLoading,
    isError,
    refetch,
    inRouteDeliveries,
    toPickUpDeliveries,
    availableDeliveries,
    soundEnabled,
    toggleSound,
    acceptDelivery,
    acceptingId,
    advanceDelivery,
    advancingId,
    returnDelivery,
    returningId,
    isReturning,
    changePaymentMethod,
    requestPaymentChange,
    changingPaymentId,
    isChangingPayment,
    hasMorePages,
    counts,
  } = useDeliveryDriver();

  // A tela também é usada pela gerência (owner, admin, manager), que altera a
  // forma de pagamento direto. O entregador só avisa a gerência - e esse
  // botão fica escondido até o backend ter a rota (LDMF-284).
  const role = useAuthStore((state) => state.user?.role);
  const isManagement = isManagementRole(role);
  const canTouchPayment = isManagement || PAYMENT_CHANGE_REQUEST_ENABLED;
  const [paymentTarget, setPaymentTarget] = useState<Delivery | null>(null);

  const { shouldConfirm, setSkipConfirm } = useAcceptConfirmation();
  const { position, resolvePosition } = useCourierPosition();

  const [filter, setFilter] = useState<Filter>("all");
  const shows = (key: Filter) => filter === "all" || filter === key;

  const [acceptTarget, setAcceptTarget] = useState<Delivery | null>(null);
  const [returnTarget, setReturnTarget] = useState<Delivery | null>(null);

  // Diálogo de localização: abre sozinho quando o GPS falha no aceite, e pelo
  // botão do cabeçalho quando o entregador quer corrigir a posição.
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationPurpose, setLocationPurpose] = useState<"accept" | "adjust">(
    "adjust",
  );
  const [locationFailure, setLocationFailure] =
    useState<PositionFailure | null>(null);
  /** Entrega esperando a posição pra ser aceita. */
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
  /** Buscando GPS: o card trava antes mesmo de o request sair. */
  const [locatingForId, setLocatingForId] = useState<string | null>(null);
  /**
   * Número da tentativa de aceite em curso. Desistir avança o número, e a
   * resposta do GPS que chegar depois é descartada: com o aviso de permissão
   * aberto ela pode demorar indefinidamente, e liberar a localização mais
   * tarde aceitava a entrega da qual o entregador já tinha desistido
   * (medido no LDMF-314).
   */
  const acceptAttemptRef = useRef(0);
  /** Aceite barrado pela distância até o cliente, antes do request. */
  const [blocked, setBlocked] = useState<{
    delivery: Delivery;
    block: AcceptBlock;
  } | null>(null);

  /**
   * Aceitar exige a posição do entregador - o backend recusa sem ela.
   * `resolvePosition` usa o que o rastreamento já mediu, cai pro GPS, e só
   * incomoda o entregador (campo de texto) quando os dois falham.
   */
  const runAccept = async (deliveryId: string, onDone?: () => void) => {
    const attempt = ++acceptAttemptRef.current;
    setLocatingForId(deliveryId);
    try {
      const outcome = await resolvePosition();

      // Desistiu enquanto procurava, ou já há outra tentativa no lugar.
      if (attempt !== acceptAttemptRef.current) return;

      if (!outcome.ok) {
        // Sai do caminho do aceite pra não empilhar dois diálogos.
        setAcceptTarget(null);
        setPendingAcceptId(deliveryId);
        setLocationFailure(outcome.reason);
        setLocationPurpose("accept");
        setLocationOpen(true);
        return;
      }

      // Longe demais do cliente (ou sem como conferir): o backend aceitaria
      // e calcularia o frete com essa distância (LDMF-321). Se a entrega
      // sumiu da lista no meio do caminho, segue - o backend responde.
      const delivery = availableDeliveries.find(({ id }) => id === deliveryId);
      const check = delivery
        ? checkAcceptDistance(delivery, outcome.position.coords)
        : null;
      if (delivery && check && !check.ok) {
        setAcceptTarget(null);
        setBlocked({ delivery, block: check });
        return;
      }

      acceptDelivery(
        { id: deliveryId, coords: outcome.position.coords },
        { onSuccess: onDone },
      );
    } finally {
      // Uma tentativa cancelada não apaga o estado da que veio depois.
      if (attempt === acceptAttemptRef.current) setLocatingForId(null);
    }
  };

  /** Desiste do aceite que ainda está procurando a localização. */
  const cancelLocating = () => {
    acceptAttemptRef.current += 1;
    setLocatingForId(null);
  };

  /**
   * Um aceite por vez. Dois pedidos de GPS presos no mesmo aviso de
   * permissão viravam dois aceites quando a localização era liberada
   * (LDMF-314).
   */
  const acceptInProgress = locatingForId !== null || acceptingId !== null;

  // Com a confirmação desligada, o toque em Aceitar vai direto pro request.
  const handleAcceptRequest = (deliveryId: string) => {
    if (acceptInProgress) return;

    const delivery = availableDeliveries.find(({ id }) => id === deliveryId);
    if (!delivery) return;

    if (!shouldConfirm) {
      void runAccept(delivery.id);
      return;
    }

    setAcceptTarget(delivery);
  };

  const handleCloseAccept = () => {
    // Antes de o request sair, fechar é desistir. Depois, o request já está
    // no backend e só o diálogo fecha - o toast diz como terminou.
    if (acceptTarget && locatingForId === acceptTarget.id) cancelLocating();
    setAcceptTarget(null);
  };

  const handleConfirmAccept = (skipNext: boolean) => {
    if (!acceptTarget) return;

    if (skipNext) setSkipConfirm(true);

    // Fecha quando a resposta chega (o toast diz se deu certo). Numa falha de
    // conexão o diálogo fica aberto, pra tentar de novo sem refazer o caminho.
    void runAccept(acceptTarget.id, () => setAcceptTarget(null));
  };

  const handleLocationConfirmed = () => {
    setLocationOpen(false);
    setLocationFailure(null);

    const resumeId = pendingAcceptId;
    setPendingAcceptId(null);

    // A posição acabou de entrar no store: `runAccept` acha o cache fresco e
    // segue direto pro request, sem pedir GPS de novo.
    if (resumeId) void runAccept(resumeId);
  };

  const handleLocationClose = () => {
    setLocationOpen(false);
    setLocationFailure(null);

    if (pendingAcceptId) {
      setPendingAcceptId(null);
      toast.info("Entrega não aceita - sem localização não dá pra calcular o frete.");
    }
  };

  // A posição pode ser a errada: corrigir retoma o aceite, que passa pela
  // conferência de novo com a posição nova.
  const handleFixLocation = () => {
    if (!blocked) return;
    setPendingAcceptId(blocked.delivery.id);
    setBlocked(null);
    setLocationFailure(null);
    setLocationPurpose("accept");
    setLocationOpen(true);
  };

  const handleAdvance = (delivery: Delivery) => {
    const next = getNextStatus(delivery);
    if (!next) return;
    advanceDelivery({ id: delivery.id, next });
  };

  const handleConfirmReturn = (reason: string) => {
    if (!returnTarget || !reason) return;
    returnDelivery(
      { id: returnTarget.id, reason },
      { onSuccess: () => setReturnTarget(null) },
    );
  };

  const handleConfirmPayment = async (method: PaymentMethod, note: string) => {
    const payment = paymentTarget ? getChangeablePayment(paymentTarget) : null;
    if (!paymentTarget || !payment) return false;

    try {
      const response = isManagement
        ? await changePaymentMethod({
            deliveryId: paymentTarget.id,
            paymentId: payment.id,
            update: buildPaymentMethodUpdate(payment, method),
          })
        : await requestPaymentChange({
            deliveryId: paymentTarget.id,
            orderId: paymentTarget.orderId,
            paymentId: payment.id,
            paymentMethod: method,
            note: note || undefined,
          });
      return response.success;
    } catch {
      // O toast de erro já sai do onError da mutation.
      return false;
    }
  };

  // Card das corridas em andamento - igual em "Em rota" e "A coletar".
  const renderActiveCard = (delivery: Delivery) => (
    <DeliveryCard
      key={delivery.id}
      delivery={delivery}
      onAdvance={handleAdvance}
      onReturn={setReturnTarget}
      onChangePayment={canTouchPayment ? setPaymentTarget : undefined}
      changePaymentLabel={
        isManagement
          ? "Alterar forma de pagamento"
          : "Pagou de outro jeito? Avisar o gerente"
      }
      busy={
        advancingId === delivery.id ||
        returningId === delivery.id ||
        changingPaymentId === delivery.id
      }
    />
  );

  const subtitle =
    counts.mine > 0
      ? `${counts.mine} em andamento · ${pluralizeAvailable(counts.available)}`
      : pluralizeAvailable(counts.available);

  return (
    <>
      <ScreenHeader
        title="Minhas entregas"
        subtitle={subtitle}
        actions={
          <>
            <HeaderIconButton label="Atualizar" onClick={() => refetch()}>
              <RefreshCw className="h-5 w-5" />
            </HeaderIconButton>
            <HeaderIconButton
              label={
                position
                  ? "Corrigir minha localização"
                  : "Informar minha localização"
              }
              onClick={() => {
                setLocationFailure(null);
                setLocationPurpose("adjust");
                setLocationOpen(true);
              }}
            >
              <Crosshair className="h-5 w-5" />
            </HeaderIconButton>
            <HeaderIconButton
              label={soundEnabled ? "Silenciar alertas" : "Ativar alertas"}
              onClick={toggleSound}
            >
              {soundEnabled ? (
                <Bell className="h-5 w-5" />
              ) : (
                <BellOff className="h-5 w-5" />
              )}
            </HeaderIconButton>
          </>
        }
      />

      <main className="mx-auto max-w-md space-y-7 px-4 pt-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-48 animate-pulse rounded-2xl bg-card" />
            <div className="h-48 animate-pulse rounded-2xl bg-card" />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
            <p className="text-[14px] font-bold text-foreground">
              Não foi possível carregar suas entregas
            </p>
            <Button
              type="button"
              onClick={() => refetch()}
              className="mt-4 h-12 rounded-xl bg-brand-500 px-6 text-[15px] font-bold hover:bg-brand-600"
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <FilterBar
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "Todos" },
                { key: "inRoute", label: "Em rota", count: counts.inRoute },
                { key: "toPickUp", label: "A coletar", count: counts.toPickUp },
                { key: "available", label: "Disponíveis", count: counts.available },
              ]}
            />

            {/* Em "Todos", sem nada em andamento, um aviso só em vez de dois
                grupos vazios. No filtro específico o grupo aparece mesmo
                vazio, pra deixar claro que o filtro funcionou. */}
            {filter === "all" && counts.mine === 0 && (
              <EmptyState message="Você não tem nenhuma entrega em andamento." />
            )}

            {shows("inRoute") &&
              (filter === "inRoute" || inRouteDeliveries.length > 0) && (
                <Group title="Em rota" count={counts.inRoute}>
                  {inRouteDeliveries.length === 0 ? (
                    <EmptyState message="Nenhuma entrega em rota." />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {inRouteDeliveries.map(renderActiveCard)}
                    </div>
                  )}
                </Group>
              )}

            {shows("toPickUp") &&
              (filter === "toPickUp" || toPickUpDeliveries.length > 0) && (
                <Group title="A coletar" count={counts.toPickUp}>
                  {toPickUpDeliveries.length === 0 ? (
                    <EmptyState message="Nenhuma entrega esperando coleta." />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {toPickUpDeliveries.map(renderActiveCard)}
                    </div>
                  )}
                </Group>
              )}

            {shows("available") && (
              <Group title="Disponíveis" count={counts.available}>
                {availableDeliveries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
                    <Package className="mx-auto h-9 w-9 text-muted-foreground" />
                    <p className="mt-3 text-[14px] font-bold text-foreground">
                      Nenhuma entrega disponível
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                      Assim que surgir uma corrida por perto, avisamos por aqui.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {availableDeliveries.map((delivery) => (
                      <DeliveryCard
                        key={delivery.id}
                        delivery={delivery}
                        onAccept={handleAcceptRequest}
                        busy={
                          acceptingId === delivery.id ||
                          locatingForId === delivery.id
                        }
                        acceptLocked={acceptInProgress}
                      />
                    ))}
                  </div>
                )}
              </Group>
            )}

            {/* A rota pagina e a tela pede uma pagina so. Se houver mais,
                avisa - truncar em silencio e o que esta tela veio corrigir. */}
            {hasMorePages && (
              <p className="px-1 text-center text-[12px] font-semibold text-muted-foreground">
                Mostrando as entregas mais recentes. Há mais no histórico.
              </p>
            )}
          </>
        )}
      </main>

      <AcceptConfirmDialog
        delivery={acceptTarget}
        isAccepting={acceptingId !== null && acceptingId === acceptTarget?.id}
        isLocating={locatingForId !== null && locatingForId === acceptTarget?.id}
        onClose={handleCloseAccept}
        onConfirm={handleConfirmAccept}
      />

      <AcceptBlockedDialog
        delivery={blocked?.delivery ?? null}
        block={blocked?.block ?? null}
        onClose={() => setBlocked(null)}
        onFixLocation={handleFixLocation}
      />

      <LocationDialog
        open={locationOpen}
        purpose={locationPurpose}
        failure={locationFailure}
        onClose={handleLocationClose}
        onConfirmed={handleLocationConfirmed}
      />

      <ReturnDialog
        delivery={returnTarget}
        isReturning={isReturning}
        onClose={() => setReturnTarget(null)}
        onConfirm={handleConfirmReturn}
      />

      <ChangePaymentMethodDialog
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        currentMethod={
          paymentTarget
            ? getChangeablePayment(paymentTarget)?.paymentMethod
            : undefined
        }
        onConfirm={handleConfirmPayment}
        title={isManagement ? "Alterar forma de pagamento" : "Avisar o gerente"}
        description={
          isManagement
            ? `Pedido #${paymentTarget?.orderId.slice(0, 8) ?? ""}`
            : "O cliente pagou com outra forma? A gerência confirma a troca."
        }
        confirmLabel={isManagement ? "Salvar forma" : "Enviar aviso"}
        withNote={!isManagement}
        isLoading={isChangingPayment}
      />
    </>
  );
}
