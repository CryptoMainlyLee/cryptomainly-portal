import * as React from "react";
import { cva, type VariantProps } from "./cva";
import clsx from "clsx";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-10 px-4 py-2",
  {
    variants: {
      variant: {
        default: "bg-white text-black hover:opacity-90",
        secondary: "bg-white/10 text-white hover:bg-white/20",
        ghost: "bg-transparent hover:bg-white/10 text-white",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => (
    <button ref={ref} className={clsx(buttonVariants({ variant }), className)} {...props} />
  )
);
Button.displayName = "Button";

export default Button;
