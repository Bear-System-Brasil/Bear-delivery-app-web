"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";

import { toast } from "sonner";

import { DeliveryInfo } from "@/hooks";
import { cn } from "@/lib/utils";
import { formatCep } from "@/utils";

import {
  Check,
  Clock,
  CreditCard,
  LocateFixed,
  MapPin,
  Phone,
  Plus,
  Store,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { AddressMap } from "@/components/address-map";
import {
  parseBrasilApiCoords,
  type CoordinateSource,
  type SourcedCoords,
} from "@/lib/address-coordinates";
import { Address } from "@/services/api";
import { Restaurant } from "@/stores/cart-store";
import { Coords } from "@/types/restaurant";

type Props = {
  handleInputChange: (field: string, value: string | number) => void;
  applyCoords: (coords: Coords | null, source: CoordinateSource) => void;
  setSelectedAddressId: Dispatch<SetStateAction<string | null>>;
  setAddressMode: Dispatch<SetStateAction<"select" | "new">>;
  handleAddressSelect: (addressId: string) => void;
  setSaveAddress: Dispatch<SetStateAction<boolean>>;
  addressMode: "select" | "new";
  deliveryInfo: DeliveryInfo;
  addressCoords: SourcedCoords | null;
  loadingAddresses: boolean;
  saveAddress: boolean;
  userAddresses: Address[];
  selectedAddressId: string | null;
  orderType: "delivery" | "pickup";
  setOrderType: Dispatch<SetStateAction<"delivery" | "pickup">>;
  restaurant: Restaurant | null;
  hasCpf?: boolean;
};

type FieldProps = {
  htmlFor: string;
  label: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
};

const fieldLabelClass = "text-[11px] font-bold text-foreground";
const inputClass =
  "h-9 rounded-lg border-border bg-card text-sm shadow-none focus-visible:border-brand-400 focus-visible:ring-brand-200";

function Field({ htmlFor, label, optional, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}{" "}
        {optional && (
          <span className="font-semibold text-muted-foreground">(opcional)</span>
        )}
      </Label>
      {children}
    </div>
  );
}

export function DeliveryForm({
  handleInputChange,
  applyCoords,
  setSelectedAddressId,
  setAddressMode,
  handleAddressSelect,
  setSaveAddress,
  addressMode,
  deliveryInfo,
  addressCoords,
  loadingAddresses,
  userAddresses,
  saveAddress,
  selectedAddressId,
  orderType,
  setOrderType,
  restaurant,
  hasCpf,
}: Props) {
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  // CEP de cidade com CEP único (13930000, Serra Negra) volta sem rua e sem
  // bairro: a tela avisa, em vez de prometer que "os campos serao
  // preenchidos".
  const [cepWithoutStreet, setCepWithoutStreet] = useState(false);

  const handleGetData = async (zipCode: string) => {
    setIsLoadingCep(true);
    setCepWithoutStreet(false);
    try {
      const response = await fetch(
        `https://brasilapi.com.br/api/cep/v2/${zipCode}`,
      );

      if (!response.ok) {
        toast.error(
          response.status === 404 ? "CEP não encontrado" : "Erro ao buscar CEP",
        );
        return;
      }

      const data = await response.json();

      // Só sobrescreve o que o CEP trouxe. Antes cada campo recebia
      // `data.x || ""`, e um CEP sem rua (cidade de CEP único) apagava a rua
      // e o bairro que o cliente já tinha digitado - e o checkout travava
      // com "Preencha nome, telefone e endereço" (LDMF-350).
      if (data.street) handleInputChange("street", data.street);
      if (data.neighborhood) handleInputChange("neighborhood", data.neighborhood);
      if (data.city) handleInputChange("city", data.city);
      if (data.state) handleInputChange("state", data.state);

      setCepWithoutStreet(!data.street || !data.neighborhood);

      // A BrasilAPI já devolve a coordenada do logradouro - usa como ponto de
      // partida e centra o mapa nela. É a fonte de menor prioridade: some
      // assim que a geocodificação do endereço completo ou um clique no mapa
      // aparecerem.
      applyCoords(parseBrasilApiCoords(data), "cep");

      toast.success(
        data.street && data.neighborhood
          ? "CEP encontrado. Campos preenchidos."
          : "CEP encontrado. Confira rua e bairro.",
      );
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast.error("Erro ao buscar CEP. Verifique sua conexao.");
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleZipCode = (zipCode: string) => {
    handleInputChange("zipCode", zipCode);

    const cleanedZipCode = zipCode.replace(/\D/g, "");
    if (cleanedZipCode.length >= 8) {
      handleGetData(cleanedZipCode);
    }
  };

  const handleNewAddress = () => {
    setAddressMode((prev) => (prev === "select" ? "new" : "select"));

    if (addressMode === "select") {
      setSelectedAddressId(null);
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Localização indisponível neste dispositivo.");
      return;
    }

    // Só aqui, no toque do cliente. O GPS diz onde ele está agora, que nem
    // sempre é o endereço que ele está cadastrando - por isso nunca roda
    // sozinho, e quando roda vale como gesto explícito (prioridade máxima).
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyCoords(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          "manual",
        );
        toast.success("Localização capturada.");
      },
      () => {
        toast.error("Nao foi possivel capturar sua localização .");
      },
    );
  };

  const shouldShowNewAddress =
    !loadingAddresses && (addressMode === "new" || userAddresses.length === 0);

  return (
    <form className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setOrderType("delivery")}
          className={cn(
            "flex h-9 items-center justify-center rounded-md text-sm font-bold transition-colors",
            orderType === "delivery"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Entrega
        </button>
        <button
          type="button"
          onClick={() => setOrderType("pickup")}
          className={cn(
            "flex h-9 items-center justify-center rounded-md text-sm font-bold transition-colors",
            orderType === "pickup"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Retirar no local
        </button>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
            <User className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-extrabold text-foreground">
            Dados de {orderType === "pickup" ? "contato" : "entrega"}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <Field htmlFor="name" label="Nome completo">
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name"
                placeholder="Seu nome completo"
                value={deliveryInfo.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </Field>

          <Field htmlFor="phone" label="Telefone">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                placeholder="(11) 99999-9999"
                value={deliveryInfo.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </Field>

          {!hasCpf && (
            <Field htmlFor="cpf" label="CPF" className="md:col-span-2">
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={deliveryInfo.cpf || ""}
                  onChange={(e) => handleInputChange("cpf", e.target.value)}
                  maxLength={14}
                  className={cn(inputClass, "pl-9")}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Informe seu CPF para concluir o pedido.
              </p>
            </Field>
          )}
        </div>
      </section>

      {orderType === "delivery" && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
                <MapPin className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-extrabold text-foreground">
                Endereço de entrega
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseLocation}
                className="h-8 px-2 text-xs font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:text-brand-700 dark:hover:text-brand-400"
              >
                <LocateFixed className="h-4 w-4" />
                Usar localização
              </Button>

              {!loadingAddresses && userAddresses.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleNewAddress}
                  className="h-8 rounded-lg border-border px-2 text-xs font-bold text-foreground hover:border-brand-300 dark:hover:border-brand-700 hover:bg-brand-50 dark:hover:bg-brand-950/40 hover:text-brand-700 dark:hover:text-brand-400"
                >
                  <Plus className="h-4 w-4" />
                  {addressMode === "select"
                    ? "Novo endereço"
                    : "Meus endereços"}
                </Button>
              )}
            </div>
          </div>

          {loadingAddresses && (
            <div className="grid gap-2">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          )}

          {!loadingAddresses &&
            addressMode === "select" &&
            userAddresses.length > 0 && (
              <div className="grid gap-2">
                {userAddresses.map((address) => {
                  const isSelected = selectedAddressId === address.id;

                  return (
                    <button
                      key={address.id}
                      type="button"
                      onClick={() => handleAddressSelect(address.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        isSelected
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                          : "border-border bg-muted hover:border-brand-300 dark:hover:border-brand-700 hover:bg-card",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-border bg-card text-transparent",
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">
                          {address.street}, {address.number}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                          {address.neighborhood} - {address.city}/
                          {address.state}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                          CEP {address.zipCode}
                          {address.complement ? ` · ${address.complement}` : ""}
                        </span>
                      </span>

                      {address.isDefault && (
                        <span className="rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-bold text-white">
                          Padrao
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

          {shouldShowNewAddress && (
            <div className="space-y-3">
              {userAddresses.length === 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Preencha os dados abaixo para entregar este pedido.
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-4">
                <Field htmlFor="zipCode" label="CEP">
                  <Input
                    id="zipCode"
                    placeholder="00000-000"
                    value={deliveryInfo.zipCode}
                    maxLength={9}
                    onChange={(e) => handleZipCode(formatCep(e.target.value))}
                    disabled={isLoadingCep}
                    className={inputClass}
                  />
                </Field>

                <Field htmlFor="state" label="Estado">
                  <Input
                    id="state"
                    placeholder="SP"
                    value={deliveryInfo.state}
                    onChange={(e) => handleInputChange("state", e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <Field htmlFor="city" label="Cidade" className="md:col-span-2">
                  <Input
                    id="city"
                    placeholder="Sao Paulo"
                    value={deliveryInfo.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <p className="text-xs font-semibold text-muted-foreground md:col-span-4">
                  {isLoadingCep
                    ? "Buscando CEP..."
                    : cepWithoutStreet
                      ? "Este CEP não traz a rua ou o bairro. Preencha esses campos abaixo."
                      : "Digite o CEP e os campos serao preenchidos."}
                </p>

                <Field
                  htmlFor="neighborhood"
                  label="Bairro"
                  className="md:col-span-2"
                >
                  <Input
                    id="neighborhood"
                    placeholder="Centro"
                    value={deliveryInfo.neighborhood}
                    onChange={(e) =>
                      handleInputChange("neighborhood", e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>

                <Field htmlFor="street" label="Rua">
                  <Input
                    id="street"
                    placeholder="Rua das Flores"
                    value={deliveryInfo.street}
                    onChange={(e) =>
                      handleInputChange("street", e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>

                <Field htmlFor="number" label="Numero">
                  <Input
                    id="number"
                    placeholder="123"
                    value={deliveryInfo.number}
                    onChange={(e) =>
                      handleInputChange("number", e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>

                <Field
                  htmlFor="complement"
                  label="Complemento"
                  optional
                  className="md:col-span-2"
                >
                  <Input
                    id="complement"
                    placeholder="Apartamento, bloco..."
                    value={deliveryInfo.complement}
                    onChange={(e) =>
                      handleInputChange("complement", e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>

                <Field
                  htmlFor="reference"
                  label="Ponto de referencia"
                  optional
                  className="md:col-span-2"
                >
                  <Input
                    id="reference"
                    placeholder="Proximo ao mercado"
                    value={deliveryInfo.reference}
                    onChange={(e) =>
                      handleInputChange("reference", e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="rounded-lg border border-border bg-muted p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">
                    Localização no mapa
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {addressCoords
                      ? "Clique no mapa para ajustar"
                      : "Preencha o CEP ou clique no mapa"}
                  </span>
                </div>
                <AddressMap
                  mapHeight={220}
                  value={addressCoords?.coords ?? null}
                  onSelect={(coords) => applyCoords(coords, "manual")}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="saveAddress"
                  checked={saveAddress}
                  onCheckedChange={(checked) =>
                    setSaveAddress(Boolean(checked))
                  }
                  className="rounded-md border-border data-[state=checked]:bg-brand-500"
                />
                <Label
                  htmlFor="saveAddress"
                  className="cursor-pointer text-xs font-semibold text-foreground"
                >
                  Salvar este endereço para pedidos futuros
                </Label>
              </div>
            </div>
          )}
        </section>
      )}

      {orderType === "pickup" && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
              <Store className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-extrabold text-foreground">
              Retirada no local
            </h2>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-brand-50 dark:bg-brand-950/40 p-3">
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-brand-900 dark:text-brand-300">
                {restaurant?.name || "Restaurante"}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-brand-700 dark:text-brand-400">
                {restaurant?.address || "Endereço disponível apos confirmação"}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                <Clock className="h-3.5 w-3.5" />
                Pronto em cerca de 20-30 min
              </p>
            </div>
          </div>
        </section>
      )}
    </form>
  );
}
