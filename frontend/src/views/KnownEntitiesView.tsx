/**
 * Known Entities Analysis View
 * Implements Requirements 11.1-11.3: Query known entities
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  AlertCircle,
  Loader2,
  Download,
  ChevronRight,
  FileCode,
} from "lucide-react";
import { apiService } from "../services/api";
import { withErrorHandling } from "../utils/apiErrorHandler";
import { KnownEntityDetailResponse } from "../types";
import { KNOWN_ENTITIES } from "../constants/publications";
import jsYaml from "js-yaml";

const KnownEntitiesView: React.FC = () => {
  const { t } = useTranslation();
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [entityDetail, setEntityDetail] =
    useState<KnownEntityDetailResponse | null>(null);
  const [entityCounts, setEntityCounts] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    searchTerm: "",
    entityType: "",
  });

  // Usar las 6 entidades predefinidas
  const allEntities = KNOWN_ENTITIES.map((entity) => ({
    name: entity.code,
    type: entity.code,
    count: entityCounts[entity.code] || 0,
  }));

  const typeOptions = [
    { value: "", label: t("known_entities.allTypes", "Todos los tipos") },
    ...KNOWN_ENTITIES.map((entity) => ({
      value: entity.code,
      label: t(`ingestion.entity_${entity.code}`, entity.name),
    })),
  ];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, searchTerm: e.target.value }));
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, entityType: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // No hacer nada, solo filtrar localmente
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
      // Actualizar el count real
      setEntityCounts((prev) => ({
        ...prev,
        [name]: result.total_records || 0,
      }));
    }

    setIsDetailLoading(false);
  };

  const handleExportYaml = (entity: KnownEntityDetailResponse) => {
    try {
      // Crear estructura: tipo: { caracteristica: [voz1, voz2, ...], ... }
      const characteristics: Record<string, string[]> = {};

      entity.data.forEach((row) => {
        const name = row.name;
        const voices = row.voices || [];
        characteristics[name] = voices;
      });

      // Crear objeto con el tipo como clave y las características como valor
      const yamlObject = {
        [entity.name]: characteristics,
      };

      const yamlContent = jsYaml.dump(yamlObject);
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

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      flag: "bg-blue-100 text-blue-800",
      ship_tons: "bg-blue-200 text-blue-800",
      travel_duration: "bg-yellow-100 text-yellow-800",
      comodity: "bg-green-100 text-green-800",
      ship_type: "bg-purple-100 text-purple-800",
      unit: "bg-cyan-100 text-cyan-800",
      port: "bg-orange-100 text-orange-800",
      master_role: "bg-indigo-100 text-indigo-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const getTypeLabel = (type: string): string => {
    return t(`ingestion.entity_${type}`, type);
  };

  const filteredEntities = allEntities.filter((entity) => {
    const matchesSearch =
      !formData.searchTerm ||
      entity.name.toLowerCase().includes(formData.searchTerm.toLowerCase());
    const matchesType =
      !formData.entityType || entity.type === formData.entityType;
    return matchesSearch && matchesType;
  });

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
                {t("known_entities.searchLabel", "Buscar entidad")}
              </label>
              <input
                type="text"
                id="searchTerm"
                value={formData.searchTerm}
                onChange={handleSearchChange}
                placeholder={t(
                  "known_entities.searchPlaceholder",
                  "Nombre de la entidad...",
                )}
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="entityType"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                {t("known_entities.typeLabel", "Tipo de entidad")}
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
        </form>
      </div>

      {/* Results */}
      <div className="space-y-6">
        {/* Entities Grid */}
        {filteredEntities.length > 0 ? (
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                {t("known_entities.resultsTitle", {
                  count: filteredEntities.length,
                  defaultValue: `Entidades (${filteredEntities.length})`,
                })}
              </h3>
              <p className="text-sm text-gray-500 italic">
                {t(
                  "known_entities.clickToSeeDetails",
                  "Haz clic en una entidad para ver sus detalles",
                )}
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
                        {getTypeLabel(entity.name)}
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
                      <span className="text-sm text-gray-500">
                        {t("known_entities.type", "Tipo")}:
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(entity.type)}`}
                      >
                        {entity.type}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {t("known_entities.records", "Registros")}:
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
              {t(
                "known_entities.noEntitiesFound",
                "No se encontraron entidades",
              )}
            </h3>
            <p className="text-gray-500">
              {t(
                "known_entities.noEntitiesDesc",
                "No hay entidades que coincidan con los criterios de búsqueda.",
              )}
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
                  ? t("known_entities.loadingDetails", "Cargando detalles...")
                  : t("known_entities.detailsOf", {
                      name: getTypeLabel(entityDetail?.name || ""),
                      defaultValue: `Detalles de ${getTypeLabel(entityDetail?.name || "")}`,
                    })}
              </h3>
              {entityDetail && (
                <button
                  onClick={() => handleExportYaml(entityDetail)}
                  className="btn btn-secondary py-1 px-3 text-sm flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t("known_entities.exportYaml", "Exportar YAML")}
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
                    {t("known_entities.showingRecords", {
                      count: entityDetail.data.length,
                      name: getTypeLabel(entityDetail.name),
                      defaultValue: `Mostrando ${entityDetail.data.length} registros para la entidad ${getTypeLabel(entityDetail.name)}.`,
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  {t(
                    "known_entities.noDetailsAvailable",
                    "No hay registros detallados disponibles para esta entidad.",
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Information */}
      <div className="card">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">
              {t("known_entities.importantInfo", "Información importante:")}
            </p>
            <p>
              {t(
                "known_entities.infoDescription",
                "Esta vista muestra todas las entidades conocidas que han sido ingresadas en el sistema. Puedes buscar por nombre o filtrar por tipo de entidad. El número de referencias indica cuántas veces aparece cada entidad en los datos procesados.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnownEntitiesView;
