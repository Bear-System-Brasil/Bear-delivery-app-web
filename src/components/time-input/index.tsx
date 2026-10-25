"use client";

import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  padTime,
  timeCaretPosition,
  timeFromTypedDigits,
  typeTimeDigit,
  typeTimeDigits,
} from "@/utils";

type Props = {
  /** "HH:mm", ou vazio quando não há horário. */
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
};

/**
 * Campo de hora 24h digitado (LDMF-351), no lugar do `<input type="time">`.
 *
 * O nativo deixa o navegador decidir a aparência: no Android abre o relógio
 * de ponteiros e, com o aparelho em inglês, mostra AM/PM. Aqui é texto com
 * teclado numérico: cada vez que o campo ganha foco a digitação recomeça e
 * os dígitos vão substituindo o "HH:MM" da esquerda para a direita
 * (typeTimeDigit).
 *
 * Apagar volta os dígitos para zero e nunca deixa o campo vazio: quem tira
 * o horário é o check do dia, e o intervalo tem o seu "×". É exceção à regra
 * "campo apagado é vazio" do CLAUDE.md, autorizada na conversa do LDMF-351.
 * O campo só aparece vazio ("--:--") enquanto nada foi digitado nele.
 */
export function TimeInput({
  value,
  onChange,
  disabled,
  invalid,
  className,
  ...props
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Dígitos digitados desde o último foco. Ref, não estado: só serve para
  // calcular o próximo valor, quem renderiza é `value`.
  const typedRef = useRef("");

  const display = padTime(value);

  // Cursor logo depois do último dígito digitado, para mostrar onde entra
  // o próximo.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input || !typedRef.current) return;
    const pos = timeCaretPosition(typedRef.current.length);
    input.setSelectionRange(pos, pos);
  }, [value]);

  const emit = (typed: string) => {
    typedRef.current = typed;
    onChange(timeFromTypedDigits(typed));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    // `inputType` diz se foi apagar ou digitar mesmo quando o dígito
    // substitui uma seleção (o valor encolhe sem ser apagar). Sem ele
    // (navegador antigo), vale o tamanho do valor.
    const { inputType, data } = e.nativeEvent as InputEvent;
    const isDeletion = inputType
      ? inputType.startsWith("delete")
      : next.length < display.length && next.length !== 1;

    if (isDeletion) {
      // No meio da digitação volta um dígito; logo depois do foco não há
      // dígito digitado, então zera: 00:00.
      emit(typedRef.current.slice(0, -1));
      return;
    }

    // O que entrou é o `data` do evento ou, sem ele, o caractere antes do
    // cursor.
    const caret = e.target.selectionStart ?? next.length;
    const inserted = data ? data.slice(-1) : next.slice(caret - 1, caret);
    const typed = typeTimeDigit(typedRef.current, inserted);
    // Dígito recusado: não chama onChange e o React devolve o valor anterior.
    if (typed !== null) emit(typed);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const typed = typeTimeDigits("", e.clipboardData.getData("text"));
    if (typed) emit(typed);
  };

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="--:--"
      maxLength={6}
      value={display}
      disabled={disabled}
      aria-invalid={invalid ? true : undefined}
      onChange={handleChange}
      onPaste={handlePaste}
      onFocus={(e) => {
        typedRef.current = "";
        e.currentTarget.select();
      }}
      // No celular o toque posiciona o cursor depois do foco e desfaz o
      // select(); impedir o mouseup mantém tudo selecionado.
      onMouseUp={(e) => e.preventDefault()}
      onBlur={() => {
        typedRef.current = "";
      }}
      className={cn(
        "tabular-nums",
        invalid && "border-red-500 focus-visible:ring-red-500",
        className,
      )}
    />
  );
}
