"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

type Parts = ReturnType<typeof birthDateParts>;

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
 * na hora (nextBirthDateValue). Seletor: o ícone abre três colunas (dia, mês,
 * ano), no lugar do seletor nativo, que obriga a rolar dezenas de anos no
 * celular. Os dois ficam em sincronia.
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
  // Escolhas do seletor que ainda não fecham uma data (ex.: só o ano).
  const [picked, setPicked] = useState<Parts>(() => birthDateParts(value));

  // Digitar atualiza o seletor.
  useEffect(() => {
    setPicked(birthDateParts(value));
  }, [value]);

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
    if (next.day && next.month && next.year) {
      onChange(`${pad(next.day)}/${pad(next.month)}/${next.year}`);
    }
  };

  const days = Array.from(
    { length: picked.month ? daysInMonth(picked.month, picked.year) : 31 },
    (_, i) => i + 1,
  );
  const years = birthDatePickerYears();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
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
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Escolher data no calendário"
              className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Calendar className="h-5 w-5" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(e) => {
          // Sem foco automático no primeiro botão: o teclado do celular
          // fecharia e a lista rolaria para o topo. Rola até o que já está
          // escolhido.
          e.preventDefault();
          const content = e.currentTarget as HTMLElement | null;
          content
            ?.querySelectorAll<HTMLElement>('[aria-selected="true"]')
            .forEach((el) => el.scrollIntoView?.({ block: "center" }));
        }}
      >
        <div className="grid grid-cols-[1fr_1.6fr_1.2fr] divide-x divide-border">
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
        <div className="flex justify-end border-t border-border p-2">
          <Button type="button" className="h-11 px-6" onClick={() => setOpen(false)}>
            Pronto
          </Button>
        </div>
      </PopoverContent>

      {visibleError && (
        <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400 mt-1">
          {visibleError}
        </p>
      )}
    </Popover>
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
      <p className="px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="h-56 overflow-y-auto overscroll-contain px-1 pb-1"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === selected}
            onClick={() => onPick(o.value)}
            className={cn(
              "flex min-h-11 w-full items-center justify-center rounded-lg text-sm",
              o.value === selected
                ? "bg-brand-500 font-semibold text-white"
                : "hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
