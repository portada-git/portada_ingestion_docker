/**
 * Modern Form Field Component
 * Provides consistent dark-themed form field styling
 */

import React from "react";
import { clsx } from "clsx";

interface FormFieldProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

interface SelectFieldProps {
  label: string;
  description?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  required?: boolean;
}

interface InputFieldProps {
  label: string;
  description?: string;
  name?: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  min?: string;
  max?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  description,
  children,
  className,
}) => {
  return (
    <div className={clsx("space-y-2", className)}>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      {children}
    </div>
  );
};

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  description,
  name,
  value,
  onChange,
  options,
  className,
  required = false,
}) => {
  return (
    <FormField label={label} description={description} className={className}>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
};

export const InputField: React.FC<InputFieldProps> = ({
  label,
  description,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  className,
  required = false,
  min,
  max,
}) => {
  return (
    <FormField label={label} description={description} className={className}>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
      />
    </FormField>
  );
};

export default FormField;
