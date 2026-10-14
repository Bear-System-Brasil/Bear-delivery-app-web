/**
 * Identidade sonora do Bear Delivery.
 *
 * Os arquivos em `public/sounds` são gerados por
 * `scripts/generate-brand-sounds.mjs` — não são samples baixados, são
 * sintetizados. Para mexer no som, edite o script e rode de novo; não troque
 * os .mp3 na mão, senão a próxima geração sobrescreve.
 *
 * ─── O motivo ──────────────────────────────────────────────────────────────
 *
 * Em Ré maior:  D5 → A5 → G5 → B5
 *
 * Termina na sexta do acorde, aberto, sem resolver. A resolução (D6) só toca
 * quando o pedido chega. Tudo aqui é um pedaço desse motivo — é isso que faz
 * sons diferentes soarem como a mesma marca em vez de dez efeitos avulsos.
 *
 * A única exceção é `error`, que fica fora do motivo e fora do tom de
 * propósito: marca não assina fracasso.
 */

export type SoundName =
  | "cart-add"
  | "order-confirmed"
  | "step-preparing"
  | "step-ready"
  | "step-on-the-way"
  | "order-arrived"
  | "new-order"
  | "new-job"
  | "success"
  | "error";

export const SOUND_FILES: Record<SoundName, string> = {
  "cart-add": "/sounds/cart-add.mp3",
  "order-confirmed": "/sounds/order-confirmed.mp3",
  "step-preparing": "/sounds/step-preparing.mp3",
  "step-ready": "/sounds/step-ready.mp3",
  "step-on-the-way": "/sounds/step-on-the-way.mp3",
  "order-arrived": "/sounds/order-arrived.mp3",
  "new-order": "/sounds/new-order.mp3",
  "new-job": "/sounds/new-job.mp3",
  success: "/sounds/success.mp3",
  error: "/sounds/error.mp3",
};

/**
 * O que cada papel precisa ter em memória. Ninguém baixa os 149 KB inteiros:
 * o cliente nunca ouve o alerta de cozinha, o restaurante nunca ouve a
 * jornada de acompanhamento.
 */
export const SOUND_BUNDLES = {
  customer: [
    "cart-add",
    "order-confirmed",
    "step-preparing",
    "step-ready",
    "step-on-the-way",
    "order-arrived",
  ],
  restaurant: ["new-order", "success", "error"],
  courier: ["new-job", "success"],
} satisfies Record<string, SoundName[]>;

export type SoundBundle = keyof typeof SOUND_BUNDLES;

/**
 * Intervalo de repetição dos alertas que insistem até alguém agir.
 *
 * O arquivo de `new-order` tem 1,22 s, então 2,8 s deixa ~1,6 s de silêncio
 * entre as frases: insistente o bastante para não ser ignorado, espaçado o
 * bastante para não virar sirene contínua — que o cérebro aprende a filtrar.
 */
export const ALERT_LOOP_MS: Partial<Record<SoundName, number>> = {
  "new-order": 30_000,
  "new-job": 3200,
};
