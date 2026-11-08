import * as React from "react";

import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  promotion?: boolean;
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, promotion = false, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border text-card-foreground shadow relative overflow-hidden transition-all",

        // padrão
        "bg-card/80 backdrop-blur-sm",

        //promoção
        promotion &&
          "border-brand-300 bg-linear-to-br from-brand-50 via-card to-brand-50 shadow-brand-100 ring-2 ring-brand-200 dark:border-brand-800 dark:from-brand-950 dark:via-card dark:to-brand-950 dark:shadow-none dark:ring-brand-900",

        className,
      )}
      {...props}
    >
      {/*  selo promoção */}
      {promotion && (
        <div className="absolute top-2 right-2 z-20 bg-linear-to-r from-brand-500 to-brand-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow">
          Promoção
        </div>
      )}

      {children}
    </div>
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
