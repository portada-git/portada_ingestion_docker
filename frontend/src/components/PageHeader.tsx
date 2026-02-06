/**
 * Page header component
 * Provides consistent page headers with title, description, and actions
 */

import React from 'react';
import Breadcrumb from './Breadcrumb';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  showBreadcrumb?: boolean;
  breadcrumbItems?: Array<{
    label: string;
    href?: string;
    current?: boolean;
  }>;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  showBreadcrumb = true,
  breadcrumbItems
}) => {
  return (
    <div className="mb-8">
      {showBreadcrumb && (
        <Breadcrumb items={breadcrumbItems} />
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">
              {description}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="mt-4 sm:mt-0 sm:ml-4 flex-shrink-0">
            <div className="flex space-x-3">
              {actions}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;