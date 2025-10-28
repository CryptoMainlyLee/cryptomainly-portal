import * as React from "react";
import clsx from "clsx";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl shadow-soft", className)} {...props} />;
}
