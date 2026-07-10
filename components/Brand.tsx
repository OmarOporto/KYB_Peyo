import Image from "next/image";

const SIZES = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
} as const;

/**
 * Lockup del logo Peyo. El wordmark es navy; en modo oscuro se muestra sobre
 * un chip claro para preservar los colores de marca.
 */
export function Brand({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-lg px-1.5 py-1 dark:bg-white/90 ${className}`}
    >
      <Image
        src="/peyo-logo.png"
        alt="Peyo"
        width={813}
        height={376}
        priority
        className={`${SIZES[size]} w-auto`}
      />
    </span>
  );
}
