/**
 * Coordenação entre abas do mesmo navegador (LDMF-459).
 *
 * Com a gestão aberta em duas abas (Cozinha e Pedidos, por exemplo), cada
 * uma tem o próprio socket, o próprio som e o próprio lembrete: o pedido
 * tocava duas vezes e o lembrete também. Aqui ficam as duas peças que
 * resolvem isso:
 *
 * - `runInOneTab`: trava com a Web Locks API. Só a aba que pega a trava
 *   executa; as outras pulam. Sem suporte, executa (comportamento antigo).
 * - `notifyOtherTabs` / `onOtherTabsMessage`: BroadcastChannel, pra uma aba
 *   contar às outras que o pedido foi visto.
 *
 * Abas em aparelhos diferentes não se enxergam, e é o esperado: o tablet da
 * cozinha e o computador do caixa tocam cada um o seu.
 */

const CHANNEL_NAME = "bear:order-alerts";

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel =
    typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
  // No Node (testes), um canal aberto segura o processo.
  (channel as unknown as { unref?: () => void } | null)?.unref?.();
  return channel;
}

export function notifyOtherTabs(message: unknown): void {
  try {
    getChannel()?.postMessage(message);
  } catch {
    // Aba fechando ou canal indisponível: as outras seguem como antes.
  }
}

export function onOtherTabsMessage(handler: (message: unknown) => void): () => void {
  const c = getChannel();
  if (!c) return () => {};
  const listener = (event: MessageEvent) => handler(event.data);
  c.addEventListener("message", listener);
  return () => c.removeEventListener("message", listener);
}

/**
 * Executa `fn` em uma aba só. A trava fica presa por `holdMs` depois de
 * executar, pra que um evento que chegue às outras abas logo em seguida
 * (o mesmo pedido, recebido por cada socket) encontre a trava ocupada.
 */
export function runInOneTab(name: string, holdMs: number, fn: () => void): void {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) {
    fn();
    return;
  }
  void locks
    .request(`bear:${name}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      fn();
      if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
    })
    .catch(() => {
      // Só rejeita se `fn` lançar, e aí ela já rodou: não repete.
    });
}
