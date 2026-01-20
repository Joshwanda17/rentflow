import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles with iOS-safe font size (16px prevents zoom on focus)
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-base md:text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          // iOS-specific: prevent callout and user-select issues
          "touch-manipulation",
          className,
        )}
        ref={ref}
        autoComplete={props.autoComplete || "off"}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };