/**
 * Rotas que não mostram a barra de navegação inferior: fluxos focados que já
 * têm barra de ação fixa no rodapé (checkout) ou cabeçalho próprio com as
 * ações do papel (entregador), e as telas operacionais com menu lateral
 * próprio - cozinha e área financeira -, que não têm espaço vertical de
 * sobra. A nav do cliente (carrinho, pedidos etc.) não faz sentido
 * sobreposta ali.
 *
 * Vive aqui, e não dentro do `BottomBar`, porque o layout raiz precisa da
 * mesma resposta: ele reserva a altura da barra com `padding-bottom`, e
 * quando a barra some esse padding sobrava como espaço morto no fim da
 * página.
 */
export const BOTTOM_BAR_HIDDEN_ROUTES = [
  "/checkout",
  "/delivery-dashboard",
  "/kitchen",
  "/financial-management",
];

export function isBottomBarHidden(pathname: string): boolean {
  return BOTTOM_BAR_HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
