"use client";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/auth-provider";
import { useAuthStore, useCartStore } from "@/stores";
import { getWorkspaceLinks } from "@/constants/workspace-links";
import {
  OPEN_LOCATION_SHEET_EVENT,
  type OpenLocationSheetMode,
} from "@/lib/location-sheet";
import { getProfileRoute, isCompanyStaffRole } from "@/utils/role-helpers";
import clsx from "clsx";
import {
  ChevronDown,
  FileText,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Package,
  PencilLine,
  Search,
  ShoppingCart,
  Store,
  User,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DeliveryAddressForm,
  type SavedDeliveryLocation,
} from "./delivery-address-form";
import { ThemeToggle } from "../ui/theme-toggle";
import Link from "next/link";
import { BearDeliveryLogo } from "../ui/bear-delivery-logo";
import Image from "next/image";

const DEFAULT_LOCATION_LABEL = "Escolha seu endereço";

function formatLocationLabel(l: {
  address?: string;
  locality?: string;
  city?: string;
  label?: string;
}) {
  const place = l.address || l.locality || l.city;
  if (!place) return "";
  return l.label ? `${l.label} · ${place}` : place;
}

// --- PROPS CONFIGURÁVEIS ---
interface MainHeaderProps {
  // dados
  cartItems?: number;
  onCartClick?: () => void;

  // switches principais - tudo desligável
  showLogo?: boolean;
  showLocation?: boolean;
  showSearch?: boolean;
  showCart?: boolean;
  showOrders?: boolean;
  showNotifications?: boolean;
  showMenu?: boolean; // menu hamburguer / Entrar
  showStoreCta?: boolean; // "Tem um restaurante?"
  showThemeToggle?: boolean; // só aparece dentro do Sheet, mas pode ativar/desativar

  /** @deprecated use os switches individuais showCart, showOrders, showNotifications, showMenu */
  showNav?: boolean;

  // variantes da logo
  logoIconOnlyBelow?: "sm" | "lg";
  logoSmall?: boolean;
  logoHref?: string;

  // estilo do container
  fixed?: boolean;
  /**
   * Posicao do container, quando `fixed` (flutuante no topo) nao serve.
   *
   * "static" existe para a area de entregas: as telas de la tem cabecalho
   * proprio `sticky top-0` com as acoes da tela, e um cabecalho de app
   * flutuante ou sticky o cobriria no scroll. Estatico, os dois convivem sem
   * um esconder o outro.
   *
   * Quando ausente, `fixed` continua decidindo - nenhuma chamada existente
   * muda de comportamento.
   */
  position?: "fixed" | "sticky" | "static";
  className?: string;
}

const POSITION_CLASS = {
  fixed: "fixed top-1 left-1 right-1 z-50",
  sticky: "sticky top-0 z-50",
  static: "relative z-50",
} as const;

export function MainHeader({
  cartItems,
  onCartClick,
  showLogo = true,
  showLocation = true,
  showSearch = true,
  showCart,
  showOrders,
  showNotifications,
  showMenu,
  showStoreCta,
  showThemeToggle = true,
  showNav = true,
  logoIconOnlyBelow = "lg",
  logoSmall = false,
  logoHref = "/",
  fixed = true,
  position,
  className,
}: MainHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { showAuthModal, logout } = useAuth();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeTotalItems = useCartStore((s) =>
    s.items.reduce((total, item) => total + item.quantity, 0),
  );
  const resolvedCartItems =
    cartItems !== undefined ? cartItems : storeTotalItems;
  const resolvedShowCart = showCart ?? showNav;
  const resolvedShowOrders = showOrders ?? showNav;
  const resolvedShowNotifications = showNotifications ?? showNav;
  const resolvedShowMenu = showMenu ?? showNav;
  const resolvedShowStoreCta = showStoreCta ?? showNav;
  // Todas as áreas da role, e não uma só: quem administra o restaurante
  // enxerga Gestão, Cozinha, Pedidos, Entregas e Financeiro. Aqui cabe a
  // lista inteira - é um menu vertical, ao contrário da barra inferior.
  const workspaceLinks = getWorkspaceLinks(user?.role);
  const isStaffAccount = isAuthenticated && isCompanyStaffRole(user?.role);

  const [isMounted, setIsMounted] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LOCATION_LABEL);
  const [locationOpen, setLocationOpen] = useState(false);
  const [isChangingLocation, setIsChangingLocation] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    const handleOpenLocation = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: OpenLocationSheetMode }>)
        .detail?.mode;
      setLocationError("");
      setIsChangingLocation(mode !== "card");
      setLocationOpen(true);
    };
    window.addEventListener(OPEN_LOCATION_SHEET_EVENT, handleOpenLocation);
    return () =>
      window.removeEventListener(OPEN_LOCATION_SHEET_EVENT, handleOpenLocation);
  }, []);

  useEffect(() => {
    if (searchOpen) mobileSearchInputRef.current?.focus();
  }, [searchOpen]);

  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (!q) {
      router.push("/");
      return;
    }
    router.push(`/?search=${encodeURIComponent(q)}`);
    setSearchOpen(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (pathname === "/") {
      if (!value.trim()) router.replace("/", { scroll: false });
      else
        router.replace(`/?search=${encodeURIComponent(value)}`, {
          scroll: false,
        });
    }
  };

  const saveLocation = (
    location: Omit<SavedDeliveryLocation, "label"> &
      Partial<Pick<SavedDeliveryLocation, "label">>,
  ) => {
    document.cookie = `userLocation=${encodeURIComponent(JSON.stringify(location))}; path=/; max-age=86400; SameSite=Lax`;
    setLocationLabel(formatLocationLabel(location) || DEFAULT_LOCATION_LABEL);
    setLocationOpen(false);
    setIsChangingLocation(false);
    setLocationError("");
    window.dispatchEvent(new Event("locationChanged"));
  };

  const handleCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationError("Seu navegador não permite localização automática.");
      return;
    }
    setLocationLoading(true);
    setLocationError("");
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: false,
          timeout: 10000,
        }),
      );
      const { latitude, longitude } = pos.coords;
      const r = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`,
      );
      if (!r.ok) throw new Error();
      const data = await r.json();
      const city = data.city || data.locality || "Minha localização";
      const address = [
        data.street,
        data.streetNumber,
        data.neighbourhood,
        city,
        data.principalSubdivision,
      ]
        .filter(Boolean)
        .join(", ");
      saveLocation({
        lat: latitude,
        lng: longitude,
        city,
        address: address || city,
      });
    } catch {
      setLocationError("Não foi possível encontrar sua localização.");
    } finally {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    const sync = () => {
      const c = document.cookie
        .split("; ")
        .find((row) => row.startsWith("userLocation="));
      if (!c) {
        setLocationLabel(DEFAULT_LOCATION_LABEL);
        return;
      }
      try {
        setLocationLabel(
          formatLocationLabel(
            JSON.parse(decodeURIComponent(c.split("=").slice(1).join("="))) ??
              {},
          ) || DEFAULT_LOCATION_LABEL,
        );
      } catch {
        setLocationLabel(DEFAULT_LOCATION_LABEL);
      }
    };
    sync();
    window.addEventListener("locationChanged", sync);
    return () => window.removeEventListener("locationChanged", sync);
  }, []);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) setHasHydrated(true);
    const unsub = useAuthStore.persist.onFinishHydration(() =>
      setHasHydrated(true),
    );
    return () => unsub();
  }, []);

  const canShowAuthUI = isMounted && hasHydrated;
  const hasSavedLocation = locationLabel !== DEFAULT_LOCATION_LABEL;

  return (
    <header
      className={clsx(
        POSITION_CLASS[position ?? (fixed ? "fixed" : "sticky")],
        "bg-background/80 backdrop-blur-md border border-brand-100/50 dark:border-brand-900/50",
        "rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden",
        className,
      )}
    >
      <div className="px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* ESQUERDA */}
          <div
            className={clsx(
              "flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2",
              searchOpen && "max-sm:hidden",
            )}
          >
            {showLogo && (
              <Link
                href={logoHref}
                className="shrink-0"
                aria-label="Bear Delivery - início"
              >
                <BearDeliveryLogo
                  small={logoSmall}
                  iconOnlyBelow={logoIconOnlyBelow}
                />
              </Link>
            )}

            {showLocation && (
              <Sheet
                open={locationOpen}
                onOpenChange={(o) => {
                  setLocationOpen(o);
                  if (!o) {
                    setLocationError("");
                    setIsChangingLocation(false);
                  }
                }}
              >
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="flex max-w-[150px] sm:max-w-[220px] lg:max-w-[300px] items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-muted/80"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 fill-brand-500 text-brand-500" />
                    <span className="truncate">{locationLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-card px-4 pb-8 pt-4 sm:px-6"
                >
                  <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
                  {isChangingLocation ? (
                    <DeliveryAddressForm onSave={saveLocation} />
                  ) : (
                    <div className="mx-auto w-full max-w-xl space-y-4">
                      <SheetTitle className="text-lg font-bold">
                        Endereço de entrega
                      </SheetTitle>
                      <div className="rounded-2xl border bg-brand-50/60 dark:bg-brand-950/30 p-4">
                        <div className="flex gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-brand-500 shadow-sm">
                            <MapPin className="h-5 w-5 fill-brand-500" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                              Entregando em
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {hasSavedLocation
                                ? locationLabel
                                : "Nenhum endereço selecionado"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setIsChangingLocation(true)}
                            className="h-11 rounded-xl"
                          >
                            <PencilLine className="mr-2 h-4 w-4" />
                            Trocar
                          </Button>
                          <Button
                            variant="outline"
                            disabled={locationLoading}
                            onClick={handleCurrentLocation}
                            className="h-11 rounded-xl"
                          >
                            <Navigation className="mr-2 h-4 w-4" />
                            Usar atual
                          </Button>
                        </div>
                        {locationError && (
                          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                            {locationError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            )}
          </div>

          {/* DIREITA */}
          <div
            className={clsx(
              "flex items-center gap-1.5 sm:gap-2",
              searchOpen ? "max-sm:min-w-0 max-sm:flex-1" : "shrink-0",
            )}
          >
            {/* ===== BUSCA ===== */}
            {showSearch && (
              <>
                {/* Mobile */}
                <div className="sm:hidden">
                  {!searchOpen ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-xl border-0 bg-muted/50"
                      onClick={() => setSearchOpen(true)}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSearchSubmit();
                      }}
                      className="relative flex min-w-0 flex-1 items-center"
                    >
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={mobileSearchInputRef}
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onBlur={() => {
                          if (!searchQuery.trim()) setSearchOpen(false);
                        }}
                        className="h-9 w-full rounded-xl border-0 bg-muted/50 pl-9 pr-3 text-sm focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)]"
                      />
                    </form>
                  )}
                </div>

                {/* Desktop - CORRIGIDO */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSearchSubmit();
                  }}
                  className="relative hidden items-center sm:flex"
                >
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="h-10 w-36 rounded-xl border-0 bg-muted/50 pl-9 pr-8 text-sm focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)] md:w-56"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </form>
              </>
            )}
            {resolvedShowCart && !isStaffAccount && (
              <Button
                variant="outline"
                size="icon"
                className="relative hidden h-9 w-9 rounded-xl border-0 bg-muted/50 md:flex md:h-10 md:w-10"
                onClick={() =>
                  onCartClick ? onCartClick() : router.push("/cart")
                }
              >
                <ShoppingCart className="h-4 w-4" />
                {isMounted && resolvedCartItems > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                    {resolvedCartItems}
                  </span>
                )}
              </Button>
            )}

            {resolvedShowOrders &&
              canShowAuthUI &&
              isAuthenticated &&
              user?.role === "client" && (
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden h-9 w-9 rounded-xl border-0 bg-muted/50 md:flex md:h-10 md:w-10"
                  onClick={() => router.push("/orders")}
                >
                  <Package className="h-4 w-4" />
                </Button>
              )}

            {resolvedShowNotifications &&
              canShowAuthUI &&
              isAuthenticated && (
                <div className={clsx(searchOpen && "max-sm:hidden")}>
                  <NotificationBell
                    audience={user?.role === "client" ? "customer" : "management"}
                  />
                </div>
              )}

            {resolvedShowMenu && canShowAuthUI && (
              <div className={clsx(searchOpen && "max-sm:hidden")}>
                {isAuthenticated ? (
                  <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl border-0 bg-muted/50"
                      >
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="right"
                      className="w-[300px] sm:w-[400px]"
                    >
                      <SheetTitle className="sr-only">Menu</SheetTitle>
                      <div className="mb-6 flex items-center justify-between pr-8">
                        <Link
                          href={logoHref}
                          onClick={() => setMobileMenuOpen(false)}
                          className="shrink-0"
                        >
                          <BearDeliveryLogo />
                        </Link>
                        {showThemeToggle && <ThemeToggle />}
                      </div>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full justify-start rounded-xl"
                          onClick={() => {
                            router.push(getProfileRoute(user?.role));
                            setMobileMenuOpen(false);
                          }}
                        >
                          {user?.photoUrl ? (
                            <Image
                              src={user.photoUrl}
                              alt=""
                              width={20}
                              height={20}
                              className="h-5 w-5 rounded-full mr-2"
                            />
                          ) : (
                            <User className="h-4 w-4 mr-2" />
                          )}
                          Perfil
                        </Button>
                        {resolvedShowCart && !isStaffAccount && (
                          <Button
                            variant="outline"
                            className="w-full justify-start rounded-xl"
                            onClick={() => {
                              if (onCartClick) onCartClick();
                              else router.push("/cart");
                              setMobileMenuOpen(false);
                            }}
                          >
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Carrinho{" "}
                            {resolvedCartItems > 0 && (
                              <span className="ml-auto bg-brand-500 text-white text-xs px-2 py-1 rounded-full">
                                {resolvedCartItems}
                              </span>
                            )}
                          </Button>
                        )}
                        {resolvedShowOrders && user?.role === "client" && (
                          <Button
                            variant="outline"
                            className="w-full justify-start rounded-xl"
                            onClick={() => {
                              router.push("/orders");
                              setMobileMenuOpen(false);
                            }}
                          >
                            <Package className="h-4 w-4 mr-2" />
                            Meus Pedidos
                          </Button>
                        )}
                        {resolvedShowStoreCta && user?.role === "client" && (
                          <Button
                            variant="outline"
                            className="w-full justify-start rounded-xl"
                            onClick={() => {
                              // Logado: direto pro formulário, que cadastra
                              // o restaurante na própria conta (LDMF-295).
                              router.push("/restaurant-register");
                              setMobileMenuOpen(false);
                            }}
                          >
                            <Store className="h-4 w-4 mr-2" />
                            Cadastrar meu restaurante
                          </Button>
                        )}
                        {workspaceLinks.map((area) => (
                          <Button
                            key={area.href}
                            variant="outline"
                            className="w-full justify-start rounded-xl"
                            onClick={() => {
                              router.push(area.href);
                              setMobileMenuOpen(false);
                            }}
                          >
                            <area.icon className="h-4 w-4 mr-2" />
                            {area.label}
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          className="w-full justify-start rounded-xl"
                          onClick={() => {
                            router.push("/legal");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Termos e privacidade
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            logout();
                            router.push("/");
                            setMobileMenuOpen(false);
                          }}
                          className="flex h-[38px] w-full items-center gap-[11px] rounded-[14px] bg-brand-500 px-3 text-[13px] font-semibold text-white shadow-[0_6px_14px_var(--tw-shadow-color)] shadow-brand-500/35 transition-colors hover:bg-brand-400 cursor-pointer"
                        >
                          <LogOut className="h-4 w-4 shrink-0" />
                          <span className="truncate">Sair da conta</span>
                        </button>
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <div className="flex items-center gap-2">
                    {resolvedShowStoreCta && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden sm:inline-flex rounded-xl text-xs text-muted-foreground"
                        onClick={() => router.push("/restaurant-landing-page")}
                      >
                        <Store className="mr-1.5 h-3.5 w-3.5" />
                        Tem um restaurante?
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium"
                      onClick={() => showAuthModal("login")}
                    >
                      Entrar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
