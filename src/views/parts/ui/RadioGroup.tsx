"use client";

import { useId } from "react";

export interface RadioOption {
  value: string;
  label: string;
}

/** Native radios inside a fieldset: arrow keys, labels and grouping work without extra code. */
export function RadioGroup({
  legend,
  name,
  options,
  value,
  error,
  required,
  onChange,
}: {
  legend: string;
  name: string;
  options: RadioOption[];
  value?: string;
  error?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  return (
    <fieldset aria-describedby={errorId} className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name={name}
            value={option.value}
            required={required}
            defaultChecked={onChange ? undefined : value === option.value}
            checked={onChange ? value === option.value : undefined}
            onChange={onChange ? () => onChange(option.value) : undefined}
            className="size-5"
          />
          {option.label}
        </label>
      ))}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
