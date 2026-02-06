/**
 * Generic query form component
 * Provides a reusable form structure for analysis queries
 */

import React, { useState } from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import LoadingSpinner from '../LoadingSpinner';
import clsx from 'clsx';

export interface QueryFormField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'datetime-local' | 'number' | 'file';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  validation?: (value: any) => string | null;
  description?: string;
}

export interface QueryFormProps {
  title: string;
  description?: string;
  fields: QueryFormField[];
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onReset?: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  resetLabel?: string;
  showReset?: boolean;
  className?: string;
}

const QueryForm: React.FC<QueryFormProps> = ({
  title,
  description,
  fields,
  initialValues = {},
  onSubmit,
  onReset,
  isLoading = false,
  submitLabel = 'Ejecutar Consulta',
  resetLabel = 'Limpiar',
  showReset = true,
  className = ''
}) => {
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleChange = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleBlur = (name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    validateField(name, values[name]);
  };

  const validateField = (name: string, value: any): string | null => {
    const field = fields.find(f => f.name === name);
    if (!field) return null;

    // Required validation
    if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      const error = `${field.label} es requerido`;
      setErrors(prev => ({ ...prev, [name]: error }));
      return error;
    }

    // Custom validation
    if (field.validation && value) {
      const error = field.validation(value);
      if (error) {
        setErrors(prev => ({ ...prev, [name]: error }));
        return error;
      }
    }

    // Clear error if validation passes
    setErrors(prev => ({ ...prev, [name]: '' }));
    return null;
  };

  const validateForm = (): boolean => {
    let isValid = true;
    const newErrors: Record<string, string> = {};

    fields.forEach(field => {
      const error = validateField(field.name, values[field.name]);
      if (error) {
        newErrors[field.name] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(values);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const handleReset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    if (onReset) {
      onReset();
    }
  };

  const renderField = (field: QueryFormField) => {
    const value = values[field.name] || '';
    const error = errors[field.name];
    const isTouched = touched[field.name];

    switch (field.type) {
      case 'select':
        return (
          <select
            id={field.name}
            name={field.name}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            onBlur={() => handleBlur(field.name)}
            className={clsx(
              'input',
              error && isTouched && 'border-red-300 focus:border-red-500 focus:ring-red-500'
            )}
            required={field.required}
          >
            <option value="">{field.placeholder || `Selecciona ${field.label.toLowerCase()}`}</option>
            {field.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'file':
        return (
          <input
            type="file"
            id={field.name}
            name={field.name}
            onChange={(e) => handleChange(field.name, e.target.files?.[0] || null)}
            onBlur={() => handleBlur(field.name)}
            className={clsx(
              'input',
              error && isTouched && 'border-red-300 focus:border-red-500 focus:ring-red-500'
            )}
            required={field.required}
          />
        );

      default:
        return (
          <input
            type={field.type}
            id={field.name}
            name={field.name}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            onBlur={() => handleBlur(field.name)}
            placeholder={field.placeholder}
            className={clsx(
              'input',
              error && isTouched && 'border-red-300 focus:border-red-500 focus:ring-red-500'
            )}
            required={field.required}
          />
        );
    }
  };

  return (
    <div className={clsx('card', className)}>
      <div className="flex items-center mb-4">
        <Filter className="w-5 h-5 text-gray-400 mr-2" />
        <h2 className="text-lg font-medium text-gray-900">{title}</h2>
      </div>
      
      {description && (
        <p className="text-sm text-gray-600 mb-4">{description}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fields.map(field => (
            <div key={field.name} className="space-y-1">
              <label 
                htmlFor={field.name} 
                className="block text-sm font-medium text-gray-700"
              >
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              
              {renderField(field)}
              
              {field.description && (
                <p className="text-xs text-gray-500">{field.description}</p>
              )}
              
              {errors[field.name] && touched[field.name] && (
                <p className="text-xs text-red-600">{errors[field.name]}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Ejecutando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  {submitLabel}
                </>
              )}
            </button>
            
            {showReset && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading}
                className="btn btn-secondary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {resetLabel}
              </button>
            )}
          </div>
          
          <div className="text-xs text-gray-500">
            {Object.keys(touched).length > 0 && (
              <span>
                Campos completados: {Object.keys(touched).length}/{fields.length}
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default QueryForm;