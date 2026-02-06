/**
 * Parameter validator component
 * Provides validation utilities for query parameters
 */

import React from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import clsx from 'clsx';

export interface ValidationRule {
  name: string;
  message: string;
  validator: (value: any, allValues?: Record<string, any>) => boolean;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  infos: string[];
}

interface ParameterValidatorProps {
  values: Record<string, any>;
  rules: ValidationRule[];
  showValidation?: boolean;
  className?: string;
}

const ParameterValidator: React.FC<ParameterValidatorProps> = ({
  values,
  rules,
  showValidation = true,
  className = ''
}) => {
  const validateParameters = (): ValidationResult => {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      infos: []
    };

    rules.forEach(rule => {
      const fieldValue = values[rule.name];
      const isValid = rule.validator(fieldValue, values);

      if (!isValid) {
        switch (rule.severity) {
          case 'error':
            result.errors.push(rule.message);
            result.isValid = false;
            break;
          case 'warning':
            result.warnings.push(rule.message);
            break;
          case 'info':
            result.infos.push(rule.message);
            break;
        }
      }
    });

    return result;
  };

  const validation = validateParameters();

  if (!showValidation || (validation.errors.length === 0 && validation.warnings.length === 0 && validation.infos.length === 0)) {
    return null;
  }

  return (
    <div className={clsx('space-y-3', className)}>
      {/* Errors */}
      {validation.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-800 mb-2">
                Errores de Validación
              </h4>
              <ul className="text-sm text-red-700 space-y-1">
                {validation.errors.map((error, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-yellow-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-800 mb-2">
                Advertencias
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                {validation.warnings.map((warning, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      {validation.infos.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <Info className="w-5 h-5 text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-blue-800 mb-2">
                Información
              </h4>
              <ul className="text-sm text-blue-700 space-y-1">
                {validation.infos.map((info, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                    {info}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Validation Summary */}
      {validation.isValid && (validation.warnings.length > 0 || validation.infos.length > 0) && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3">
          <div className="flex items-center">
            <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
            <span className="text-sm text-green-800">
              Los parámetros son válidos para ejecutar la consulta
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// Common validation rules
export const createValidationRules = {
  required: (fieldName: string, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} es requerido`,
    validator: (value) => value !== null && value !== undefined && value !== '',
    severity: 'error'
  }),

  dateFormat: (fieldName: string, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} debe tener formato YYYY-MM-DD`,
    validator: (value) => {
      if (!value) return true; // Optional field
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      return dateRegex.test(value) && !isNaN(Date.parse(value));
    },
    severity: 'error'
  }),

  dateRange: (startField: string, endField: string): ValidationRule => ({
    name: startField,
    message: 'La fecha de inicio debe ser anterior a la fecha de fin',
    validator: (value, allValues) => {
      if (!value || !allValues?.[endField]) return true;
      return new Date(value) <= new Date(allValues[endField]);
    },
    severity: 'error'
  }),

  fileSize: (fieldName: string, maxSizeMB: number): ValidationRule => ({
    name: fieldName,
    message: `El archivo no debe superar ${maxSizeMB}MB`,
    validator: (value) => {
      if (!value || !value.size) return true;
      return value.size <= maxSizeMB * 1024 * 1024;
    },
    severity: 'error'
  }),

  fileFormat: (fieldName: string, allowedFormats: string[]): ValidationRule => ({
    name: fieldName,
    message: `El archivo debe ser de formato: ${allowedFormats.join(', ')}`,
    validator: (value) => {
      if (!value || !value.name) return true;
      const extension = '.' + value.name.split('.').pop()?.toLowerCase();
      return allowedFormats.includes(extension);
    },
    severity: 'error'
  }),

  minLength: (fieldName: string, minLength: number, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} debe tener al menos ${minLength} caracteres`,
    validator: (value) => {
      if (!value) return true; // Optional field
      return value.toString().length >= minLength;
    },
    severity: 'warning'
  }),

  maxLength: (fieldName: string, maxLength: number, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} no debe superar ${maxLength} caracteres`,
    validator: (value) => {
      if (!value) return true; // Optional field
      return value.toString().length <= maxLength;
    },
    severity: 'warning'
  }),

  numericRange: (fieldName: string, min: number, max: number, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} debe estar entre ${min} y ${max}`,
    validator: (value) => {
      if (!value) return true; // Optional field
      const num = Number(value);
      return !isNaN(num) && num >= min && num <= max;
    },
    severity: 'error'
  }),

  futureDate: (fieldName: string, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} no puede ser una fecha futura`,
    validator: (value) => {
      if (!value) return true; // Optional field
      return new Date(value) <= new Date();
    },
    severity: 'warning'
  }),

  pastDate: (fieldName: string, displayName: string): ValidationRule => ({
    name: fieldName,
    message: `${displayName} no puede ser una fecha pasada`,
    validator: (value) => {
      if (!value) return true; // Optional field
      return new Date(value) >= new Date();
    },
    severity: 'warning'
  })
};

export default ParameterValidator;