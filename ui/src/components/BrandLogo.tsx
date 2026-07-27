import { cn } from "@/lib/utils";

const BRAND_NAME = "HaviAI";

export function BrandLogo({
  className,
  inverse = false,
  mark = false,
}: {
  className?: string;
  inverse?: boolean;
  mark?: boolean;
}) {
  const tone = inverse ? "text-zinc-50" : "text-foreground";
  const markClasses = cn(
    "inline-flex aspect-square items-center justify-center rounded-md bg-cta px-1.5 text-xs font-bold leading-none text-black shadow-sm",
    className
  );

  if (mark) {
    return (
      <span className={markClasses} aria-label={BRAND_NAME}>
        HA
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2 select-none", tone, className)} aria-label={BRAND_NAME}>
      <span className="inline-flex aspect-square h-[1.35em] items-center justify-center rounded-md bg-cta text-[0.55em] font-bold leading-none text-black shadow-sm">
        HA
      </span>
      <span className="text-[0.95em] font-semibold tracking-normal">{BRAND_NAME}</span>
    </span>
  );
}
