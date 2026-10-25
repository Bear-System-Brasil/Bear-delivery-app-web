import type {
  OpeningHourDay,
  OpeningHoursResponse,
  UpdateOpeningHoursDay,
} from "@/services/api";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayHours {
  day: DayKey;
  label: string;
  isOpen: boolean;
  /** "HH:mm" */
  openTime: string;
  closeTime: string;
  /** Intervalo (almoço), opcional. Vazio quando não há. */
  breakStart?: string;
  breakEnd?: string;
}

/** Ordem da semana como aparece na tela (segunda a domingo). */
const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Segunda",
  tue: "Terça",
  wed: "Quarta",
  thu: "Quinta",
  fri: "Sexta",
  sat: "Sábado",
  sun: "Domingo",
};

/**
 * Horário de vitrine enquanto a API não manda `openingHours` preenchido
 * (TODO(backend): o campo já existe em GET /company/:id, mas vem vazio e o
 * contrato de escrita não foi confirmado). É o mesmo mock que a tela de
 * perfil da loja usa pra editar.
 */
export const DEFAULT_OPENING_HOURS: DayHours[] = [
  { day: "mon", label: "Segunda", isOpen: true, openTime: "18:00", closeTime: "23:00" },
  { day: "tue", label: "Terça", isOpen: true, openTime: "18:00", closeTime: "23:00" },
  { day: "wed", label: "Quarta", isOpen: true, openTime: "18:00", closeTime: "23:00" },
  { day: "thu", label: "Quinta", isOpen: true, openTime: "18:00", closeTime: "23:00" },
  { day: "fri", label: "Sexta", isOpen: true, openTime: "18:00", closeTime: "23:30" },
  { day: "sat", label: "Sábado", isOpen: true, openTime: "18:00", closeTime: "23:30" },
  { day: "sun", label: "Domingo", isOpen: false, openTime: "18:00", closeTime: "22:00" },
];

/** `Date.getDay()` começa no domingo (0). */
export function getTodayKey(date = new Date()): DayKey {
  return DAY_KEYS[(date.getDay() + 6) % 7];
}

/**
 * `day` de /opening-hours é 0-6 com domingo = 0, mesma convenção do
 * `Date.getDay()`. A tela lista de segunda a domingo, daí os dois mapas.
 */
const DAY_KEY_BY_NUMBER: Record<number, DayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export const DAY_NUMBER_BY_KEY: Record<DayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Horário só entra na tela se estiver em "HH:mm" (ou "H:mm"). */
function readTime(value: unknown): string {
  const time = String(value ?? "");
  return TIME_PATTERN.test(time) ? time : "";
}

/**
 * Monta a semana da tela a partir dos dias de /opening-hours.
 *
 * Dia ausente da resposta = fechado: o contrato não tem flag por dia, então
 * estar na lista é o que significa "abre nesse dia".
 *
 * Aceita tanto a resposta com envelope (`{ isOpen, linkedToCashRegister,
 * days }`) quanto um array cru de dias - o contrato só documenta o envelope
 * na rota pública, e tolerar os dois sai mais barato que adivinhar.
 */
export function toDayHours(raw: unknown): DayHours[] {
  const days = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { days?: unknown })?.days)
      ? ((raw as { days: unknown[] }).days)
      : [];

  const byDay = new Map<DayKey, DayHours>();

  for (const entry of days) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<OpeningHourDay>;

    const rawDay = String(
      (item as Record<string, unknown>).day ?? "",
    ).trim().toLowerCase();
    const key = DAY_ALIASES[rawDay] ?? DAY_KEY_BY_NUMBER[Number(rawDay)];
    if (!key) continue;

    const openTime = readTime(item.openTime);
    const closeTime = readTime(item.closeTime);

    const breakStart = readTime(item.breakStart);
    const breakEnd = readTime(item.breakEnd);
    // Meio intervalo não é intervalo - só vale com as duas pontas.
    const hasBreak = Boolean(breakStart && breakEnd);

    byDay.set(key, {
      day: key,
      label: DAY_LABELS[key],
      isOpen: Boolean(openTime && closeTime),
      openTime,
      closeTime,
      breakStart: hasBreak ? breakStart : "",
      breakEnd: hasBreak ? breakEnd : "",
    });
  }

  return DAY_KEYS.map(
    (day) =>
      byDay.get(day) ?? {
        day,
        label: DAY_LABELS[day],
        isOpen: false,
        openTime: "",
        closeTime: "",
        breakStart: "",
        breakEnd: "",
      },
  );
}

/**
 * Semana em branco: os sete dias fechados, sem horário.
 *
 * É o que a tela mostra quando não há nada salvo e também quando o GET
 * falha - sem isso o dono de loja nova não teria dia nenhum para marcar.
 * Ninguém muta essas entradas no lugar (`updateDay` sempre cria objeto
 * novo com spread), então dá para compartilhar a mesma referência.
 */
export const EMPTY_WEEK_HOURS: DayHours[] = toDayHours(null);

/**
 * Dias que já existem no servidor, entre os que o GET devolveu.
 *
 * Só esses não podem ser desmarcados: o PUT é upsert e não apaga, então
 * desmarcá-los não teria efeito. Dia que o dono acabou de marcar na tela
 * ainda não existe lá - desmarcar é só não criar, e isso é permitido.
 */
export function getPersistedDays(serverHours: DayHours[] | undefined): DayKey[] {
  return (serverHours ?? [])
    .filter((day) => day.isOpen)
    .map((day) => day.day);
}

/**
 * 00:00 no fechamento não vale: o back lê 00:00 como abertura do dia, então
 * fechar à meia-noite é 23:59 (LDMF-351).
 */
export function isMidnightClose(closeTime: string): boolean {
  return /^0?0:00$/.test(closeTime);
}

/**
 * Primeiro problema que impediria o save, ou `null` se estiver tudo certo.
 *
 * Sem isso o dia incompleto seria descartado em silêncio por
 * `toOpeningHoursDays` e o dono veria "salvo" sem ter salvo.
 */
export function findOpeningHoursError(hours: DayHours[]): string | null {
  // Semana em branco não tem o que salvar: o PUT sairia com `days: []` e,
  // sendo upsert, não mudaria nada - mas a tela diria "atualizado".
  if (!hours.some((day) => day.isOpen)) {
    return "Marque pelo menos um dia para salvar o horário.";
  }

  for (const day of hours) {
    if (!day.isOpen) continue;

    if (!day.openTime || !day.closeTime) {
      return `Informe abertura e fechamento de ${day.label}.`;
    }

    if (isMidnightClose(day.closeTime)) {
      return `${day.label} não pode fechar às 00:00. Para fechar à meia-noite, use 23:59.`;
    }

    if (Boolean(day.breakStart) !== Boolean(day.breakEnd)) {
      return `O intervalo de ${day.label} precisa de início e fim.`;
    }
  }

  return null;
}

/** Dia aberto com abertura e fechamento preenchidos. */
export function hasDayHours(day: DayHours): boolean {
  return day.isOpen && Boolean(day.openTime && day.closeTime);
}

/**
 * De onde o "Trazer horário" copia por padrão: o único dia com horário, ou a
 * segunda quando há mais de um. Se a segunda não tiver horário, o primeiro
 * dia da semana que tiver. `null` quando nenhum dia tem horário.
 */
export function getDefaultCopySource(hours: DayHours[]): DayKey | null {
  const filled = hours.filter(hasDayHours);
  return (filled.find((day) => day.day === "mon") ?? filled[0])?.day ?? null;
}

/**
 * Dias marcados como abertos e ainda sem horário: os que recebem o horário
 * quando só um dia tem horário, sem risco de sobrescrever nada.
 */
export function getEmptyOpenDays(hours: DayHours[]): DayKey[] {
  return hours
    .filter((day) => day.isOpen && !hasDayHours(day))
    .map((day) => day.day);
}

/**
 * Copia abertura, fechamento e intervalo de `source` para `targets`, que
 * passam a ficar abertos. Intervalo vazio na origem limpa o do destino:
 * o destino fica igual à origem.
 */
export function copyDayHours(
  hours: DayHours[],
  source: DayKey,
  targets: DayKey[],
): DayHours[] {
  const from = hours.find((day) => day.day === source);
  if (!from || !hasDayHours(from)) return hours;

  return hours.map((day) =>
    day.day !== source && targets.includes(day.day)
      ? {
          ...day,
          isOpen: true,
          openTime: from.openTime,
          closeTime: from.closeTime,
          breakStart: from.breakStart ?? "",
          breakEnd: from.breakEnd ?? "",
        }
      : day,
  );
}

/**
 * Corpo do PUT /opening-hours/me.
 *
 * Só vão os dias abertos e com as duas pontas preenchidas. Dia fechado fica
 * de fora - e é exatamente aí que mora a limitação do contrato: como o PUT
 * é upsert, omitir não apaga, então um dia que já existia no banco continua
 * lá. É por isso que a tela não deixa desmarcar um dia: desmarcar não teria
 * efeito nenhum no servidor, e o dono acharia que fechou.
 *
 * Marcar um dia novo funciona normal - o upsert cria.
 */
export function toOpeningHoursDays(hours: DayHours[]): UpdateOpeningHoursDay[] {
  return hours
    .filter((day) => day.isOpen && day.openTime && day.closeTime)
    .map((day) => {
      const payload: UpdateOpeningHoursDay = {
        day: DAY_NUMBER_BY_KEY[day.day],
        openTime: day.openTime,
        closeTime: day.closeTime,
      };

      if (day.breakStart && day.breakEnd) {
        payload.breakStart = day.breakStart;
        payload.breakEnd = day.breakEnd;
      }

      return payload;
    });
}

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

const DAY_ALIASES: Record<string, DayKey> = {
  mon: "mon", monday: "mon", seg: "mon", segunda: "mon", "1": "mon",
  tue: "tue", tuesday: "tue", ter: "tue", terca: "tue", terça: "tue", "2": "tue",
  wed: "wed", wednesday: "wed", qua: "wed", quarta: "wed", "3": "wed",
  thu: "thu", thursday: "thu", qui: "thu", quinta: "thu", "4": "thu",
  fri: "fri", friday: "fri", sex: "fri", sexta: "fri", "5": "fri",
  sat: "sat", saturday: "sat", sab: "sat", sabado: "sat", sábado: "sat", "6": "sat",
  sun: "sun", sunday: "sun", dom: "sun", domingo: "sun", "0": "sun", "7": "sun",
};

function pick(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Lê o `openingHours` da API quando vier num formato reconhecível
 * (`{ day|weekday, openTime|open, closeTime|close, isOpen? }` por dia).
 * Dias ausentes viram "Fechado". Devolve `null` quando não dá pra ler, e
 * quem chama cai no horário padrão.
 */
export function parseOpeningHours(raw: unknown): DayHours[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const byDay = new Map<DayKey, DayHours>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;

    const dayRaw = pick(item, ["day", "weekday", "dayOfWeek", "weekDay"]);
    const day = DAY_ALIASES[String(dayRaw ?? "").trim().toLowerCase()];
    if (!day) continue;

    const openTime = String(pick(item, ["openTime", "open", "opensAt", "start"]) ?? "");
    const closeTime = String(pick(item, ["closeTime", "close", "closesAt", "end"]) ?? "");
    const hasTimes = TIME_PATTERN.test(openTime) && TIME_PATTERN.test(closeTime);
    const isOpenRaw = pick(item, ["isOpen", "open_day", "enabled"]);
    const isOpen = typeof isOpenRaw === "boolean" ? isOpenRaw && hasTimes : hasTimes;

    byDay.set(day, {
      day,
      label: DAY_LABELS[day],
      isOpen,
      openTime: hasTimes ? openTime : "",
      closeTime: hasTimes ? closeTime : "",
    });
  }

  if (byDay.size === 0) return null;

  return DAY_KEYS.map(
    (day) =>
      byDay.get(day) ?? {
        day,
        label: DAY_LABELS[day],
        isOpen: false,
        openTime: "",
        closeTime: "",
      },
  );
}

function parseTimeToMinutes(timeStr: string): number | null {
  if (!TIME_PATTERN.test(timeStr)) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Descobre o próximo horário de abertura a partir da grade de horários da semana.
 * Retorna uma string amigável (ex: "Abre hoje às 18:00", "Abre amanhã às 11:30") ou null.
 */
export function getNextOpeningLabel(
  hours: DayHours[] | undefined | null,
  now = new Date(),
): string | null {
  if (!hours || hours.length === 0) return null;

  const currentDayNum = now.getDay(); // 0 = sun, 1 = mon, ...
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset++) {
    const targetDayNum = (currentDayNum + offset) % 7;
    const targetDayKey = DAY_KEY_BY_NUMBER[targetDayNum];
    const dayEntry = hours.find((h) => h.day === targetDayKey);

    if (
      !dayEntry ||
      !dayEntry.isOpen ||
      !dayEntry.openTime ||
      !dayEntry.closeTime
    ) {
      continue;
    }

    const openMin = parseTimeToMinutes(dayEntry.openTime);
    const closeMin = parseTimeToMinutes(dayEntry.closeTime);
    if (openMin === null || closeMin === null) continue;

    const breakStartMin = dayEntry.breakStart
      ? parseTimeToMinutes(dayEntry.breakStart)
      : null;
    const breakEndMin = dayEntry.breakEnd
      ? parseTimeToMinutes(dayEntry.breakEnd)
      : null;
    const hasBreak = breakStartMin !== null && breakEndMin !== null;

    if (offset === 0) {
      // Hoje: pode abrir no início do expediente ou após o intervalo
      if (currentMinutes < openMin) {
        return `Abre hoje às ${dayEntry.openTime}`;
      }
      if (
        hasBreak &&
        currentMinutes >= breakStartMin &&
        currentMinutes < breakEndMin
      ) {
        return `Abre hoje às ${dayEntry.breakEnd}`;
      }
      // Se o fechamento for no mesmo dia e já passou:
      if (closeMin > openMin && currentMinutes >= closeMin) {
        continue;
      }
      // Se passa da meia-noite (ex: 18:00 às 02:00)
      if (closeMin <= openMin) {
        if (currentMinutes >= closeMin && currentMinutes < openMin) {
          return `Abre hoje às ${dayEntry.openTime}`;
        }
      }
    } else if (offset === 1) {
      return `Abre amanhã às ${dayEntry.openTime}`;
    } else {
      return `Abre ${dayEntry.label.toLowerCase()} às ${dayEntry.openTime}`;
    }
  }

  return null;
}

export interface RestaurantOpenStatus {
  isOpen: boolean;
  reason?: string;
  nextOpeningLabel?: string | null;
  hasNoSchedule?: boolean;
}

/**
 * Resolve o status de aberto/fechado da loja considerando:
 * 1. Resposta da rota pública /opening-hours/:companyId (prioridade)
 * 2. Ausência de horários cadastrados (loja sem horário e sem caixa = fechada)
 * 3. Fallback para restaurant.isOpen quando a rota de horários não estiver disponível
 */
export function resolveRestaurantOpenStatus(
  openingHoursResponse?: OpeningHoursResponse | null,
  restaurantFallback?: { isOpen?: boolean } | object | null,
  now = new Date(),
): RestaurantOpenStatus {
  if (openingHoursResponse) {
    const days = toDayHours(openingHoursResponse);
    const hasConfiguredDays = days.some(
      (d) => d.isOpen && d.openTime && d.closeTime,
    );

    // Se a loja não segue o caixa e não tem nenhum horário configurado, ela não pode estar aberta
    if (!openingHoursResponse.linkedToCashRegister && !hasConfiguredDays) {
      return {
        isOpen: false,
        hasNoSchedule: true,
        reason:
          "Restaurante fechado no momento (nenhum horário de funcionamento cadastrado).",
        nextOpeningLabel: null,
      };
    }

    const isOpen = Boolean(openingHoursResponse.isOpen);
    if (!isOpen) {
      const nextOpening = getNextOpeningLabel(days, now);
      return {
        isOpen: false,
        hasNoSchedule: false,
        nextOpeningLabel: nextOpening,
        reason: nextOpening
          ? `Restaurante fechado no momento. ${nextOpening}.`
          : "Restaurante fechado no momento.",
      };
    }

    return {
      isOpen: true,
      hasNoSchedule: false,
      nextOpeningLabel: null,
    };
  }

  // Fallback quando a rota de horários não respondeu ou não foi chamada:
  if (
    restaurantFallback &&
    "isOpen" in restaurantFallback &&
    typeof (restaurantFallback as { isOpen?: unknown }).isOpen === "boolean"
  ) {
    const isOpen = (restaurantFallback as { isOpen: boolean }).isOpen;
    return {
      isOpen,
      reason: isOpen ? undefined : "Restaurante fechado no momento.",
      nextOpeningLabel: null,
    };
  }

  // Sem dado nenhum, padrão tolerante aberto
  return {
    isOpen: true,
    nextOpeningLabel: null,
  };
}
