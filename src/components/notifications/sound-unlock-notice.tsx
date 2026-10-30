"use client";

import { soundManager } from "@/lib/sound";
import { VolumeX } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => soundManager.subscribe(cb);

/**
 * Aviso de som bloqueado (LDMF-458). O Chrome só libera áudio depois de um
 * toque na página: o tablet da cozinha que recarregou e ninguém tocou ficava
 * mudo sem avisar, e o pedido chegava em silêncio. O aviso some no primeiro
 * toque (em qualquer lugar da página, não só nele) ou se o som for desligado.
 */
export function SoundUnlockNotice() {
  const blocked = useSyncExternalStore(
    subscribe,
    () => soundManager.isAudioBlocked(),
    () => false,
  );
  const muted = useSyncExternalStore(
    subscribe,
    () => soundManager.isMuted(),
    () => true,
  );

  useEffect(() => {
    soundManager.installUnlockHandlers();
    soundManager.watchAudioState();
  }, []);

  if (!blocked || muted) return null;

  return (
    <button
      type="button"
      onClick={() => soundManager.unlock()}
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-brand-600 md:bottom-6 print:hidden"
    >
      <VolumeX className="h-4 w-4 shrink-0" />
      Toque para ativar o som dos pedidos
    </button>
  );
}
