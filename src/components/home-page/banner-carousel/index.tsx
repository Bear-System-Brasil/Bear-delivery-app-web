"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

const AUTOPLAY_INTERVAL = 3500;

const banners = [
  {
    id: 1,
    variant: "promo",
    title: "Frete grátis hoje",
    subtitle: "Em pedidos acima de R$ 30 — entrega em até 35 min",
    badge: "50% OFF NA 1ª COMPRA",
    buttonLabel: "Pedir agora",
  },
  {
    id: 2,
    variant: "image",
    image: "https://images.unsplash.com/photo-1762424361024-66dc512c3872",
    title: "Frete Grátis",
    subtitle: "Pedidos acima de R$ 30",
    badge: "50% OFF",
  },
  {
    id: 3,
    variant: "image",
    image: "https://images.unsplash.com/photo-1762417420647-45a4401b38f0",
    title: "Ofertas Especiais",
    subtitle: "Todos os dias da semana",
    badge: "NOVO",
  },
  {
    id: 4,
    variant: "image",
    image: "https://images.unsplash.com/photo-1629123796793-5964e9b88646",
    title: "Desconto Progressivo",
    subtitle: "Quanto mais pede, mais economiza",
    badge: "30% OFF",
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

    return () => {
      window.clearTimeout(autoplay);
    };
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
                    <div className="relative h-40 overflow-hidden bg-gradient-to-r from-brand-500 via-brand-400 to-brand-300 sm:h-52 md:h-60">
                      <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full bg-card/10 sm:-right-8 sm:-top-20 sm:h-64 sm:w-64 md:h-72 md:w-72" />
                      <div className="absolute -bottom-24 right-12 h-44 w-44 rounded-full bg-card/10 sm:right-24 sm:h-52 sm:w-52 md:right-32 md:h-60 md:w-60" />

                      <div className="relative z-10 flex h-full flex-col justify-center px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 md:px-8">
                        <div className="max-w-[32rem]">
                          <span className="mb-2 inline-block rounded-full bg-card/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white sm:px-3 sm:text-[11px]">
                            {banner.badge}
                          </span>

                          <h2 className="text-xl font-extrabold leading-tight text-white sm:text-2xl md:text-3xl">
                            {banner.title}
                          </h2>

                          <p className="mt-1 max-w-[18rem] text-xs font-medium text-white/90 sm:max-w-none sm:text-sm">
                            {banner.subtitle}
                          </p>
                        </div>

                        <button className="mt-3 h-9 w-fit rounded-lg bg-card px-5 text-xs font-extrabold text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40 sm:mt-0 sm:h-10 sm:flex-shrink-0 sm:px-6 sm:text-sm">
                          {banner.buttonLabel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-40 sm:h-52 md:h-60">
                      <Image
                        src={banner.image || "/placeholder.svg"}
                        alt={banner.title}
                        fill
                        priority={banner.id === 2}
                        className="object-cover"
                      />

                      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />

                      <div className="absolute inset-0 flex flex-col justify-center px-4 sm:px-5 md:px-8">
                        <span className="mb-1.5 sm:mb-2 w-fit rounded-full bg-brand-500 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-semibold text-white">
                          {banner.badge}
                        </span>

                        <h2 className="mb-0.5 sm:mb-1 text-xl font-bold text-white sm:text-2xl md:text-3xl">
                          {banner.title}
                        </h2>

                        <p className="mb-3 text-xs text-white/90 sm:mb-4 sm:text-sm">
                          {banner.subtitle}
                        </p>

                        <button className="w-fit rounded-full bg-card px-4 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40 sm:px-5 sm:py-2 sm:text-sm">
                          Pedir Agora
                        </button>
                      </div>
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
                className={`h-1.5 rounded-full bg-card transition-all ${
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
