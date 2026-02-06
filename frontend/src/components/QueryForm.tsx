/**
 * Modern Query Form Component
 * Provides consistent form styling for analysis queries
 */

import React from "react";
import { Search } from "lucide-react";
import { clsx } from "clsx";

interface QueryFormProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  submitText: string;
  isLoading?: boolean;
  disabled?: boolean;
  submitColor?: "blue" | "green" | "purple" | "orange";
}

const QueryForm: React.FC<QueryFormProps> = ({
  children,
  onSubmit,
  submitText,
  isLoading = false,
  disabled = false,
  submitColor = "green",
}) => {
  const colorClasses = {
    blue: "bg-blue-600 hover:bg-blue-500 focus:ring-blue-500",
    green: "bg-green-600 hover:bg-green-500 focus:ring-green-500",
    purple: "bg-purple-600 hover:bg-purple-500 focus:ring-purple-500",
    orange: "bg-orange-600 hover:bg-orange-500 focus:ring-orange-500",
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || disabled}
        className={clsx(
          "w-full flex items-center justify-center px-6 py-3 text-white font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white",
          colorClasses[submitColor],
          {
            "opacity-50 cursor-not-allowed": isLoading || disabled,
            "transform hover:scale-105 active:scale-95":
              !isLoading && !disabled,
          },
        )}
      >
        <Search className="w-5 h-5 mr-2" />
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            {submitText.includes("...") ? submitText : "Consultando..."}
          </>
        ) : (
          submitText
        )}
      </button>
    </form>
  );
};

export default QueryForm;
