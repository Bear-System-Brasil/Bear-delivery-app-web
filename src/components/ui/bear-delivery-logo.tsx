"use client";
/**
 * Identidade visual Bear Delivery - Mascote real
 * Arquivo: /public/brand/bear_delivery_icon.png (PNG transparente 512x512)
 */
import Image from "next/image";
const ICON_BG = "bg-gradient-to-br from-[#FFC61A] via-[#FF8A00] to-[#FF4D00]";
export function BearMascot({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <Image
      src="/brand/bear_delivery_icon.png"
      alt="Bear Delivery"
      width={512}
      height={512}
      className={`${className} object-contain`}
      priority
    />
  );
}
// Classes estáticas pro Tailwind enxergar
const HIDE_WORDMARK_BELOW = {
  sm: "max-sm:hidden",
  lg: "max-lg:hidden",
} as const;
/** Logo horizontal: header, sidebar, footer. */
export function BearDeliveryLogo({
  small = false,
  iconOnlyBelow,
  dark = false,
  className = "",
}: {
  small?: boolean;
  iconOnlyBelow?: keyof typeof HIDE_WORDMARK_BELOW;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center ${small ? "gap-1.5" : "gap-2.5"} ${className}`}
    >
      <div
        className={`${
          small ? "h-7 w-7 rounded-[12px]" : "h-10 w-10 rounded-[14px]"
        } ${
          iconOnlyBelow ? "max-sm:h-9 max-sm:w-9 max-sm:rounded-[13px]" : ""
        } ${ICON_BG} flex shrink-0 items-center justify-center shadow-[0_1px_10px_var(--tw-shadow-color)] shadow-brand-900/20 overflow-hidden`}
      >
        <BearMascot
          className={`${small ? "h-[20px] w-[20px]" : "h-[28px] w-[28px]"} ${
            iconOnlyBelow ? "max-sm:h-[24px] max-sm:w-[24px]" : ""
          }`}
        />
      </div>
      <div
        className={`leading-none tracking-tight ${
          iconOnlyBelow ? HIDE_WORDMARK_BELOW[iconOnlyBelow] : ""
        } ${dark ? "text-white" : "text-foreground"}`}
      >
        <span className={`font-black ${small ? "text-[13px]" : "text-[17px]"}`}>
          BEAR
        </span>
        <span
          className={`ml-[3px] font-light ${
            small
              ? "text-[11px] tracking-[0.12em]"
              : "text-[14px] tracking-[0.14em]"
          }`}
        >
          DELIVERY
        </span>
      </div>
    </div>
  );
}
/** Logo empilhado grande: hero, splash, login */
export function BearDeliveryLogoStacked({
  dark = false,
  className = "",
}: {
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div
        className={`h-[72px] w-[72px] rounded-[22px] ${ICON_BG} flex items-center justify-center shadow-[0_8px_24px_var(--tw-shadow-color)] shadow-brand-900/25 overflow-hidden`}
      >
        <BearMascot className="h-[52px] w-[52px]" />
      </div>
      <div
        className={`flex flex-col items-center leading-[0.88] ${dark ? "text-white" : "text-foreground"}`}
      >
        <span className="text-[34px] font-black tracking-[-0.04em]">BEAR</span>
        <span className="mt-1 text-[13px] font-light tracking-[0.28em] opacity-70">
          -DELIVERY-
        </span>
      </div>
    </div>
  );
}