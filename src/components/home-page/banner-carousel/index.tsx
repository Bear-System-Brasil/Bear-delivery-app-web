"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
const AUTOPLAY_INTERVAL = 4500;
type Banner = {
  id: number;
  variant: "promo" | "image";
  title: string;
  subtitle?: string;
  badge?: string;
  buttonLabel?: string;
  image?: string;
  hideOverlay?: boolean;
};
const banners: Banner[] = [
  {
    id: 1,
    variant: "image",
    title: "Inauguração Bear",
    image: "/banners/bear-inauguracao.jpg",
    badge: "INAUGURAÇÃO",
    hideOverlay: true,
  },
];
export function BannerCarousel() {
  const [api, setApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const updateCurrentSlide = useCallback((carouselApi: CarouselApi) => {
    if (!carouselApi) return;
    setCurrentSlide(carouselApi.selectedScrollSnap());
  }, []);
  useEffect(() => {
    if (!api) return;
    updateCurrentSlide(api);
    api.on("select", updateCurrentSlide);
    api.on("reInit", updateCurrentSlide);
    return () => {
      api.off("select", updateCurrentSlide);
      api.off("reInit", updateCurrentSlide);
    };
  }, [api, updateCurrentSlide]);
  useEffect(() => {
    if (!api) return;
    const autoplay = window.setTimeout(() => {
      api.scrollNext();
    }, AUTOPLAY_INTERVAL);
    return () => window.clearTimeout(autoplay);
  }, [api, currentSlide]);
  return (
    <section className="px-3 sm:px-4 mt-1 sm:mt-2 mb-2 sm:mb-3">
      <div className="max-w-7xl mx-auto">
        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            loop: true,
          }}
        >
          <CarouselContent>
            {banners.map((banner) => (
              <CarouselItem key={banner.id}>
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl shadow-md">
                  {banner.variant === "promo" ? (
                    <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#FFC61A] via-[#FF8A00] to-[#FF4D00] sm:h-52 md:h-60">
                      <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10 sm:-right-8 sm:-top-20 sm:h-64 sm:w-64" />
                      <div className="absolute -bottom-24 right-12 h-44 w-44 rounded-full bg-white/10 sm:right-24 sm:h-52 sm:w-52" />
                      <div className="relative z-10 flex h-full flex-col justify-center px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 md:px-8">
                        <div className="max-w-[32rem]">
                          <span className="mb-2 inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white sm:px-3 sm:text-[11px]">
                            {banner.badge}
                          </span>
                          <h2 className="text-xl font-extrabold leading-tight text-white sm:text-2xl md:text-3xl">
                            {banner.title}
                          </h2>
                          <p className="mt-1 max-w-[18rem] text-xs font-medium text-white/90 sm:max-w-none sm:text-sm">
                            {banner.subtitle}
                          </p>
                        </div>
                        <button className="mt-3 h-9 w-fit rounded-lg bg-white px-5 text-xs font-extrabold text-[#FF6A00] transition-colors hover:bg-orange-50 sm:mt-0 sm:h-10 sm:flex-shrink-0 sm:px-6 sm:text-sm">
                          {banner.buttonLabel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-40 sm:h-52 md:h-60">
                      {banner.image && (
                        <Image
                          src={banner.image}
                          alt={banner.title}
                          fill
                          priority={banner.id === 1}
                          className="object-cover object-center"
                        />
                      )}
                      {!banner.hideOverlay && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                          <div className="absolute inset-0 flex flex-col justify-center px-4 sm:px-5 md:px-8">
                            <span className="mb-1.5 w-fit rounded-full bg-[#FF7A00] px-2.5 py-0.5 text-[10px] font-semibold text-white sm:px-3 sm:py-1 sm:text-[11px]">
                              {banner.badge}
                            </span>
                            <h2 className="mb-0.5 text-xl font-bold text-white sm:mb-1 sm:text-2xl md:text-3xl">
                              {banner.title}
                            </h2>
                            <p className="mb-3 text-xs text-white/90 sm:mb-4 sm:text-sm">
                              {banner.subtitle}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 sm:bottom-3">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`Ir para o banner ${index + 1}`}
                aria-current={currentSlide === index}
                onClick={() => api?.scrollTo(index)}
                className={`h-1.5 rounded-full bg-white transition-all ${
                  currentSlide === index ? "w-4 opacity-100" : "w-1.5 opacity-60"
                }`}
              />
            ))}
          </div>
        </Carousel>
      </div>
    </section>
  );
}