"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BIRTH_DATE_MESSAGES,
  birthDatePickerYears,
  birthDateParts,
  daysInMonth,
  isCompleteDateFormat,
  maskBirthDate,
  nextBirthDateValue,
} from "@/utils";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const MONTHS_SHORT = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];

type Parts = ReturnType<typeof birthDateParts>;

const isComplete = (p: Parts): p is { day: number; month: number; year: number } =>
  Boolean(p.day && p.month && p.year);

/** Data em destaque no topo do seletor, ex.: "15 de out. de 2000". */
const headline = (p: Parts) => {
  if (!p.day && !p.month && !p.year) return "Escolha a data";
  const day = p.day ? String(p.day) : "--";
  const month = p.month ? MONTHS_SHORT[p.month - 1] : "---";
  const year = p.year ? String(p.year) : "----";
  return `${day} de ${month} de ${year}`;
};

const pad = (n: number) => String(n).padStart(2, "0");

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
  /** Mensagem da regra (getBirthDateError) ou do back. */
  error?: string | null;
  /**
   * Por padrão "data incompleta" só aparece com a data completa, para não
   * acusar a cada dígito. true mostra mesmo incompleta (ex.: depois de tentar
   * salvar). Os outros erros aparecem sempre.
   */
  showIncompleteError?: boolean;
  className?: string;
};

/**
 * Campo de data de nascimento do cadastro e do perfil (LDMF-303).
 *
 * Digitado: teclado numérico, máscara dd/mm/aaaa e dígito impossível recusado
 * na hora (nextBirthDateValue). Seletor: o ícone abre um modal com três colunas
 * (dia, mês, ano), no estilo do seletor do Material, no lugar do seletor nativo,
 * que obriga a rolar dezenas de anos no celular. O modal só preenche o campo
 * no OK; Cancelar, tocar fora, Esc e o voltar do celular fecham sem mudar nada.
 */
export function BirthDateInput({
  id,
  value,
  onChange,
  onBlur,
  name,
  disabled,
  error,
  showIncompleteError = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  // Rascunho do seletor: só vira valor do campo no OK.
  const [picked, setPicked] = useState<Parts>(() => birthDateParts(value));

  // O seletor abre com o que está digitado no campo.
  const openPicker = () => {
    setPicked(birthDateParts(value));
    setOpen(true);
  };

  // Voltar do celular fecha o seletor (equivale a Cancelar) em vez de sair da
  // página. Com o seletor aberto há uma entrada a mais no histórico; ao fechar
  // por outro caminho, ela é desfeita. O estado do Next é mantido no
  // pushState para o roteador seguir na mesma página.
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...window.history.state, birthDatePicker: true }, "");
    let closedByBack = false;
    const onPopState = () => {
      closedByBack = true;
      setOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!closedByBack && window.history.state?.birthDatePicker) {
        window.history.back();
      }
    };
  }, [open]);

  const visibleError =
    error &&
    (error !== BIRTH_DATE_MESSAGES.incomplete ||
      showIncompleteError ||
      isCompleteDateFormat(value))
      ? error
      : null;

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    // Colar tratado aqui: o maxLength do input cortaria um texto como
    // "Nascido em 15/10/2000" antes de chegar nos números.
    e.preventDefault();
    const input = e.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const pasted = e.clipboardData.getData("text");
    onChange(maskBirthDate(value.slice(0, start) + pasted + value.slice(end)));
  };

  const pick = (part: keyof Parts, n: number) => {
    const next = { ...picked, [part]: n };
    // A coluna de dia se ajusta ao mês: 31 vira 30 em abril, 29 vira 28 em
    // fevereiro de ano comum.
    if (next.day && next.month) {
      next.day = Math.min(next.day, daysInMonth(next.month, next.year));
    }
    setPicked(next);
  };

  const confirm = () => {
    if (!isComplete(picked)) return;
    onChange(`${pad(picked.day)}/${pad(picked.month)}/${picked.year}`);
    setOpen(false);
  };

  const days = Array.from(
    { length: picked.month ? daysInMonth(picked.month, picked.year) : 31 },
    (_, i) => i + 1,
  );
  const years = birthDatePickerYears();

  return (
    <>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="DD/MM/AAAA"
          maxLength={10}
          value={value}
          onChange={(e) => onChange(nextBirthDateValue(value, e.target.value))}
          onPaste={handlePaste}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={visibleError ? true : undefined}
          aria-describedby={visibleError ? `${id}-error` : undefined}
          className={cn(
            "pr-12 rounded-xl border-2 border-border focus:border-brand-400",
            visibleError && "border-red-500 focus:border-red-500",
            className,
          )}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={openPicker}
          aria-haspopup="dialog"
          aria-label="Escolher data no calendário"
          className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Calendar className="h-5 w-5" />
        </button>
      </div>
      {visibleError && (
        <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400 mt-1">
          {visibleError}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideClose
          aria-describedby={undefined}
          className="w-[calc(100%-2rem)] max-w-[320px] gap-0 overflow-hidden rounded-3xl border-0 bg-neutral-100 p-0 sm:w-full sm:rounded-3xl dark:bg-neutral-800"
          onOpenAutoFocus={(e) => {
            // Foco no próprio modal, não no primeiro dia da lista; e cada
            // coluna rola até o que já está escolhido.
            e.preventDefault();
            const content = e.currentTarget as HTMLElement | null;
            content
              ?.querySelectorAll<HTMLElement>('[aria-selected="true"]')
              .forEach((el) => el.scrollIntoView?.({ block: "center" }));
            content?.focus();
          }}
        >
          <div className="px-6 pb-3 pt-5">
            <DialogTitle className="text-xs font-medium tracking-wide text-neutral-600 dark:text-neutral-300">
              Data de nascimento
            </DialogTitle>
            <p
              aria-live="polite"
              data-testid="birth-date-headline"
              className="mt-1 text-[1.75rem] font-normal leading-tight text-neutral-900 dark:text-neutral-50"
            >
              {headline(picked)}
            </p>
          </div>

          <div className="mx-3 grid grid-cols-[1fr_1.5fr_1.2fr] gap-1 rounded-2xl bg-neutral-50 p-1 dark:bg-neutral-900">
            <PickerColumn
              label="Dia"
              options={days.map((d) => ({ value: d, label: pad(d) }))}
              selected={picked.day}
              onPick={(d) => pick("day", d)}
            />
            <PickerColumn
              label="Mês"
              options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
              selected={picked.month}
              onPick={(m) => pick("month", m)}
            />
            <PickerColumn
              label="Ano"
              options={years.map((y) => ({ value: y, label: String(y) }))}
              selected={picked.year}
              onPick={(y) => pick("year", y)}
            />
          </div>

          <div className="flex justify-end gap-2 px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-full px-5 text-neutral-700 hover:bg-neutral-200 dark:text-neutral-200 dark:hover:bg-neutral-700"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!isComplete(picked)}
              className="h-11 rounded-full bg-brand-200 px-7 font-semibold text-brand-950 hover:bg-brand-300 disabled:opacity-50"
              onClick={confirm}
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PickerColumn({
  label,
  options,
  selected,
  onPick,
}: {
  label: string;
  options: { value: number; label: string }[];
  selected: number | null;
  onPick: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Ao trocar a escolha por outra coluna (ex.: dia ajustado ao mês), mantém o
  // escolhido à vista.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  return (
    <div className="flex flex-col">
      <p className="px-2 py-1.5 text-center text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="h-52 overflow-y-auto overscroll-contain px-0.5 pb-1"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === selected}
            onClick={() => onPick(o.value)}
            className={cn(
              "flex min-h-11 w-full items-center justify-center rounded-full text-sm",
              o.value === selected
                ? "bg-brand-100 font-semibold text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                : "text-neutral-800 hover:bg-neutral-200 dark:text-neutral-200 dark:hover:bg-neutral-700",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
