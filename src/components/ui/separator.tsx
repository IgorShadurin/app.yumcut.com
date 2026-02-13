import * as React from "react";
import { cn } from "@/lib/utils";

function Separator({ className, orientation = "horizontal", ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === "vertical"
          ? "h-full w-px bg-gray-200 dark:bg-gray-800"
          : "w-full h-px bg-gray-200 dark:bg-gray-800",
        className
      )}
      {...props}
    />
  );
}

export { Separator };

