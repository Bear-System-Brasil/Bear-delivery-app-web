import { useEffect, useState } from "react";
import { GeolocationButton } from "./geolocation-button";
import { ManualLocation } from "./manual-location";

export type LocationType = {
  location: string;
  setLocation: (loc: string) => void;
};

export function UserLocation() {
  const [location, setLocation] = useState<string>("");

  useEffect(() => {
    const findLocation = document.cookie
      .split("; ")
      .find((row) => row.startsWith("userLocation="));

    const foundLocation = findLocation ? findLocation.split("=")[1] : "";

    if (foundLocation) {
      try {
        const decodedLocation = decodeURIComponent(foundLocation);
        const parsedLocation = JSON.parse(decodedLocation);

        if (
          typeof parsedLocation === "object" &&
          parsedLocation !== null &&
          "lat" in parsedLocation &&
          "lng" in parsedLocation &&
          "city" in parsedLocation
        ) {
          setLocation(`${parsedLocation.city}`);
        } else {
          setLocation(decodedLocation);
        }
      } catch {
        setLocation(foundLocation);
      }
    }
  }, []);

  return (
    <div>
      <ManualLocation location={location} setLocation={setLocation} />
      <GeolocationButton />
    </div>
  );
}
