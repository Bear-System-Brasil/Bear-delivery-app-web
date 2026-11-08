import type { ReactNode } from "react";
import {
  formatAddOnLine,
  getAddOnsHeading,
  mergeIdenticalItems,
} from "@/constants/order-management";
import { formatAddressLines, getCashChange, getOrderPaymentSummary } from "@/lib/delivery";
import { formatCurrency, formatPhone, formatPhoneDisplay } from "@/utils";
import {
  getCustomerName,
  getItemLineTotal,
  getItemName,
  getNamedAddOns,
  getOrderLabel,
  getOrderValues,
  getVariationName,
} from "./helpers";
import type { KitchenOrder, KitchenOrderItem } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Comanda impressa (80 mm) - duas vias num clique:
//
// - COZINHA: o que preparar, sem preço, telefone nem endereço;
// - ENTREGA (ou BALCÃO, na retirada): quem é o cliente, onde entregar, quanto
//   custa e se cobra ou já está pago.
//
// A segunda via começa em página nova (`break-before-page`); na térmica isso
// costuma virar o corte, mas depende do driver da impressora.
// ─────────────────────────────────────────────────────────────────────────────

const RULE = "───────────────────────";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <p className="text-center font-bold">=== {title} ===</p>
      {children}
    </div>
  );
}

function ViaHeader({
  title,
  restaurantName,
}: {
  title: string;
  restaurantName?: string | null;
}) {
  return (
    <div className="mb-2 text-center">
      <h2 className="text-base font-bold">{title}</h2>
      {restaurantName && <p className="font-bold">{restaurantName}</p>}
      <p>{RULE}</p>
    </div>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <p className={bold ? "flex justify-between gap-2 font-bold" : "flex justify-between gap-2"}>
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </p>
  );
}

function getPhone(order: KitchenOrder): string | null {
  const phone = order.customer?.phone?.trim();
  if (!phone) return null;
  return formatPhoneDisplay(formatPhone(phone)) || phone;
}

// ─────────────────────────────────────────────────────────────────────────────
// Via da cozinha
// ─────────────────────────────────────────────────────────────────────────────

function KitchenItem({ item }: { item: KitchenOrderItem }) {
  const addOns = getNamedAddOns(item);
  return (
    <div className="mb-1">
      <p className="font-bold">
        {item.quantity}x {getItemName(item)}
      </p>
      {item.observations && <p className="pl-2">Obs: {item.observations}</p>}
      {item.variations?.map((variation) => {
        const name = getVariationName(variation);
        if (!name) return null;
        return (
          <p key={variation.id} className="pl-2">
            Tamanho: {name}
            {variation.observations ? ` (${variation.observations})` : ""}
          </p>
        );
      })}
      {addOns.length > 0 && <p className="pl-2">{getAddOnsHeading(item.quantity)}</p>}
      {addOns.map((addon) => (
        <p key={addon.id} className="pl-4">
          + {formatAddOnLine(addon.name, addon.quantity, item.quantity)}
          {addon.observations ? ` (${addon.observations})` : ""}
        </p>
      ))}
    </div>
  );
}

function KitchenVia({
  order,
  items,
  restaurantName,
}: {
  order: KitchenOrder;
  items: KitchenOrderItem[];
  restaurantName?: string | null;
}) {
  const observations = order.observations?.trim();
  const deliveryObservations = order.delivery?.observations?.trim();

  return (
    <section aria-label="Via da cozinha">
      <ViaHeader title="COZINHA" restaurantName={restaurantName} />

      <div className="mb-2">
        <p className="text-sm font-bold">PEDIDO #{getOrderLabel(order)}</p>
        <p>Cliente: {getCustomerName(order)}</p>
        <p>{order.fulfillmentType === "PICKUP" ? "Retirada no local" : "Entrega"}</p>
        <p>Data: {new Date(order.created_at).toLocaleString("pt-BR")}</p>
      </div>

      <Section title="ITENS">
        {items.map((item) => (
          <KitchenItem key={item.id} item={item} />
        ))}
      </Section>

      {(observations || deliveryObservations) && (
        <Section title="OBSERVAÇÕES">
          {observations && <p className="font-bold">OBS: {observations}</p>}
          {deliveryObservations && (
            <p className="font-bold">ENTREGA: {deliveryObservations}</p>
          )}
        </Section>
      )}

      <p className="text-center">{RULE}</p>
      <p className="text-center text-[10px]">
        Impresso em {new Date().toLocaleString("pt-BR")}
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Via da entrega / balcão
// ─────────────────────────────────────────────────────────────────────────────

function CashierItem({ item }: { item: KitchenOrderItem }) {
  const lineTotal = getItemLineTotal(item);
  const sizes = (item.variations ?? []).flatMap((variation) => {
    const name = getVariationName(variation);
    return name ? [{ id: variation.id, name }] : [];
  });
  const addOns = getNamedAddOns(item);

  return (
    <div className="mb-1">
      <PriceRow
        label={`${item.quantity}x ${getItemName(item)}`}
        value={lineTotal === null ? "" : formatCurrency(lineTotal)}
      />
      {sizes.map((size) => (
        <p key={size.id} className="pl-2">
          {size.name}
        </p>
      ))}
      {addOns.map((addon) => (
        <p key={addon.id} className="pl-2">
          + {formatAddOnLine(addon.name, addon.quantity, item.quantity)}
        </p>
      ))}
    </div>
  );
}

function PaymentBlock({ order, isPickup }: { order: KitchenOrder; isPickup: boolean }) {
  const summary = getOrderPaymentSummary(order);
  const change = getCashChange(order);

  if (!summary) {
    return <p>Pagamento não informado</p>;
  }

  return (
    <>
      <p>Forma: {summary.methods.join(" + ")}</p>
      {summary.isPaid ? (
        <p className="font-bold">PAGO</p>
      ) : (
        <p className="font-bold">
          COBRAR {formatCurrency(summary.amountDue)} {isPickup ? "NA RETIRADA" : "NA ENTREGA"}
        </p>
      )}
      {change && (
        <>
          <p>Cliente paga com {formatCurrency(change.paysWith)}</p>
          <p className="font-bold">Separar {formatCurrency(change.changeDue)} de troco</p>
        </>
      )}
    </>
  );
}

function CashierVia({
  order,
  items,
  restaurantName,
}: {
  order: KitchenOrder;
  items: KitchenOrderItem[];
  restaurantName?: string | null;
}) {
  const isPickup = order.fulfillmentType === "PICKUP";
  const phone = getPhone(order);
  const address = order.delivery?.deliveryAddress;
  const addressLines = formatAddressLines(address);
  const reference = address?.reference?.trim();
  const deliveryObservations = order.delivery?.observations?.trim();
  const values = getOrderValues(order);

  return (
    <section aria-label={isPickup ? "Via do balcão" : "Via da entrega"} className="break-before-page">
      <ViaHeader title={isPickup ? "BALCÃO" : "ENTREGA"} restaurantName={restaurantName} />

      <div className="mb-2">
        <p className="text-sm font-bold">PEDIDO #{getOrderLabel(order)}</p>
        <p>Data: {new Date(order.created_at).toLocaleString("pt-BR")}</p>
        <p>Cliente: {getCustomerName(order)}</p>
        {phone && <p>Tel: {phone}</p>}
      </div>

      {!isPickup && (
        <Section title="ENDEREÇO">
          {addressLines.length > 0 ? (
            addressLines.map((line) => <p key={line}>{line}</p>)
          ) : (
            <p>Endereço não informado</p>
          )}
          {reference && <p>Ref.: {reference}</p>}
          {deliveryObservations && <p className="font-bold">Obs.: {deliveryObservations}</p>}
        </Section>
      )}

      <Section title="ITENS">
        {items.map((item) => (
          <CashierItem key={item.id} item={item} />
        ))}
      </Section>

      {values && (
        <Section title="VALORES">
          <PriceRow label="Subtotal" value={formatCurrency(values.subtotal)} />
          {!isPickup && values.shipping !== null && (
            <PriceRow label="Taxa de entrega" value={formatCurrency(values.shipping)} />
          )}
          {values.discount !== null && values.discount > 0 && (
            <PriceRow label="Desconto" value={`- ${formatCurrency(values.discount)}`} />
          )}
          <PriceRow label="TOTAL" value={formatCurrency(values.total)} bold />
        </Section>
      )}

      <Section title="PAGAMENTO">
        <PaymentBlock order={order} isPickup={isPickup} />
      </Section>

      <p className="text-center">{RULE}</p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Área de impressão (oculta - visível apenas em @media print)
// ─────────────────────────────────────────────────────────────────────────────

export function KitchenPrintArea({
  order,
  restaurantName,
}: {
  order: KitchenOrder | null;
  restaurantName?: string | null;
}) {
  if (!order) return null;

  // Linhas idênticas viram uma só ("6x"); qualquer diferença mantém separado.
  const items = mergeIdenticalItems(order.orderedItems ?? []);

  return (
    <div className="print-area hidden print:mx-auto print:block print:w-[80mm] print:bg-card print:font-mono print:text-xs print:text-black">
      <KitchenVia order={order} items={items} restaurantName={restaurantName} />
      <CashierVia order={order} items={items} restaurantName={restaurantName} />
    </div>
  );
}
