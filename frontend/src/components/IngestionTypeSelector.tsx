/**
 * Ingestion type selector component
 * Handles selection between extraction data and known entities with process isolation
 */

import React from 'react';
import { FileText, Database, Lock } from 'lucide-react';
import clsx from 'clsx';

export type IngestionType = 'extraction_data' | 'known_entities';

interface IngestionTypeSelectorProps {
  selectedType: IngestionType;
  onTypeChange: (type: IngestionType) => void;
  isProcessing?: boolean;
  processingType?: IngestionType | null;
  disabled?: boolean;
  className?: string;
}

const IngestionTypeSelector: React.FC<IngestionTypeSelectorProps> = ({
  selectedType,
  onTypeChange,
  isProcessing = false,
  processingType = null,
  disabled = false,
  className = ''
}) => {
  const ingestionTypes = [
    {
      id: 'extraction_data' as IngestionType,
      name: 'Datos de Extracción',
      description: 'Archivos JSON con datos extraídos de periódicos',
      icon: FileText,
      formats: ['JSON'],
      color: 'blue'
    },
    {
      id: 'known_entities' as IngestionType,
      name: 'Entidades Conocidas',
      description: 'Archivos YAML con entidades de referencia',
      icon: Database,
      formats: ['YAML', 'YML'],
      color: 'green'
    }
  ];

  const isTypeDisabled = (type: IngestionType) => {
    if (disabled) return true;
    
    // If processing, disable the type that's not being processed
    if (isProcessing && processingType && processingType !== type) {
      return true;
    }
    
    return false;
  };

  const getTypeStatus = (type: IngestionType) => {
    if (isProcessing && processingType === type) {
      return 'processing';
    }
    if (isTypeDisabled(type)) {
      return 'disabled';
    }
    if (selectedType === type) {
      return 'selected';
    }
    return 'available';
  };

  return (
    <div className={clsx('space-y-4', className)}>
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">
          Tipo de Ingestión
        </h2>
        <p className="text-sm text-gray-600">
          Selecciona el tipo de datos que deseas ingerir. Solo se puede procesar un tipo a la vez.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ingestionTypes.map((type) => {
          const Icon = type.icon;
          const status = getTypeStatus(type.id);
          const isDisabled = isTypeDisabled(type.id);

          return (
            <button
              key={type.id}
              onClick={() => !isDisabled && onTypeChange(type.id)}
              disabled={isDisabled}
              className={clsx(
                'relative p-4 border-2 rounded-lg text-left transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-offset-2',
                {
                  // Selected state
                  'border-primary-500 bg-primary-50 ring-primary-500': status === 'selected',
                  // Processing state
                  'border-yellow-400 bg-yellow-50': status === 'processing',
                  // Disabled state
                  'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60': status === 'disabled',
                  // Available state
                  'border-gray-200 hover:border-gray-300 hover:bg-gray-50': status === 'available',
                }
              )}
            >
              {/* Lock icon for disabled state */}
              {status === 'disabled' && (
                <div className="absolute top-2 right-2">
                  <Lock className="w-4 h-4 text-gray-400" />
                </div>
              )}

              {/* Processing indicator */}
              {status === 'processing' && (
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <div className="flex items-start">
                <Icon className={clsx(
                  'w-6 h-6 mr-3 mt-1 flex-shrink-0',
                  {
                    'text-primary-600': status === 'selected',
                    'text-yellow-600': status === 'processing',
                    'text-gray-400': status === 'disabled',
                    'text-gray-500': status === 'available',
                  }
                )} />
                
                <div className="flex-1 min-w-0">
                  <h3 className={clsx(
                    'font-medium mb-1',
                    {
                      'text-primary-900': status === 'selected',
                      'text-yellow-900': status === 'processing',
                      'text-gray-500': status === 'disabled',
                      'text-gray-900': status === 'available',
                    }
                  )}>
                    {type.name}
                  </h3>
                  
                  <p className={clsx(
                    'text-sm mb-2',
                    {
                      'text-primary-700': status === 'selected',
                      'text-yellow-700': status === 'processing',
                      'text-gray-400': status === 'disabled',
                      'text-gray-600': status === 'available',
                    }
                  )}>
                    {type.description}
                  </p>
                  
                  <div className="flex items-center">
                    <span className={clsx(
                      'text-xs font-medium',
                      {
                        'text-primary-600': status === 'selected',
                        'text-yellow-600': status === 'processing',
                        'text-gray-400': status === 'disabled',
                        'text-gray-500': status === 'available',
                      }
                    )}>
                      Formatos: {type.formats.join(', ')}
                    </span>
                  </div>

                  {/* Status messages */}
                  {status === 'processing' && (
                    <div className="mt-2 text-xs text-yellow-700 font-medium">
                      Procesando archivo...
                    </div>
                  )}
                  
                  {status === 'disabled' && processingType && processingType !== type.id && (
                    <div className="mt-2 text-xs text-gray-500">
                      Bloqueado: procesando {processingType === 'extraction_data' ? 'datos de extracción' : 'entidades conocidas'}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Process isolation notice */}
      {isProcessing && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Lock className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Proceso de ingestión activo
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Se está procesando un archivo de {processingType === 'extraction_data' ? 'datos de extracción' : 'entidades conocidas'}. 
                El otro tipo de ingestión está temporalmente bloqueado para evitar conflictos.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IngestionTypeSelector;