import type { ReactNode } from "react";

import { DeliveryAppHeader } from "@/components/delivery-dashboard/delivery-app-header";
import { DeliveryTabBar } from "@/components/delivery-dashboard/delivery-tab-bar";
import ProtectedRoute from "@/components/protected-route";
import { ROUTE_PERMISSIONS } from "@/utils/permissions";

/**
 * Casca da área de entregas: proteção de role, espaço reservado pra barra
 * própria e a barra.
 *
 * O `ProtectedRoute` vive aqui e não em cada página - além de tirar a
 * repetição, evita a barra de entregas piscar pra quem não tem a role
 * enquanto a checagem roda.
 *
 * O padding é daqui, não do `AppFrame`: a BottomBar do cliente se esconde
 * nestas rotas, então o layout raiz não reserva nada e quem reserva a altura
 * da própria barra é esta camada.
 *
 * O `DeliveryAppHeader` só aparece para quem não é entregador - a área é
 * standalone e deixava quem administra o restaurante sem saída para as outras
 * áreas de trabalho. Para o entregador ele não renderiza nada.
 */

/**
 * Fora do componente porque `ProtectedRoute` tem `allowedRoles` no array de
 * dependências de um efeito - um literal novo a cada render o re-dispara.
 *
 * A lista sai do mapa de permissões em vez de ser repetida aqui, pelo mesmo
 * motivo do layout de /financial-management: enquanto era literal
 * `["delivery"]`, este guard e o middleware podiam discordar em silêncio.
 */
const DELIVERY_ROLES = ROUTE_PERMISSIONS["/delivery-dashboard"] ?? [
  "delivery",
];

export default function DeliveryAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={DELIVERY_ROLES}>
      <div className="min-h-screen bg-muted pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <DeliveryAppHeader />
        {children}
      </div>
      <DeliveryTabBar />
    </ProtectedRoute>
  );
}
