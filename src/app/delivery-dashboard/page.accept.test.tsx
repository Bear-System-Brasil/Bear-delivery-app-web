import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Delivery } from "@/services/api";
import DeliveryDashboardPage from "./page";

// Cliente perto do entregador: sem coordenada, o aceite é barrado antes
// do request pela conferência de distância (LDMF-321).
const pending = (id: string) =>
  ({
    id,
    orderId: `order-${id}`,
    status: "PENDING",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deliveryAddress: { latitude: "-8.05389", longitude: "-34.88111" },
  }) as unknown as Delivery;

const RECIFE = { lat: -8.06, lng: -34.89 };

// Referências estáveis: identidade nova a cada render causa laço infinito.
const { driver, confirmation, position } = vi.hoisted(() => ({
  driver: { current: {} as Record<string, unknown> },
  confirmation: { shouldConfirm: true, setSkipConfirm: () => {} },
  position: { position: null, resolvePosition: vi.fn() },
}));

vi.mock("@/hooks/use-delivery-driver", () => ({
  useDeliveryDriver: () => driver.current,
}));
vi.mock("@/hooks/use-accept-confirmation", () => ({
  useAcceptConfirmation: () => confirmation,
}));
vi.mock("@/hooks/use-courier-position", () => ({
  useCourierPosition: () => position,
}));

// Card e diálogo reduzidos ao que o fluxo do aceite usa.
vi.mock("@/components/delivery-dashboard/delivery-card", () => ({
  DeliveryCard: ({
    delivery,
    onAccept,
    busy,
    acceptLocked,
  }: {
    delivery: Delivery;
    onAccept?: (id: string) => void;
    busy?: boolean;
    acceptLocked?: boolean;
  }) => (
    <button
      type="button"
      disabled={busy || acceptLocked}
      onClick={() => onAccept?.(delivery.id)}
    >
      aceitar {delivery.id}
    </button>
  ),
}));
vi.mock("@/components/delivery-dashboard/accept-confirm-dialog", () => ({
  AcceptConfirmDialog: ({
    delivery,
    onClose,
    onConfirm,
  }: {
    delivery: Delivery | null;
    onClose: () => void;
    onConfirm: (skipNext: boolean) => void;
  }) =>
    delivery ? (
      <div>
        <button type="button" onClick={() => onConfirm(false)}>
          confirmar
        </button>
        <button type="button" onClick={onClose}>
          voltar
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/delivery-dashboard/return-dialog", () => ({
  ReturnDialog: () => null,
}));
vi.mock("@/components/delivery-dashboard/location-dialog", () => ({
  LocationDialog: () => null,
}));

const acceptDelivery = vi.fn();

/** GPS que só responde quando o teste manda - como o aviso de permissão. */
function holdGps() {
  let answer: (coords: typeof RECIFE) => void = () => {};
  position.resolvePosition.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = (coords) =>
          resolve({
            ok: true,
            position: { coords, source: "gps", at: Date.now() },
          });
      }),
  );
  return (coords: typeof RECIFE) => act(async () => answer(coords));
}

beforeEach(() => {
  acceptDelivery.mockReset();
  position.resolvePosition.mockReset();
  confirmation.shouldConfirm = true;
  driver.current = {
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    inRouteDeliveries: [],
    toPickUpDeliveries: [],
    availableDeliveries: [pending("n1"), pending("n2")],
    soundEnabled: true,
    toggleSound: vi.fn(),
    acceptDelivery,
    acceptingId: null,
    advanceDelivery: vi.fn(),
    advancingId: null,
    returnDelivery: vi.fn(),
    returningId: null,
    isReturning: false,
    hasMorePages: false,
    counts: { mine: 0, inRoute: 0, toPickUp: 0, recent: 0, available: 2 },
  };
});

describe("DeliveryDashboardPage - aceite", () => {
  it("aceita com a posição que o GPS devolveu", async () => {
    const answerGps = holdGps();
    render(<DeliveryDashboardPage />);

    fireEvent.click(screen.getByText("aceitar n1"));
    fireEvent.click(screen.getByText("confirmar"));
    await answerGps(RECIFE);

    expect(acceptDelivery).toHaveBeenCalledWith(
      { id: "n1", coords: RECIFE },
      expect.anything(),
    );
  });

  // LDMF-314: o entregador desistia com o aviso de permissão aberto, e
  // quando liberava a localização a entrega era aceita mesmo assim.
  it("desistir enquanto procura a localização cancela o aceite", async () => {
    const answerGps = holdGps();
    render(<DeliveryDashboardPage />);

    fireEvent.click(screen.getByText("aceitar n1"));
    fireEvent.click(screen.getByText("confirmar"));
    fireEvent.click(screen.getByText("voltar"));
    await answerGps(RECIFE);

    expect(acceptDelivery).not.toHaveBeenCalled();
    expect(screen.getByText("aceitar n1")).toBeEnabled();
  });

  it("desistir e tentar de novo aceita só a segunda tentativa", async () => {
    const answerFirst = holdGps();
    render(<DeliveryDashboardPage />);

    fireEvent.click(screen.getByText("aceitar n1"));
    fireEvent.click(screen.getByText("confirmar"));
    fireEvent.click(screen.getByText("voltar"));

    const answerSecond = holdGps();
    fireEvent.click(screen.getByText("aceitar n1"));
    fireEvent.click(screen.getByText("confirmar"));
    await answerFirst(RECIFE);
    await answerSecond(RECIFE);

    expect(acceptDelivery).toHaveBeenCalledTimes(1);
  });

  it("com um aceite procurando a localização, os outros Aceitar travam", async () => {
    confirmation.shouldConfirm = false;
    const answerGps = holdGps();
    render(<DeliveryDashboardPage />);

    fireEvent.click(screen.getByText("aceitar n1"));
    expect(screen.getByText("aceitar n2")).toBeDisabled();

    await answerGps(RECIFE);
    expect(screen.getByText("aceitar n2")).toBeEnabled();
  });

  it("com um aceite no backend, os outros Aceitar travam", () => {
    driver.current = { ...driver.current, acceptingId: "n1" };
    render(<DeliveryDashboardPage />);

    expect(screen.getByText("aceitar n2")).toBeDisabled();
  });
});
