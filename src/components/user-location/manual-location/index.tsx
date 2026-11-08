import { MapPin } from "lucide-react";

import { GradientButton } from "@/components/ui/gradient-button";

import { LocationType } from "@/components/user-location";

type ApiReturn = {
  addresstype: "municipality" | "state" | "suburb";
  lat: string;
  lon: string;
}[];

export function ManualLocation({ location, setLocation }: LocationType) {
  const handleClick = async () => {
    if (!location) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${location},Brazil&format=jsonv2`,
      );

      if (!response.ok) {
        throw new Error("Erro ao pegar lng e lat do usuario");
      }

      const data: ApiReturn = await response.json();

      const findData = data.find(
        (item) =>
          item.addresstype === "municipality" ||
          item.addresstype === "state" ||
          data[0],
      );

      if (!findData) return;

      const coords = {
        lat: Number(findData.lat),
        lng: Number(findData.lon),
        city: location,
      };

      document.cookie = `userLocation=${encodeURIComponent(JSON.stringify(coords))}; path=/; max-age=86400; SameSite=Lax`;

      window.dispatchEvent(new Event("locationChanged"));
    } catch (err) {
      if (err instanceof Error) {
        console.error("erro ao fazer fetch: ", err.message);
      }
    }
    return;
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center max-w-lg mx-auto  px-2">
      <div className="relative flex-1 w-full">
        <MapPin className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 sm:h-5 sm:w-5" />
        <input
          type="text"
          value={decodeURIComponent(location)}
          placeholder="Onde você está?"
          onChange={(e) => setLocation(e.target.value)}
          className="pl-10 sm:pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl sm:rounded-2xl border-2 bg-card shadow-lg w-full outline-none"
          style={{
            borderColor: "#e5e7eb",
            backgroundImage: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.backgroundImage =
              "linear-gradient(white, white), linear-gradient(to right, var(--color-brand-500), var(--color-brand-deep))";
            e.currentTarget.style.backgroundOrigin = "border-box";
            e.currentTarget.style.backgroundClip = "padding-box, border-box";
            e.currentTarget.style.borderColor = "transparent";
          }}
          onBlur={(e) => {
            e.currentTarget.style.backgroundImage = "none";
            e.currentTarget.style.borderColor = "#e5e7eb";
          }}
        />
      </div>
      <GradientButton
        size="lg"
        onClick={() => handleClick()}
        fullWidth
        className="sm:w-auto h-12 sm:h-14 text-base sm:text-lg"
      >
        Buscar
      </GradientButton>
    </div>
  );
}
