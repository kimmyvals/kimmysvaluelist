import { useEffect, useRef, useState } from "react";
import { encodeImageUrl } from "@/lib/contact";
import { ImageOff } from "lucide-react";

/**
 * Reliable image renderer for skin thumbnails.
 *  - Native lazy-loading, async decoding
 *  - Skeleton placeholder until first paint
 *  - Auto-retry up to 3 times with exponential backoff + cache-bust
 *  - Falls back to an initial-letter tile if all retries fail
 *
 * Used everywhere a skin image renders so behavior is consistent on
 * mobile and desktop, regardless of slow / flaky networks.
 */
export function SkinImage({
  src,
  alt,
  className,
  imgClassName,
  fallbackLabel,
  rounded = "rounded-md",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  fallbackLabel?: string;
  rounded?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Reset state when the src changes.
  useEffect(() => {
    setAttempt(0);
    setLoaded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  if (!src || failed) {
    const initials = (fallbackLabel ?? alt ?? "?")
      .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
    return (
      <div
        className={`flex items-center justify-center bg-secondary/40 text-muted-foreground ${rounded} ${className ?? ""}`}
        aria-label={alt}
      >
        {initials ? (
          <span className="font-display text-sm font-bold tracking-wider">{initials}</span>
        ) : (
          <ImageOff className="h-5 w-5" />
        )}
      </div>
    );
  }

  // Cache-bust on retries so a broken cached response doesn't loop.
  const finalSrc = attempt === 0 ? encodeImageUrl(src) : `${encodeImageUrl(src)}${src.includes("?") ? "&" : "?"}_r=${attempt}`;

  return (
    <div className={`relative overflow-hidden ${rounded} ${className ?? ""}`}>
      {!loaded && (
        <div className={`absolute inset-0 animate-pulse bg-secondary/40 ${rounded}`} aria-hidden />
      )}
      <img
        key={attempt}
        src={finalSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (attempt < 3) {
            const delay = 250 * Math.pow(2, attempt); // 250 / 500 / 1000ms
            timerRef.current = window.setTimeout(() => setAttempt((a) => a + 1), delay);
          } else {
            setFailed(true);
          }
        }}
        className={`relative h-full w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${imgClassName ?? "object-contain"}`}
      />
    </div>
  );
}
