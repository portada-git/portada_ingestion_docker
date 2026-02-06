/**
 * Storage Metadata Analysis component
 * Placeholder for storage metadata functionality
 */

import React from 'react';
import { HardDrive } from 'lucide-react';

const StorageMetadataAnalysis: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Metadatos de Almacenaje</h1>
        <p className="mt-1 text-sm text-gray-600">
          Analizar metadatos de almacenamiento y linaje de campos
        </p>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <HardDrive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Metadatos de Almacenaje
          </h3>
          <p className="text-gray-600">
            Esta funcionalidad estará disponible próximamente
          </p>
        </div>
      </div>
    </div>
  );
};

export default StorageMetadataAnalysis;