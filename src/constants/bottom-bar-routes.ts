/**
 * Rotas que não mostram a barra de navegação inferior. Ficam de fora só o
 * checkout (fluxo focado do cliente, com barra fixa própria de finalizar) e
 * as duas telas operacionais de tela cheia - entregador (cabeçalho próprio
 * com as ações do papel) e cozinha -, que não têm espaço vertical de sobra.
 *
 * A área financeira (Finanças/Caixa/Configurações) VOLTOU a mostrar a nav:
 * sem ela a navegação de staff (Início/Gestão/Perfil) sumia e a barra fixa de
 * Entrada/Saída do Caixa ficava flutuando no vão de 4rem reservado pra nav.
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
];

export function isBottomBarHidden(pathname: string): boolean {
  return BOTTOM_BAR_HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
