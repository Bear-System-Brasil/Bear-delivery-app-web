"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useBrowserNotificationPermission,
  useNotifications,
} from "@/hooks/use-notifications";
import { acknowledgeOrder } from "@/lib/order-alerts";
import { cn } from "@/lib/utils";
import type {
  AppNotification,
  NotificationAudience,
} from "@/stores/notifications-store";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, BellRing, Check, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface NotificationBellProps {
  audience: NotificationAudience;
  className?: string;
}

export function NotificationBell({ audience, className }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, markAsRead, markAllAsRead } =
    useNotifications(audience);
  const { permission, requestPermission } = useBrowserNotificationPermission();

  const handleSelect = (item: AppNotification) => {
    markAsRead(item.id);
    if (item.orderId) acknowledgeOrder(item.orderId);
    setOpen(false);
    if (item.href) router.push(item.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "relative h-9 w-9 rounded-xl border-0 bg-muted/50 md:h-10 md:w-10",
            className,
          )}
          aria-label={
            unreadCount > 0
              ? `Notificações (${unreadCount} não lidas)`
              : "Notificações"
          }
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notificações</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              <Check className="h-3 w-3" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        {permission === "default" && (
          <button
            type="button"
            onClick={requestPermission}
            className="flex w-full items-center gap-2 border-b bg-brand-50/60 dark:bg-brand-950/40 px-4 py-2.5 text-left text-xs font-medium text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40"
          >
            <BellRing className="h-3.5 w-3.5 shrink-0" />
            Ativar notificações no navegador
          </button>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            Nenhuma notificação por aqui.
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted",
                      !item.read && "bg-brand-50/40 dark:bg-brand-950/40",
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      {!item.read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                      <span className="truncate text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                    </div>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {item.body}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(item.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
