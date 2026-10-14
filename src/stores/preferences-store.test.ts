import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "./preferences-store";

const initialState = usePreferencesStore.getState();

describe("usePreferencesStore", () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferencesStore.setState(initialState, true);
  });

  it("começa com os valores default documentados", () => {
    const state = usePreferencesStore.getState();
    expect(state.theme).toBe("system");
    expect(state.language).toBe("pt-BR");
    expect(state.currency).toBe("BRL");
    expect(state.kitchenSoundEnabled).toBe(true);
    expect(state.showOnboarding).toBe(true);
    expect(state.notifications).toEqual({
      push: true,
      email: true,
      sms: false,
      orderUpdates: true,
      promotions: true,
    });
  });

  it("setTheme troca só o theme", () => {
    act(() => usePreferencesStore.getState().setTheme("dark"));
    expect(usePreferencesStore.getState().theme).toBe("dark");
  });

  it("setLanguage troca só a language", () => {
    act(() => usePreferencesStore.getState().setLanguage("en-US"));
    expect(usePreferencesStore.getState().language).toBe("en-US");
  });

  it("updateNotifications faz merge parcial sem apagar as demais chaves", () => {
    act(() => usePreferencesStore.getState().updateNotifications({ sms: true }));

    const { notifications } = usePreferencesStore.getState();
    expect(notifications.sms).toBe(true);
    expect(notifications.push).toBe(true);
    expect(notifications.email).toBe(true);
  });

  it("setDefaultAddress define o endereço padrão", () => {
    act(() => usePreferencesStore.getState().setDefaultAddress("addr-1"));
    expect(usePreferencesStore.getState().defaultAddress).toBe("addr-1");
  });

  it("setCompactMode alterna o modo compacto", () => {
    act(() => usePreferencesStore.getState().setCompactMode(true));
    expect(usePreferencesStore.getState().compactMode).toBe(true);
  });

  it("setKitchenSound liga/desliga o som da cozinha", () => {
    act(() => usePreferencesStore.getState().setKitchenSound(false));
    expect(usePreferencesStore.getState().kitchenSoundEnabled).toBe(false);
    act(() => usePreferencesStore.getState().setKitchenSound(true));
    expect(usePreferencesStore.getState().kitchenSoundEnabled).toBe(true);
  });

  it("dismissOnboarding só desativa showOnboarding, é irreversível pela própria action", () => {
    act(() => usePreferencesStore.getState().dismissOnboarding());
    expect(usePreferencesStore.getState().showOnboarding).toBe(false);
  });

  it("setLastViewedRestaurant grava o último restaurante visitado", () => {
    act(() => usePreferencesStore.getState().setLastViewedRestaurant("r-99"));
    expect(usePreferencesStore.getState().lastViewedRestaurant).toBe("r-99");
  });

  it("resetPreferences volta tudo para o default, mesmo após várias alterações", () => {
    act(() => {
      usePreferencesStore.getState().setTheme("dark");
      usePreferencesStore.getState().setLanguage("en-US");
      usePreferencesStore.getState().setKitchenSound(false);
      usePreferencesStore.getState().dismissOnboarding();
      usePreferencesStore.getState().resetPreferences();
    });

    const state = usePreferencesStore.getState();
    expect(state.theme).toBe("system");
    expect(state.language).toBe("pt-BR");
    expect(state.kitchenSoundEnabled).toBe(true);
    expect(state.showOnboarding).toBe(true);
  });
});
