"use client";

import { type FormEvent, useId, useState } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetTitle } from "@/components/ui/sheet";
import {
  resolveAddressCoordinates,
  type SourcedCoords,
} from "@/lib/address-coordinates";
import { CepNotFoundError, fetchCepAddress } from "@/lib/cep";
import { cn } from "@/lib/utils";
import { formatCep } from "@/utils";

export const ADDRESS_LABELS = ["Casa", "Trabalho", "Outro"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

/** O que o header grava no cookie `userLocation` quando o cliente salva. */
export interface SavedDeliveryLocation {
  lat: number;
  lng: number;
  city: string;
  /** Endereço formatado pra exibir ("R. X, 304 - Bairro, Cidade - UF"). */
  address: string;
  label: AddressLabel;
}

type FormFields = {
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  reference: string;
};

type FieldName = keyof FormFields;

const EMPTY_FORM: FormFields = {
  zipCode: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  complement: "",
  reference: "",
};

const INPUT_CLASS =
  "h-12 rounded-xl border-border bg-card px-4 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-orange-400 focus-visible:ring-orange-400/40 aria-[invalid=true]:border-red-400";

const LABEL_CLASS = "text-[13px] font-bold text-foreground";

export function formatDeliveryAddress(
  fields: Pick<
    FormFields,
    "street" | "number" | "neighborhood" | "city" | "state"
  >,
  noNumber: boolean,
) {
  // "R. Machado de Assis, 304 - Santo Andrezinho, Castelo - ES"
  const streetLine = [fields.street, noNumber ? "s/n" : fields.number]
    .filter(Boolean)
    .join(", ");
  const cityLine = [fields.city, fields.state].filter(Boolean).join(" - ");
  const tail = [fields.neighborhood, cityLine].filter(Boolean).join(", ");

  return [streetLine, tail].filter(Boolean).join(" - ");
}

type Props = {
  onSave: (location: SavedDeliveryLocation) => void;
};

/**
 * Formulário "Seu endereço" do sheet de entrega. O CEP preenche o que der
 * (rua, bairro, cidade, UF) e o resto o cliente completa; ao salvar,
 * geocodificamos o endereço digitado - com a coordenada do CEP de reserva -
 * porque a home filtra as lojas por raio a partir desse ponto.
 */
export function DeliveryAddressForm({ onSave }: Props) {
  const idPrefix = useId();
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);
  const [noNumber, setNoNumber] = useState(false);
  const [label, setLabel] = useState<AddressLabel>("Casa");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>(
    {},
  );
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [cepCoords, setCepCoords] = useState<SourcedCoords | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fieldId = (name: FieldName) => `${idPrefix}-${name}`;

  const setField = (name: FieldName, value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setFormError("");
  };

  const lookupCep = async (zipCode: string) => {
    setCepStatus("loading");
    try {
      const result = await fetchCepAddress(zipCode);
      setFields((current) => ({
        ...current,
        // Só cobre o que estiver vazio: quem já digitou a rua não perde.
        street: current.street || result.street,
        neighborhood: current.neighborhood || result.neighborhood,
        city: current.city || result.city,
        state: current.state || result.state,
      }));
      setCepCoords(
        result.coords ? { coords: result.coords, source: "cep" } : null,
      );
      setCepStatus("idle");
    } catch (error) {
      setCepCoords(null);
      setCepStatus("error");
      if (!(error instanceof CepNotFoundError)) {
        setFormError("Não conseguimos consultar o CEP. Preencha a rua.");
      }
    }
  };

  const handleZipCodeChange = (value: string) => {
    const formatted = formatCep(value);
    setField("zipCode", formatted);
    setCepStatus("idle");

    if (formatted.replace(/\D/g, "").length === 8) {
      lookupCep(formatted);
    } else {
      setCepCoords(null);
    }
  };

  const validate = () => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!fields.street.trim()) next.street = "Informe a rua";
    if (!noNumber && !fields.number.trim()) next.number = "Informe o número";
    if (!fields.city.trim()) next.city = "Informe a cidade";
    if (fields.state.trim().length !== 2) next.state = "UF";
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setFormError("Preencha os campos destacados.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const resolved = await resolveAddressCoordinates(
        {
          zipCode: fields.zipCode,
          street: fields.street,
          number: noNumber ? "" : fields.number,
          neighborhood: fields.neighborhood,
          city: fields.city,
          state: fields.state,
        },
        cepCoords,
      );

      if (!resolved) {
        setFormError(
          "Não encontramos esse endereço no mapa. Confira rua, cidade e estado.",
        );
        return;
      }

      onSave({
        lat: resolved.coords.lat,
        lng: resolved.coords.lng,
        city: fields.city.trim(),
        address: formatDeliveryAddress(
          {
            street: fields.street.trim(),
            number: fields.number.trim(),
            neighborhood: fields.neighborhood.trim(),
            city: fields.city.trim(),
            state: fields.state.trim().toUpperCase(),
          },
          noNumber,
        ),
        label,
      });
    } catch {
      setFormError("Não foi possível salvar o endereço. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const cepHint =
    cepStatus === "loading"
      ? "Buscando CEP..."
      : cepStatus === "error"
        ? "CEP não encontrado. Preencha a rua abaixo."
        : "Não sabe o CEP? Deixe em branco e preencha a rua";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto w-full max-w-xl space-y-4"
    >
      <div className="space-y-1">
        <SheetTitle className="text-xl font-extrabold tracking-tight text-foreground">
          Seu endereço
        </SheetTitle>
        <p className="text-[13px] text-muted-foreground">
          Comece pelo CEP — preenchemos o que der
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 p-3">
        <div className="flex items-start gap-3">
          <span className="mt-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
            <Mail className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={fieldId("zipCode")} className={LABEL_CLASS}>
              CEP
            </Label>
            <Input
              id={fieldId("zipCode")}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="29360-000"
              value={fields.zipCode}
              onChange={(event) => handleZipCodeChange(event.target.value)}
              className={INPUT_CLASS}
              maxLength={9}
            />
          </div>
        </div>
        <p
          className={cn(
            "mt-2 text-xs text-muted-foreground",
            cepStatus === "error" && "text-orange-600 dark:text-orange-400",
          )}
          aria-live="polite"
        >
          {cepHint}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fieldId("street")} className={LABEL_CLASS}>
          Rua / avenida
        </Label>
        <Input
          id={fieldId("street")}
          autoComplete="address-line1"
          placeholder="R. Machado de Assis"
          value={fields.street}
          onChange={(event) => setField("street", event.target.value)}
          aria-invalid={Boolean(errors.street)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("number")} className={LABEL_CLASS}>
            Número
          </Label>
          <Input
            id={fieldId("number")}
            inputMode="numeric"
            placeholder="304"
            value={noNumber ? "" : fields.number}
            disabled={noNumber}
            onChange={(event) => setField("number", event.target.value)}
            aria-invalid={Boolean(errors.number)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("neighborhood")} className={LABEL_CLASS}>
            Bairro
          </Label>
          <Input
            id={fieldId("neighborhood")}
            autoComplete="address-level3"
            placeholder="Santo Andrezinho"
            value={fields.neighborhood}
            onChange={(event) => setField("neighborhood", event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-no-number`}
          checked={noNumber}
          onCheckedChange={(checked) => {
            const value = checked === true;
            setNoNumber(value);
            if (value) setField("number", "");
          }}
          className="h-[18px] w-[18px] rounded-[5px] border-border data-[state=checked]:border-orange-500 data-[state=checked]:bg-orange-500 data-[state=checked]:text-white"
        />
        <Label
          htmlFor={`${idPrefix}-no-number`}
          className="cursor-pointer text-[13px] font-medium text-muted-foreground"
        >
          Sem número
        </Label>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("city")} className={LABEL_CLASS}>
            Cidade
          </Label>
          <Input
            id={fieldId("city")}
            autoComplete="address-level2"
            placeholder="Castelo"
            value={fields.city}
            onChange={(event) => setField("city", event.target.value)}
            aria-invalid={Boolean(errors.city)}
            className={INPUT_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("state")} className={LABEL_CLASS}>
            Estado
          </Label>
          <Input
            id={fieldId("state")}
            autoComplete="address-level1"
            placeholder="ES"
            value={fields.state}
            onChange={(event) =>
              setField("state", event.target.value.toUpperCase())
            }
            aria-invalid={Boolean(errors.state)}
            className={cn(INPUT_CLASS, "uppercase")}
            maxLength={2}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fieldId("complement")} className={LABEL_CLASS}>
          Complemento{" "}
          <span className="font-medium text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id={fieldId("complement")}
          autoComplete="address-line2"
          placeholder="Apto 12, bloco B"
          value={fields.complement}
          onChange={(event) => setField("complement", event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fieldId("reference")} className={LABEL_CLASS}>
          Ponto de referência
        </Label>
        <Input
          id={fieldId("reference")}
          placeholder="Ex.: portão azul, ao lado da padaria"
          value={fields.reference}
          onChange={(event) => setField("reference", event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className={LABEL_CLASS}>Salvar como</legend>
        <div className="grid grid-cols-3 gap-2">
          {ADDRESS_LABELS.map((option) => {
            const isActive = option === label;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isActive}
                onClick={() => setLabel(option)}
                className={cn(
                  "h-11 rounded-full border text-sm font-semibold transition-colors",
                  isActive
                    ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    : "border-border bg-card text-foreground hover:border-orange-200 dark:hover:border-orange-800",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      {formError && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400"
        >
          {formError}
        </p>
      )}

      <Button
        type="submit"
        disabled={saving || cepStatus === "loading"}
        className="h-12 w-full rounded-xl bg-orange-500 text-[15px] font-bold text-white hover:bg-orange-600"
      >
        {saving ? "Salvando..." : "Salvar endereço"}
      </Button>
    </form>
  );
}
