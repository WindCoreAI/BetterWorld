import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, ...props }, ref) => (
    <div
      ref={ref}
      className={[
        "bg-cream rounded-xl p-6 shadow-neu-md",
        "transition-[box-shadow,transform] duration-150 ease-out",
        "hover:shadow-neu-lg hover:-translate-y-0.5",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, ...props }, ref) => (
    <div ref={ref} className={["flex items-center justify-between mb-4", className].join(" ")} {...props}>
      {children}
    </div>
  ),
);
CardHeader.displayName = "CardHeader";

export const CardBody = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  ),
);
CardBody.displayName = "CardBody";

export const CardFooter = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, ...props }, ref) => (
    <div
      ref={ref}
      className={["flex items-center justify-between mt-4 pt-4 border-t border-charcoal/10", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  ),
);
CardFooter.displayName = "CardFooter";
