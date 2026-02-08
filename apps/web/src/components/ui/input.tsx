import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface InputBaseProps {
  label: string;
  helperText?: string;
  error?: string;
}

type TextInputProps = InputBaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
    multiline?: false;
  };

type TextareaInputProps = InputBaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & {
    multiline: true;
  };

type InputProps = TextInputProps | TextareaInputProps;

const baseClasses = [
  "w-full h-10 px-4 text-[15px] text-charcoal",
  "bg-cream border border-charcoal/15 rounded-lg",
  "shadow-[inset_2px_2px_4px_rgba(0,0,0,0.06),inset_-1px_-1px_3px_rgba(255,255,255,0.5)]",
  "transition-all duration-150 ease-out",
  "focus:border-terracotta focus:ring-3 focus:ring-terracotta/30 focus:outline-none",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "placeholder:text-charcoal-light/50",
].join(" ");

const errorClasses = "border-error focus:border-error focus:ring-error/30";

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>((props, ref) => {
  const { label, helperText, error, multiline, className = "", id, ...rest } = props;
  const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-charcoal">
        {label}
        {"required" in rest && rest.required ? (
          <span className="text-error ml-0.5" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {multiline ? (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[baseClasses, "h-auto min-h-[5rem] py-2 resize-y", error ? errorClasses : "", className].join(
            " ",
          )}
          rows={3}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[baseClasses, error ? errorClasses : "", className].join(" ")}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {error && (
        <p id={errorId} className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperId} className="text-sm text-charcoal-light">
          {helperText}
        </p>
      )}
    </div>
  );
});
Input.displayName = "Input";
