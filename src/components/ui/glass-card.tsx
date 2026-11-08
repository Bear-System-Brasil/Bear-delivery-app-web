import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import * as React from "react";

export interface GlassCardProps {
  /**
   * Card variant
   * - glass: glassmorphism effect (default)
   * - solid: solid white background
   * - gradient: gradient background
   */
  variant?: "glass" | "solid" | "gradient";

  /**
   * Shadow intensity
   */
  shadow?: "sm" | "md" | "lg" | "xl" | "2xl" | "none";

  /**
   * Border style
   */
  border?: "default" | "none" | "accent";

  /**
   * Make card hoverable with hover effects
   */
  hoverable?: boolean;

  /**
   * Make card clickable (adds cursor pointer)
   */
  clickable?: boolean;

  /**
   * Make card sticky
   */
  sticky?: boolean;

  /**
   * Sticky offset from top
   */
  stickyOffset?: string;

  /**
   * Custom className
   */
  className?: string;

  /**
   * Children content
   */
  children: React.ReactNode;

  /**
   * onClick handler
   */
  onClick?: () => void;

  /**
   * onMouseEnter handler
   */
  onMouseEnter?: () => void;

  /**
   * Inline styles
   */
  style?: React.CSSProperties;
}

const variantClasses = {
  glass: "bg-card/80 backdrop-blur-sm",
  solid: "bg-card",
  gradient: "bg-gradient-to-r from-brand-500 to-brand-500 text-white",
};

const shadowClasses = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
  "2xl": "shadow-2xl",
};

const borderClasses = {
  default: "border",
  none: "border-0",
  accent: "border-2 border-brand-300 dark:border-brand-700",
};

/**
 * GlassCard - A card with glassmorphism effect
 *
 * This component provides consistent card styling across the application,
 * with support for glassmorphism effects, shadows, borders, and interactions.
 *
 * @example
 * ```tsx
 * // Basic glass card
 * <GlassCard>
 *   <p>Content here</p>
 * </GlassCard>
 *
 * // Hoverable card
 * <GlassCard hoverable clickable onClick={handleClick}>
 *   <p>Click me</p>
 * </GlassCard>
 *
 * // Sticky sidebar card
 * <GlassCard sticky stickyOffset="top-28">
 *   <p>Sticky content</p>
 * </GlassCard>
 *
 * // Gradient card
 * <GlassCard variant="gradient" shadow="2xl">
 *   <p>Gradient background</p>
 * </GlassCard>
 * ```
 */
export const GlassCard = React.memo<GlassCardProps>(
  React.forwardRef<HTMLDivElement, GlassCardProps>(
    (
      {
        variant = "glass",
        shadow = "lg",
        border = "none",
        hoverable = false,
        clickable = false,
        sticky = false,
        stickyOffset = "top-28",
        className,
        children,
        onClick,
        onMouseEnter,
        style,
        ...props
      },
      ref,
    ) => {
      return (
        <Card
          ref={ref}
          className={cn(
            // Base variant
            variantClasses[variant],

            // Shadow
            shadowClasses[shadow],

            // Border
            borderClasses[border],

            // Hover effects
            hoverable && "group hover:shadow-xl transition-shadow duration-300",

            // Clickable (auto-detect from onClick or explicit clickable prop)
            (clickable || onClick) && "cursor-pointer",

            // Sticky
            sticky && `sticky ${stickyOffset}`,

            // Custom
            className,
          )}
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          style={style}
          {...props}
        >
          {children}
        </Card>
      );
    },
  ),
);

GlassCard.displayName = "GlassCard";

/**
 * GlassCardHeader - Header for GlassCard
 */
export const GlassCardHeader = React.memo<{
  children: React.ReactNode;
  className?: string;
}>(({ children, className }) => (
  <CardHeader className={cn("space-y-1", className)}>{children}</CardHeader>
));

GlassCardHeader.displayName = "GlassCardHeader";

/**
 * GlassCardTitle - Title for GlassCard
 */
export const GlassCardTitle = React.memo<{
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
}>(({ children, className, gradient = false }) => (
  <CardTitle
    className={cn(
      gradient &&
        "bg-linear-to-r from-brand-500 to-brand-500 bg-clip-text text-transparent",
      className,
    )}
  >
    {children}
  </CardTitle>
));

GlassCardTitle.displayName = "GlassCardTitle";

/**
 * GlassCardDescription - Description for GlassCard
 */
export const GlassCardDescription = React.memo<{
  children: React.ReactNode;
  className?: string;
}>(({ children, className }) => (
  <CardDescription className={className}>{children}</CardDescription>
));

GlassCardDescription.displayName = "GlassCardDescription";

/**
 * GlassCardContent - Content area for GlassCard
 */
export const GlassCardContent = React.memo<{
  children: React.ReactNode;
  className?: string;
}>(({ children, className }) => (
  <CardContent className={className}>{children}</CardContent>
));

GlassCardContent.displayName = "GlassCardContent";

/**
 * GlassCardFooter - Footer for GlassCard
 */
export const GlassCardFooter = React.memo<{
  children: React.ReactNode;
  className?: string;
}>(({ children, className }) => (
  <CardFooter className={className}>{children}</CardFooter>
));

GlassCardFooter.displayName = "GlassCardFooter";
