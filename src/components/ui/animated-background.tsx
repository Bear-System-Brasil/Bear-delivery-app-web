import { cn } from "@/lib/utils";
import * as React from "react";

export interface AnimatedBackgroundProps {
  /**
   * Background color/gradient for the container
   * @default "bg-background"
   */
  background?: string;

  /**
   * Show animated blobs
   * @default true
   */
  showBlobs?: boolean;

  /**
   * Number of blobs to render
   * @default 4
   */
  blobCount?: number;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Children content
   */
  children?: React.ReactNode;
}

const blobConfigs = [
  {
    id: "blob-orange-orange",
    gradient: "from-brand-400/20 to-brand-400/20",
    size: "w-64 h-64",
    position: "top-20 left-10",
    animation: "animate-pulse",
  },
  {
    id: "blob-purple-blue",
    gradient: "from-brand-deep/15 to-brand-400/15",
    size: "w-48 h-48",
    position: "top-40 right-20",
    animation: "animate-pulse delay-1000",
  },
  {
    id: "blob-yellow-orange",
    gradient: "from-yellow-400/10 to-brand-400/10",
    size: "w-80 h-80",
    position: "bottom-40 left-1/4",
    animation: "animate-pulse delay-2000",
  },
  {
    id: "blob-orange-purple",
    gradient: "from-brand-400/15 to-brand-deep/15",
    size: "w-56 h-56",
    position: "bottom-20 right-1/3",
    animation: "animate-pulse delay-500",
  },
];

/**
 * AnimatedBackground - A decorative background with animated gradient blobs
 *
 * This component provides a consistent animated background used across multiple pages.
 * It includes floating gradient blobs with pulse animations that add visual interest
 * without being distracting.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <AnimatedBackground>
 *   <YourContent />
 * </AnimatedBackground>
 *
 * // Custom background
 * <AnimatedBackground background="bg-card">
 *   <YourContent />
 * </AnimatedBackground>
 *
 * // Without blobs
 * <AnimatedBackground showBlobs={false}>
 *   <YourContent />
 * </AnimatedBackground>
 *
 * // Custom blob count
 * <AnimatedBackground blobCount={2}>
 *   <YourContent />
 * </AnimatedBackground>
 * ```
 */
export const AnimatedBackground = React.memo<AnimatedBackgroundProps>(
  ({
    background = "bg-background",
    showBlobs = true,
    blobCount = 4,
    className,
    children,
  }) => {
    const displayedBlobs = React.useMemo(
      () => blobConfigs.slice(0, Math.min(blobCount, blobConfigs.length)),
      [blobCount],
    );

    return (
      <div
        className={cn(
          "relative min-h-screen overflow-hidden py-16",
          background,
          className,
        )}
        suppressHydrationWarning
      >
        {/* Animated background blobs */}
        {showBlobs &&
          displayedBlobs.map((blob) => (
            <div
              key={blob.id}
              className={cn(
                "absolute rounded-full blur-3xl pointer-events-none opacity-60",
                `bg-linear-to-r ${blob.gradient}`,
                blob.size,
                blob.position,
                blob.animation,
              )}
              aria-hidden="true"
              suppressHydrationWarning
            />
          ))}

        {/* Content */}
        {children && (
          <div className="relative z-10" suppressHydrationWarning>
            {children}
          </div>
        )}
      </div>
    );
  },
);

AnimatedBackground.displayName = "AnimatedBackground";

/**
 * PageWithAnimatedBackground - A page wrapper with animated background
 *
 * Combines AnimatedBackground with common page structure (padding, max-width, etc.)
 *
 * @example
 * ```tsx
 * <PageWithAnimatedBackground>
 *   <h1>My Page</h1>
 *   <p>Content here</p>
 * </PageWithAnimatedBackground>
 * ```
 */
export const PageWithAnimatedBackground: React.FC<{
  children: React.ReactNode;
  background?: string;
  showBlobs?: boolean;
  className?: string;
  containerClassName?: string;
}> = React.memo(
  ({ children, background, showBlobs, className, containerClassName }) => {
    return (
      <AnimatedBackground
        background={background}
        showBlobs={showBlobs}
        className={className}
      >
        <div
          className={cn(
            "container mx-auto px-4 py-6 sm:py-8",
            containerClassName,
          )}
        >
          {children}
        </div>
      </AnimatedBackground>
    );
  },
);

PageWithAnimatedBackground.displayName = "PageWithAnimatedBackground";
