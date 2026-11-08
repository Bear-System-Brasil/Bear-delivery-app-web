"use client";

import dynamic from "next/dynamic";

import { OrderInfo } from "@/hooks";

type Props = {
  order: OrderInfo | null;
  lat: number;
  lng: number;
};

// Leaflet depende de `window`: o mapa só é carregado no navegador.
const LeafletDeliveringMap = dynamic(() => import("./leaflet-delivering-map"), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-[10px] bg-muted" />,
});

/**
 * Mapa do entregador em tempo real. A mensagem de status fica no tracker, para
 * não duplicar o mesmo bloco em cima do mapa.
 */
export function DeliveringMap({ order, lat, lng }: Props) {
  if (!order) return null;

  return (
    // `isolate` segura os z-index internos do Leaflet dentro do mapa.
    <div className="isolate overflow-hidden rounded-[10px] border border-border">
      <LeafletDeliveringMap lat={lat} lng={lng} />
    </div>
  );
}
