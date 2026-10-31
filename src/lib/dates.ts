/**
 * Datas e fusos.
 *
 * O backend só trabalha com RFC3339 em UTC. A UI usa `datetime-local`
 * (hora local) e converte no envio, exibindo datas com `Intl` em pt-BR.
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
});

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Converte o valor de um input `datetime-local` (hora local) para RFC3339 UTC.
 *
 * Retorna `null` quando o valor é inválido, incluindo datas inexistentes como
 * `2026-02-31`.
 */
export function datetimeLocalToUtc(value: string): string | null {
  const match = LOCAL_DATETIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
    0,
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute) ||
    date.getSeconds() !== Number(second ?? 0)
  ) {
    return null;
  }

  return date.toISOString();
}

/** Converte um RFC3339 UTC para o valor exibido em `datetime-local`. */
export function utcToDatetimeLocal(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

/** Valor mínimo (`datetime-local`) para o próximo minuto, em hora local. */
export function nowDatetimeLocal(): string {
  return utcToDatetimeLocal(new Date().toISOString());
}

/** Texto da contagem regressiva até a revelação. */
export function formatRemaining(milliseconds: number): string {
  if (milliseconds <= 0) {
    return "Pronta para abrir";
  }

  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `Faltam ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Faltam ${hours}h ${minutes}min`;
  }

  return `Faltam ${minutes}min ${pad(seconds)}s`;
}

/** Formata data e hora em pt-BR. Payload inválido não quebra a tela (`API-10`). */
export function formatDateTimePtBr(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "Data indisponível";
  }

  return DATE_TIME_FORMATTER.format(date);
}

/** Formata apenas a data em pt-BR. */
export function formatDatePtBr(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "Data indisponível";
  }

  return DATE_FORMATTER.format(date);
}

/** Indica se a data RFC3339 já passou (ou é agora). */
export function isPastDate(iso: string, now: Date = new Date()): boolean {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return true;
  }

  return date.getTime() <= now.getTime();
}

/** Diferença em milissegundos até a data (negativa quando já passou). */
export function millisecondsUntil(iso: string, now: Date = new Date()): number {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getTime() - now.getTime();
}

/**
 * Instante limite para uma nova tentativa.
 *
 * Fica fora dos componentes para não chamar `Date.now` durante a renderização.
 */
export function retryDeadline(milliseconds: number): number {
  return Date.now() + milliseconds;
}

/** Relógio atual, isolado para manter os componentes puros. */
export function nowMs(): number {
  return Date.now();
}
