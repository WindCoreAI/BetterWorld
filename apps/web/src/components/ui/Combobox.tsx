"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  /** Allow values not in the options list */
  allowCustom?: boolean;
}

export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  allowCustom = false,
}: ComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync query when value changes externally (e.g. prefill)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = useCallback(
    (opt: string) => {
      setQuery(opt);
      onChange(opt);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    if (allowCustom) {
      onChange(v);
    } else if (!v) {
      onChange("");
    }
  };

  const handleBlur = useCallback(() => {
    // Delay to allow click on option to register
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        // If not allowCustom, reset to last valid value if query doesn't match
        if (!allowCustom && !options.includes(query)) {
          if (value && options.includes(value)) {
            setQuery(value);
          } else {
            setQuery("");
            onChange("");
          }
        }
      }
    }, 150);
  }, [allowCustom, onChange, options, query, value]);

  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-charcoal mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full h-10 px-3 bg-cream border border-charcoal/20 rounded-lg shadow-neu-inset text-charcoal placeholder:text-charcoal/40 focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 outline-none transition-all duration-150"
        value={query}
        placeholder={placeholder}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        required={required}
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-charcoal/15 rounded-lg shadow-lg"
        >
          {filtered.slice(0, 30).map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                opt === value
                  ? "bg-terracotta/10 text-terracotta font-medium"
                  : "text-charcoal hover:bg-charcoal/5"
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent input blur before click registers
                handleSelect(opt);
              }}
            >
              {opt}
            </li>
          ))}
          {filtered.length > 30 && (
            <li className="px-3 py-2 text-xs text-charcoal-light italic">
              Type more to narrow results...
            </li>
          )}
        </ul>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-charcoal/15 rounded-lg shadow-lg px-3 py-2 text-sm text-charcoal-light">
          {allowCustom ? `Using "${query}"` : "No matches found"}
        </div>
      )}
    </div>
  );
}
