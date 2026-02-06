/**
 * Known Entities Analysis component
 * Placeholder for known entities functionality
 */

import React from 'react';
import { Database } from 'lucide-react';

const KnownEntitiesAnalysis: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entidades Conocidas</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ver todas las entidades conocidas subidas al sistema
        </p>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Entidades Conocidas
          </h3>
          <p className="text-gray-600">
            Esta funcionalidad estará disponible próximamente
          </p>
        </div>
      </div>
    </div>
  );
};

export default KnownEntitiesAnalysis;