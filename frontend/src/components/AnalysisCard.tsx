/**
 * Modern Analysis Card Component
 * Provides a consistent dark-themed card layout for analysis views
 */

import React from "react";
import { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface AnalysisCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  className?: string;
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        "bg-white border border-gray-200 rounded-2xl p-6 text-gray-900 shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mr-4">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <p className="text-gray-600 text-sm">{subtitle}</p>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">{children}</div>
    </div>
  );
};

export default AnalysisCard;
