"use client";

import { Navigation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GradientButton } from "@/components/ui/gradient-button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type Props = {
  /**
   * Pede a localização sozinho ao montar (sem endereço salvo). Fica de
   * fora quando o botão é só uma opção na tela - abrir o popup do
   * navegador sem o cliente pedir assusta mais do que ajuda.
   */
  autoRequest?: boolean;
  variant?: "gradient" | "outline";
  className?: string;
};

export function GeolocationButton({
  autoRequest = true,
  variant = "gradient",
  className,
}: Props = {}) {
  const [isLoading, setIsLoading] = useState(false);

  // Tenta pegar localização automaticamente
  useEffect(() => {
    if (!autoRequest) return;
    const hasLocationCookie = document.cookie.includes("userLocation=");
    if (!hasLocationCookie) {
      const timer = setTimeout(() => {
        handleGetGeolocation();
      }, 1200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest]);

  const handleGetGeolocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada", {
        description: "Seu navegador não suporta localização.",
        duration: 3000,
      });
      return;
    }

    toast.info("Geolocalização", {
      description: "Obtendo sua localização...",
      duration: 3000,
    });

    setIsLoading(true);

    try {
      const position = await new Promise<{ lat: number; lng: number }>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            reject,
          );
        },
      );

      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.lat}&longitude=${position.lng}&localityLanguage=pt`,
      );

      if (!response.ok) throw new Error("Erro na API");

      const data = await response.json();

      const fullAddress = [
        data.street, // Rua
        data.streetNumber, // Número
        data.neighbourhood, // Bairro
        data.city, // Cidade
        data.principalSubdivision, // Estado
      ]
        .filter(Boolean)
        .join(", ");

      const coords = {
        lat: position.lat,
        lng: position.lng,
        city: data.city || "",
        address:
          fullAddress || data.address || `${data.city}, ${data.countryName}`,
        locality: data.locality,
        neighbourhood: data.neighbourhood,
        postcode: data.postcode,
      };

      // Salva no cookie
      document.cookie = `userLocation=${encodeURIComponent(JSON.stringify(coords))}; path=/; max-age=86400; SameSite=Lax`;

      // Dispara evento
      window.dispatchEvent(new Event("locationChanged"));

      toast.success("Localização definida!", {
        description: fullAddress || data.city,
        duration: 4000,
      });
    } catch (error) {
      console.error(error);

      let title = "Erro de localização";
      let description = "Não foi possível obter sua localização.";

      if (error instanceof GeolocationPositionError) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            title = "Permissão negada";
            description =
              "Para usar sua localização, permita o acesso no navegador.";
            break;
          case error.POSITION_UNAVAILABLE:
            description = "Não foi possível determinar sua localização.";
            break;
          case error.TIMEOUT:
            description = "A localização demorou muito para responder.";
            break;
        }
      }

      toast.error(title, { description, duration: 4000 });
    } finally {
      setIsLoading(false);
    }
  };

  const label = isLoading
    ? "Obtendo localização..."
    : "Usar minha localização";

  if (variant === "outline") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={handleGetGeolocation}
        disabled={isLoading}
        className={cn("w-full", className)}
      >
        <Navigation className="mr-2 h-4 w-4" />
        {label}
      </Button>
    );
  }

  return (
    <GradientButton
      size="lg"
      onClick={handleGetGeolocation}
      disabled={isLoading}
      fullWidth
      className={cn("sm:w-auto h-12 sm:h-14 text-base sm:text-lg", className)}
    >
      {label}
    </GradientButton>
  );
}
