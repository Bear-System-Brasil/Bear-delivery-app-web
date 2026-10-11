"use client";

import type { ReactNode } from "react";
import {
  Banknote,
  Check,
  ChefHat,
  MapPin,
  MessageSquareText,
  Navigation,
  Package,
  Phone,
  Store,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildMapsLink,
  canReturn,
  canSeeCustomerData,
  formatVisibleAddressLines,
  getChangeablePayment,
  getCourierEarnings,
  getCustomerName,
  getCustomerPhone,
  getCustomerPhoto,
  getNextStatus,
  getOrderTotal,
  getPaymentSummary,
  getRestaurantLogo,
  getRestaurantName,
  isAvailable,
  isWaitingKitchen,
  isSameMoney,
  STATUS_LABEL,
  STATUS_TONE,
  type PaymentSummary,
} from "@/lib/delivery";
import type { Delivery } from "@/services/api";
import { formatCurrency } from "@/utils";

type Props = {
  delivery: Delivery;
  onAccept?: (id: string) => void;
  onAdvance?: (delivery: Delivery) => void;
  onReturn?: (delivery: Delivery) => void;
  /**
   * Troca da forma de pagamento. Quem chama decide o texto conforme a role:
   * a gerência altera direto, o entregador só avisa a gerência.
   */
  onChangePayment?: (delivery: Delivery) => void;
  changePaymentLabel?: string;
  /** Esta entrega tem um request em andamento - só ela trava, não a tela. */
  busy?: boolean;
  /**
   * Outra entrega está sendo aceita: o Aceitar desta espera, sem dizer
   * "Aceitando..." - um aceite por vez (LDMF-314).
   */
  acceptLocked?: boolean;
  /** Entregas fechadas: sem ações, só o registro do que aconteceu. */
  compact?: boolean;
};

function StatusChip({ status }: { status: Delivery["status"] }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Foto vinda do backend, com espaço reservado quando não houver.
 *
 * `<img>` cru como no resto do projeto (company-logo-upload, main-header):
 * são URLs de domínios que o next/image exigiria declarar em
 * `remotePatterns`, e uma URL fora da lista quebra a imagem em produção.
 */
function Thumb({
  src,
  alt,
  fallback,
  className,
}: {
  src: string | null;
  alt: string;
  fallback: ReactNode;
  className: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center bg-muted text-muted-foreground ${className}`}
      >
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`shrink-0 object-cover ${className}`}
    />
  );
}

/**
 * Dinheiro na porta. É a informação que muda o que o entregador faz ao
 * chegar, então "receber na entrega" tem peso visual de alerta e "pago
 * online" é discreto - ele só precisa saber que não cobra nada.
 */
function PaymentRow({ payment }: { payment: PaymentSummary | null }) {
  if (!payment) return null;

  const methods = payment.methods.join(" + ");

  if (payment.isPaid) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2.5">
        <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[13px] font-semibold text-muted-foreground">
          Pago online{methods && ` · ${methods}`}
        </p>
      </div>
    );
  }

  // Com troco, os três números na ordem em que a porta acontece: o cliente
  // entrega, ele devolve o troco, e sobra o valor do pedido. Sem a terceira
  // linha ele precisava subtrair de cabeça pra saber com quanto ficou.
  if (payment.changeDue !== null && payment.paysWith !== null) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/40">
        <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#1b7f4c] dark:text-emerald-400" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#1b7f4c] dark:text-emerald-400">
            Receber em dinheiro
          </p>
          <p className="mt-0.5 text-[15px] font-bold text-emerald-900 dark:text-emerald-200">
            Cliente paga com {formatCurrency(payment.paysWith)}
          </p>
          <p className="mt-0.5 text-[16px] font-extrabold text-emerald-900 dark:text-emerald-200">
            Levar {formatCurrency(payment.changeDue)} de troco
          </p>
          {/* `amountDue`, não `order.totalValue`: é o que fecha a conta
              (paga - troco = fica) e o que sobra com ele. Num pedido com
              parte já paga os dois diferem, e aí o total aparece separado
              no bloco de valores, que não some nesse caso. */}
          <p className="mt-1 text-[13px] font-semibold text-emerald-800/80 dark:text-emerald-300/80">
            Valor do pedido {formatCurrency(payment.amountDue)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/40">
      <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#1b7f4c] dark:text-emerald-400" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#1b7f4c] dark:text-emerald-400">
          A receber
        </p>
        <p className="mt-0.5 text-[16px] font-extrabold text-emerald-900 dark:text-emerald-200">
          {/* Sem valor utilizável, mostra só a forma - "R$ 0,00 a receber"
              seria uma afirmação errada sobre o dinheiro na porta. */}
          {payment.amountDue > 0 ? formatCurrency(payment.amountDue) : methods}
          {payment.amountDue > 0 && methods && (
            <span className="ml-1.5 text-[13px] font-bold">· {methods}</span>
          )}
        </p>
      </div>
    </div>
  );
}

export function DeliveryCard({
  delivery,
  onAccept,
  onAdvance,
  onReturn,
  onChangePayment,
  changePaymentLabel,
  busy = false,
  acceptLocked = false,
  compact = false,
}: Props) {
  // Antes do aceite, só a região: sem rua, nome, foto, telefone nem Maps.
  const showCustomer = canSeeCustomerData(delivery);
  const addressLines = formatVisibleAddressLines(delivery);
  const mapsLink = showCustomer ? buildMapsLink(delivery.deliveryAddress) : null;
  const phone = showCustomer ? getCustomerPhone(delivery) : null;
  const orderTotal = getOrderTotal(delivery);
  const earnings = getCourierEarnings(delivery);
  const nextStatus = getNextStatus(delivery);

  // Sem troco, o valor a receber JÁ É o total do pedido. Mostrar os dois é
  // o mesmo número com dois rótulos, e quem lê isso está na rua com pressa.
  const payment = getPaymentSummary(delivery);
  const totalRepeatsAmountDue =
    orderTotal !== null &&
    payment !== null &&
    !payment.isPaid &&
    isSameMoney(orderTotal, payment.amountDue);
  const observations = delivery.observations?.trim();
  const canChangePayment =
    !!onChangePayment && !!changePaymentLabel && getChangeablePayment(delivery) !== null;

  if (compact) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[13px] font-bold text-foreground">
            {addressLines[0] || getRestaurantName(delivery)}
          </p>
          <StatusChip status={delivery.status} />
        </div>
        <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground">
          {getRestaurantName(delivery)} · Pedido #{delivery.orderId.slice(0, 8)}
          {orderTotal !== null && ` · ${formatCurrency(orderTotal)}`}
        </p>
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Thumb
            src={getRestaurantLogo(delivery)}
            alt=""
            fallback={<Store className="h-4 w-4" />}
            className="h-9 w-9 rounded-lg"
          />
          <p className="truncate text-[14px] font-extrabold text-foreground">
            {getRestaurantName(delivery)}
          </p>
        </div>
        <StatusChip status={delivery.status} />
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Entregar em
            </p>
            {addressLines.length > 0 ? (
              <>
                <p className="mt-0.5 text-[16px] font-bold leading-snug text-foreground">
                  {addressLines[0]}
                </p>
                {addressLines.slice(1).map((line) => (
                  <p
                    key={line}
                    className="text-[13px] font-medium leading-snug text-muted-foreground"
                  >
                    {line}
                  </p>
                ))}
              </>
            ) : (
              <p className="mt-0.5 text-[15px] font-bold text-foreground">
                Endereço não informado
              </p>
            )}
            {showCustomer && delivery.deliveryAddress?.reference && (
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                Referência: {delivery.deliveryAddress.reference}
              </p>
            )}
          </div>
        </div>

        {observations && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-950/40">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Observação
              </p>
              <p className="mt-0.5 text-[14px] font-semibold leading-snug text-amber-900 dark:text-amber-200">
                {observations}
              </p>
            </div>
          </div>
        )}

        {showCustomer && (
          <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
            <Thumb
              src={getCustomerPhoto(delivery)}
              alt=""
              fallback={<User className="h-4 w-4" />}
              className="h-10 w-10 rounded-full"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Cliente
              </p>
              <p className="mt-0.5 truncate text-[14px] font-semibold text-foreground">
                {getCustomerName(delivery)}
              </p>
            </div>
          </div>
        )}

        <PaymentRow payment={payment} />

        {canChangePayment && (
          <button
            type="button"
            onClick={() => onChangePayment?.(delivery)}
            disabled={busy}
            className="-mt-1 w-full rounded-xl py-2 text-[13px] font-bold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
          >
            {changePaymentLabel}
          </button>
        )}

        <dl className="space-y-1.5">
          {orderTotal !== null && !totalRepeatsAmountDue && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-semibold text-muted-foreground">
                Total do pedido
              </dt>
              <dd className="text-[14px] font-bold text-foreground">
                {formatCurrency(orderTotal)}
              </dd>
            </div>
          )}
          {/* Só aparece quando o backend passar a mandar o ganho - ver
              `courierEarnings` em services/api.ts. */}
          {earnings !== null && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-bold text-foreground">
                Seu ganho
              </dt>
              <dd className="text-[17px] font-extrabold text-[#1b7f4c] dark:text-emerald-400">
                {formatCurrency(earnings)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[12px] font-medium text-muted-foreground">
              Pedido
            </dt>
            <dd className="text-[12px] font-semibold text-muted-foreground">
              #{delivery.orderId.slice(0, 8)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-4 py-3.5">
        {isAvailable(delivery) && onAccept && (
          <Button
            type="button"
            onClick={() => onAccept(delivery.id)}
            disabled={busy || acceptLocked}
            className="h-14 w-full rounded-xl bg-brand-500 text-[16px] font-extrabold text-white hover:bg-brand-600"
          >
            <Package className="mr-2 h-5 w-5" />
            {busy ? "Aceitando..." : "Aceitar entrega"}
          </Button>
        )}

        {/* Mesmo lugar e altura do botão de coletar, pra o card não pular
            quando a cozinha libera (a lista atualiza sozinha a cada 15s). */}
        {isWaitingKitchen(delivery) && onAdvance && (
          <div
            role="status"
            className="flex h-14 w-full items-center justify-center rounded-xl bg-muted text-[15px] font-bold text-muted-foreground"
          >
            <ChefHat className="mr-2 h-5 w-5" />
            Aguardando a cozinha
          </div>
        )}

        {nextStatus && onAdvance && (
          <Button
            type="button"
            onClick={() => onAdvance(delivery)}
            disabled={busy}
            className={
              nextStatus === "DELIVERED"
                ? "h-14 w-full rounded-xl bg-[#1b7f4c] text-[16px] font-extrabold text-white hover:bg-[#166b40]"
                : "h-14 w-full rounded-xl bg-zinc-900 text-[16px] font-extrabold text-white hover:bg-zinc-800"
            }
          >
            <Check className="mr-2 h-5 w-5" />
            {busy
              ? "Confirmando..."
              : nextStatus === "DELIVERED"
                ? "Entreguei o pedido"
                : "Coletei o pedido"}
          </Button>
        )}

        <div className="flex gap-2">
          {mapsLink && (
            <Button
              asChild
              variant="outline"
              className="h-12 flex-1 rounded-xl text-[14px] font-bold"
            >
              <a href={mapsLink} target="_blank" rel="noopener noreferrer">
                <Navigation className="mr-1.5 h-4 w-4" />
                Abrir no Maps
              </a>
            </Button>
          )}
          {/* Só depois do aceite (ver canSeeCustomerData) e com telefone
              utilizável no payload. */}
          {phone && (
            <Button
              asChild
              variant="outline"
              className="h-12 flex-1 rounded-xl text-[14px] font-bold"
            >
              <a href={`tel:${phone}`}>
                <Phone className="mr-1.5 h-4 w-4" />
                Ligar
              </a>
            </Button>
          )}
        </div>

        {canReturn(delivery) && onReturn && (
          <button
            type="button"
            onClick={() => onReturn(delivery)}
            disabled={busy}
            className="h-11 rounded-xl text-[13px] font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Não consigo fazer essa entrega
          </button>
        )}
      </div>
    </article>
  );
}
