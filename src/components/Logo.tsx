import React from "react";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  variant?: "light" | "dark" | "gold" | "brand";
}

export default function Logo({
  className = "",
  size = "md",
  showText = true,
  variant = "brand"
}: LogoProps) {
  const sizeClasses = {
    sm: "h-7",
    md: "h-10",
    lg: "h-14",
    xl: "h-20"
  };

  const textSizes = {
    sm: { title: "text-sm tracking-[0.2em]", subtitle: "text-[9px] tracking-[0.15em]" },
    md: { title: "text-lg tracking-[0.25em]", subtitle: "text-[11px] tracking-[0.2em]" },
    lg: { title: "text-2xl tracking-[0.3em]", subtitle: "text-xs tracking-[0.25em]" },
    xl: { title: "text-3xl tracking-[0.35em]", subtitle: "text-sm tracking-[0.3em]" }
  };

  const textColors = {
    brand: "text-amber-100",
    light: "text-white",
    dark: "text-amber-950",
    gold: "text-amber-400"
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Icon vector matching Salein Coffee House logo */}
      <svg
        viewBox="0 0 400 440"
        className={`${sizeClasses[size]} w-auto aspect-[400/440] shrink-0 text-amber-400 drop-shadow-sm`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
          {/* Chimney */}
          <path d="M 145 130 V 80 H 155 V 102" />
          
          {/* House outline */}
          <path d="M 100 300 H 300 V 170 L 200 80 L 100 170 Z" />
          
          {/* Aroma Steam Lines */}
          <path d="M 175 185 C 175 140, 205 130, 245 100" strokeWidth="11" />
          <path d="M 195 185 C 195 155, 230 145, 275 125" strokeWidth="11" />
          <path d="M 215 185 C 215 168, 255 160, 290 148" strokeWidth="11" />

          {/* Coffee Cup */}
          <path d="M 150 185 H 250 V 250 C 250 280, 230 295, 200 295 C 170 295, 150 280, 150 250 Z" strokeWidth="14" fill="none" />
          {/* Cup Handle */}
          <path d="M 150 210 C 120 210, 120 260, 150 260" strokeWidth="14" />
        </g>
      </svg>

      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <span className={`font-black uppercase font-mono ${textSizes[size].title} ${textColors[variant]}`}>
            SALEIN
          </span>
          <span className={`font-semibold uppercase ${textSizes[size].subtitle} text-amber-300/80 mt-0.5`}>
            COFFEE HOUSE
          </span>
        </div>
      )}
    </div>
  );
}
