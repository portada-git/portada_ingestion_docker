/**
 * Publication Selector Component
 * Reutilizable selector for publications with hardcoded values
 */

import React from "react";
import { ChevronDown } from "lucide-react";
import { PUBLICATIONS } from "../constants/publications";
import clsx from "clsx";

interface PublicationSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  includeAll?: boolean;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

const PublicationSelector: React.FC<PublicationSelectorProps> = ({
  value,
  onChange,
  placeholder = "Selecciona una publicación",
  includeAll = true,
  allLabel = "Todas las publicaciones",
  className = "",
  disabled = false,
  required = false,
}) => {

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className={clsx(
          "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
          "bg-white text-gray-900",
          "disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed",
          className,
        )}
      >
        {includeAll && <option value="">{allLabel}</option>}

        {!includeAll && !value && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}

        {PUBLICATIONS.map((publication) => (
          <option key={publication.code} value={publication.code}>
            {publication.name} - {publication.fullName}
          </option>
        ))}
      </select>

      {/* Custom dropdown arrow */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
};

export default PublicationSelector;
