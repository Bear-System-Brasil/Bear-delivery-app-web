"use client";

import { useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDefaultCopySource,
  getEmptyOpenDays,
  hasDayHours,
  type DayHours,
  type DayKey,
} from "@/constants/opening-hours";
import { cn } from "@/lib/utils";
import { padTime } from "@/utils";

type Props = {
  hours: DayHours[];
  onCopy: (source: DayKey, targets: DayKey[]) => void;
  /** A grade editável, que dá lugar à seleção enquanto escolhe os dias. */
  children: ReactNode;
};

type Selection = { source: DayKey; targets: DayKey[] };

const daysLabel = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

function summary(day: DayHours) {
  if (!hasDayHours(day)) return day.isOpen ? "Sem horário" : "Fechado";
  const base = `${padTime(day.openTime)} às ${padTime(day.closeTime)}`;
  return day.breakStart && day.breakEnd
    ? `${base} · intervalo ${padTime(day.breakStart)} às ${padTime(day.breakEnd)}`
    : base;
}

/**
 * "Trazer horário" do horário de funcionamento (LDMF-351).
 *
 * - Só um dia com horário: o clique copia direto para os dias marcados que
 *   ainda estão sem horário. Nada já preenchido é sobrescrito.
 * - Mais de um: a origem é ambígua, então o clique abre a seleção. Escolhe
 *   de qual dia copiar (começa na segunda) e quais dias recebem, inclusive
 *   dias já preenchidos ou salvos.
 *
 * A seleção é separada do checkbox de "aberto" da grade: escolher um dia
 * aqui não fecha nem abre nada até aplicar.
 */
export function OpeningHoursCopy({ hours, onCopy, children }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);

  const filledDays = hours.filter(hasDayHours);
  const labelOf = (key: DayKey) =>
    hours.find((day) => day.day === key)?.label ?? key;

  const start = () => {
    const source = getDefaultCopySource(hours);
    if (!source) return;
    const emptyDays = getEmptyOpenDays(hours);

    if (filledDays.length > 1) {
      // Já vem marcado o que receberia no modo direto.
      setSelection({ source, targets: emptyDays });
      return;
    }

    if (emptyDays.length === 0) {
      toast.info(
        `Marque os dias que vão receber o horário de ${labelOf(source)}.`,
      );
      return;
    }
    onCopy(source, emptyDays);
    toast.success(
      `Horário de ${labelOf(source)} trazido para ${daysLabel(emptyDays.length)}.`,
    );
  };

  const apply = () => {
    if (!selection || selection.targets.length === 0) return;
    onCopy(selection.source, selection.targets);
    toast.success(
      `Horário de ${labelOf(selection.source)} trazido para ${daysLabel(selection.targets.length)}.`,
    );
    setSelection(null);
  };

  const toggleTarget = (key: DayKey, checked: boolean) =>
    setSelection(
      (current) =>
        current && {
          ...current,
          targets: checked
            ? [...current.targets, key]
            : current.targets.filter((target) => target !== key),
        },
    );

  if (!selection) {
    return (
      <>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-muted-foreground">
            Preencha um dia, marque os outros e traga o mesmo horário.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={start}
            disabled={filledDays.length === 0}
            className="h-8 rounded-md px-3 text-xs font-semibold"
          >
            <Copy />
            Trazer horário
          </Button>
        </div>
        {children}
      </>
    );
  }

  const count = selection.targets.length;

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-foreground">
          Copiar de
        </span>
        <Select
          value={selection.source}
          onValueChange={(value) => {
            const source = value as DayKey;
            setSelection(
              (current) =>
                current && {
                  source,
                  targets: current.targets.filter(
                    (target) => target !== source,
                  ),
                },
            );
          }}
        >
          <SelectTrigger
            aria-label="Copiar de"
            className="h-8 w-[130px] rounded-md text-[13px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filledDays.map((day) => (
              <SelectItem key={day.day} value={day.day}>
                {day.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelection(null)}
            className="h-8 rounded-md px-3 text-xs font-semibold"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={apply}
            disabled={count === 0}
            className="h-8 rounded-md px-3.5 text-xs font-semibold"
          >
            {count === 0 ? "Escolha os dias" : `Aplicar a ${daysLabel(count)}`}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {hours.map((day) => {
          const isSource = day.day === selection.source;
          return (
            <label
              key={day.day}
              className={cn(
                "flex min-h-11 items-center gap-2.5 px-3 py-2",
                isSource ? "bg-muted/60" : "cursor-pointer",
              )}
            >
              {isSource ? (
                <span className="w-4 shrink-0" />
              ) : (
                <Checkbox
                  aria-label={`Trazer para ${day.label}`}
                  checked={selection.targets.includes(day.day)}
                  onCheckedChange={(checked) =>
                    toggleTarget(day.day, checked === true)
                  }
                  className="h-4 w-4 border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                />
              )}
              <span className="w-[72px] shrink-0 text-[13px] font-semibold text-foreground">
                {day.label}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] tabular-nums text-muted-foreground">
                {summary(day)}
              </span>
              {isSource && (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary">
                  origem
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
