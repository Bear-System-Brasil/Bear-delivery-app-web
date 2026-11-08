"use client";

import { OrderInfo, OrderStatus } from "@/hooks";
import { useEffect, useRef, useState } from "react";
import { DeliveringMap } from "./steps-components/delivering";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { Check } from "lucide-react";
import { ORDER_STEPS, getOrderStep } from "@/lib/order-status";
import { Socket, io } from "socket.io-client";

const DELIVERY_TRACKING_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/delivery-tracking`
  : "";
const DEBUG_DELIVERY_TRACKING =
  process.env.NEXT_PUBLIC_DELIVERY_TRACKING_DEBUG === "true";

type Props = {
  data: {
    order: OrderInfo | null;
    isRefreshing: boolean;
    getStatusMessage: (status: OrderStatus) => string;
  };
};

export function OrderStatusTracker({ data }: Props) {
  const [coordinates, setCoordinates] = useState({ lat: 0, lng: 0 });
  const socketRef = useRef<Socket | null>(null);

  const order = data.order;
  const deliveryId = order?.delivery?.id;
  const isTrackable = order?.status === "delivering";

  useEffect(() => {
    if (!deliveryId || !isTrackable || !DELIVERY_TRACKING_URL) {
      return;
    }

    let socket: Socket | null = null;
    let cancelled = false;

    fetch("/api/auth/socket-token")
      .then((res) => res.json())
      .then(({ token }: { token: string | null }) => {
        if (cancelled || !token) return;

        socket = io(DELIVERY_TRACKING_URL, { auth: { token } });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket!.emit("joinDelivery", { deliveryId });
        });

        socket.on("connect_error", (err) => {
          if (DEBUG_DELIVERY_TRACKING) {
            console.log("Erro socket:", err);
          }
        });

        socket.on("trackingStarted", () => {
          if (DEBUG_DELIVERY_TRACKING) {
            console.log("Tracking iniciado");
          }
        });

        socket.on(
          "locationUpdate",
          ({ lat, lng }: { lat: number; lng: number }) => {
            setCoordinates({ lat, lng });
          },
        );

        socket.on("trackingFinished", () => {
          if (DEBUG_DELIVERY_TRACKING) {
            console.log("Entrega finalizada");
          }
          socket!.disconnect();
        });
      });

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [deliveryId, isTrackable]);

  if (!order) return null;

  const step = getOrderStep({
    status: order.rawStatus,
    delivery: order.delivery,
  });

  const showLiveMap = order.status === "delivering" && Boolean(order.delivery);

  return (
    <div>
      <Stepper
        value={step + 1}
        indicators={{
          completed: <Check className="size-3" />,
          active: <Check className="size-3" />,
        }}
      >
        <StepperNav>
          {ORDER_STEPS.map((label, index) => (
            <StepperItem
              key={label}
              step={index + 1}
              className="relative flex-1 flex-col items-center"
            >
              {index < ORDER_STEPS.length - 1 && (
                <StepperSeparator className="absolute left-1/2 top-2.5 z-0 m-0 h-px w-full bg-muted data-[state=completed]:bg-success" />
              )}

              <StepperTrigger className="flex flex-col items-center gap-2">
                <StepperIndicator className="relative z-10 size-5 border-2 border-border bg-card text-transparent data-[state=active]:border-success data-[state=active]:bg-success data-[state=active]:text-white data-[state=active]:ring-4 data-[state=active]:ring-success/10 data-[state=completed]:border-success data-[state=completed]:bg-success data-[state=completed]:text-white" />

                <StepperTitle className="whitespace-nowrap text-[9px] font-semibold text-muted-foreground data-[state=active]:text-foreground data-[state=completed]:text-foreground sm:text-[10px]">
                  {label}
                </StepperTitle>
              </StepperTrigger>
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>

      <div className="mt-4 rounded-[10px] bg-brand-50 dark:bg-brand-950/40 px-[13px] py-[11px]">
        <p className="text-[12.5px] font-bold text-amber-700 dark:text-amber-400">
          {data.getStatusMessage(order.status)}
        </p>

        {order.status !== "delivered" && (
          <p className="mt-[5px] flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-700 dark:text-amber-400">
            <span aria-hidden>⏱</span>
            Tempo estimado: {order.estimatedTime}
          </p>
        )}
      </div>

      {showLiveMap && (
        <div className="mt-3">
          <DeliveringMap
            order={order}
            lat={coordinates.lat}
            lng={coordinates.lng}
          />
        </div>
      )}
    </div>
  );
}
