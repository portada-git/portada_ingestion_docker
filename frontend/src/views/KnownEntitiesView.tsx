/**
 * Known Entities Analysis View
 * Implements Requirements 11.1-11.3: Query known entities
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  Search,
  AlertCircle,
  Loader2,
  Download,
  ChevronRight,
  FileCode,
} from "lucide-react";
import { apiService } from "../services/api";
import { withErrorHandling } from "../utils/apiErrorHandler";
import { KnownEntitiesResponse, KnownEntityDetailResponse } from "../types";
import jsYaml from "js-yaml";

const KnownEntitiesView: React.FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [results, setResults] = useState<KnownEntitiesResponse | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [entityDetail, setEntityDetail] =
    useState<KnownEntityDetailResponse | null>(null);
  const [formData, setFormData] = useState({
    searchTerm: "",
    entityType: "",
  });

  const typeOptions = [
    { value: "", label: "Todos los tipos" },
    { value: "flag", label: t("ingestion.entity_flag") },
    { value: "comodity", label: t("ingestion.entity_comodity") },
    { value: "ship_type", label: t("ingestion.entity_ship_type") },
    { value: "unit", label: t("ingestion.entity_unit") },
    { value: "port", label: t("ingestion.entity_port") },
    { value: "master_role", label: t("ingestion.entity_master_role") },
  ];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, searchTerm: e.target.value }));
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, entityType: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchKnownEntities();
  };

  const fetchKnownEntities = async () => {
    setIsLoading(true);

    const result = await withErrorHandling(async () => {
      return await apiService.getKnownEntities();
    });

    if (result) {
      setResults(result);
    }

    setIsLoading(false);
  };

  const fetchEntityDetail = async (name: string) => {
    setSelectedEntity(name);
    setIsDetailLoading(true);
    setEntityDetail(null);

    const result = await withErrorHandling(async () => {
      return await apiService.getKnownEntityDetail(name);
    });

    if (result) {
      setEntityDetail(result as KnownEntityDetailResponse);
    }

    setIsDetailLoading(false);
  };

  const handleExportYaml = (entity: KnownEntityDetailResponse) => {
    try {
      const yamlContent = jsYaml.dump(entity.data);
      const blob = new Blob([yamlContent], {
        type: "text/yaml;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${entity.name}.yaml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting YAML:", error);
    }
  };

  // Load entities on component mount
  useEffect(() => {
    fetchKnownEntities();
  }, []);

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      flag: "bg-blue-100 text-blue-800",
      comodity: "bg-green-100 text-green-800",
      ship_type: "bg-purple-100 text-purple-800",
      unit: "bg-cyan-100 text-cyan-800",
      port: "bg-orange-100 text-orange-800",
      master_role: "bg-indigo-100 text-indigo-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const getTypeLabel = (type: string): string => {
    const option = typeOptions.find((opt) => opt.value === type);
    return option ? option.label : type;
  };

  const filteredEntities =
    results?.entities.filter((entity) => {
      const matchesSearch =
        !formData.searchTerm ||
        entity.name.toLowerCase().includes(formData.searchTerm.toLowerCase());
      const matchesType =
        !formData.entityType || entity.type === formData.entityType;
      return matchesSearch && matchesType;
    }) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("navigation.knownEntities")}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {t(
              "known_entities.description",
              "Consulta las entidades conocidas almacenadas en el sistema",
            )}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="searchTerm"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Buscar entidad
              </label>
              <input
                type="text"
                id="searchTerm"
                value={formData.searchTerm}
                onChange={handleSearchChange}
                placeholder="Nombre de la entidad..."
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="entityType"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tipo de entidad
              </label>
              <select
                id="entityType"
                value={formData.entityType}
                onChange={handleTypeChange}
                className="input"
              >
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Consultando...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Buscar Entidades
              </>
            )}
          </button>
        </form>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {filteredEntities.length}
              </div>
              <div className="text-gray-600">Entidades Encontradas</div>
            </div>

            <div className="card text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {new Set(filteredEntities.map((e) => e.type)).size}
              </div>
              <div className="text-gray-600">Tipos Diferentes</div>
            </div>

            <div className="card text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {filteredEntities
                  .reduce((sum, e) => sum + e.count, 0)
                  .toLocaleString()}
              </div>
              <div className="text-gray-600">Total de Referencias</div>
            </div>
          </div>

          {/* Entities Grid */}
          {filteredEntities.length > 0 ? (
            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Entidades ({filteredEntities.length})
                </h3>
                <p className="text-sm text-gray-500 italic">
                  Haz clic en una entidad para ver sus detalles
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                {filteredEntities.map((entity, index) => (
                  <div
                    key={index}
                    onClick={() => fetchEntityDetail(entity.name)}
                    className={`border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                      selectedEntity === entity.name
                        ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">
                          {entity.name}
                        </h4>
                      </div>
                      <div className="text-gray-400">
                        <ChevronRight
                          className={`w-5 h-5 transition-transform ${selectedEntity === entity.name ? "rotate-90 text-blue-500" : ""}`}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Tipo:</span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(entity.type)}`}
                        >
                          {getTypeLabel(entity.type)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                          Referencias:
                        </span>
                        <span className="font-mono text-sm font-semibold text-gray-900">
                          {entity.count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron entidades
              </h3>
              <p className="text-gray-500">
                No hay entidades que coincidan con los criterios de búsqueda.
              </p>
            </div>
          )}

          {/* Entity Details Table */}
          {(isDetailLoading || entityDetail) && (
            <div className="card p-0 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileCode className="w-5 h-5 mr-2 text-blue-600" />
                  {isDetailLoading
                    ? "Cargando detalles..."
                    : `Detalles de ${entityDetail?.name}`}
                </h3>
                {entityDetail && (
                  <button
                    onClick={() => handleExportYaml(entityDetail)}
                    className="btn btn-secondary py-1 px-3 text-sm flex items-center"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar YAML
                  </button>
                )}
              </div>

              {isDetailLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                  <p className="text-gray-500">
                    Recuperando registros de la entidad...
                  </p>
                </div>
              ) : entityDetail && entityDetail.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(entityDetail.data[0]).map((header) => (
                          <th
                            key={header}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {entityDetail.data.map((row, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          {Object.values(row).map((value, vIdx) => (
                            <td
                              key={vIdx}
                              className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                            >
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Mostrando {entityDetail.data.length} registros para la
                      entidad {entityDetail.name}.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    No hay registros detallados disponibles para esta entidad.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Information */}
      <div className="card">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">
              Información importante:
            </p>
            <p>
              Esta vista muestra todas las entidades conocidas que han sido
              ingresadas en el sistema. Puedes buscar por nombre o filtrar por
              tipo de entidad. El número de referencias indica cuántas veces
              aparece cada entidad en los datos procesados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnownEntitiesView;
