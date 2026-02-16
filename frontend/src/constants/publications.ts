/**
 * Publicaciones y entidades conocidas del sistema PortAda
 */

export interface Publication {
  code: string;
  name: string;
  fullName: string;
}

export interface KnownEntity {
  code: string;
  name: string;
  description: string;
}

export const PUBLICATIONS: Publication[] = [
  { code: 'db', name: 'DB', fullName: 'Diario de Barcelona' },
  { code: 'dm', name: 'DM', fullName: 'Diario de la Marina' },
  { code: 'sm', name: 'SM', fullName: 'Le Semaphore de Marseille' },
  { code: 'gm', name: 'GM', fullName: 'Gaceta Mercantil' },
  { code: 'bp', name: 'BP', fullName: 'British Packet' },
  { code: 'en', name: 'EN', fullName: 'El Nacional' },
  { code: 'lp', name: 'LP', fullName: 'La Prensa' },
];

export const KNOWN_ENTITIES: KnownEntity[] = [
  { code: 'flag', name: 'Banderas', description: 'Banderas' },
  { code: 'ship_tons', name: 'Tonelajes', description: 'Tonelajes de barcos' },
  { code: 'travel_duration', name: 'Duración de viaje', description: 'Duración de viaje entre puertos' },
  { code: 'comodity', name: 'Mercancías', description: 'Tipos de mercancías' },
  { code: 'ship_type', name: 'Tipos de barcos', description: 'Clasificación de embarcaciones' },
  { code: 'unit', name: 'Unidades de medida', description: 'Unidades de medida utilizadas' },
  { code: 'port', name: 'Puertos', description: 'Puertos marítimos' },
  { code: 'master_role', name: 'Roles de maestro', description: 'Roles y funciones de maestros' },
];

/**
 * Obtiene una publicación por su código
 */
export const getPublicationByCode = (code: string): Publication | undefined => {
  return PUBLICATIONS.find(p => p.code.toLowerCase() === code.toLowerCase());
};

/**
 * Obtiene una entidad conocida por su código
 */
export const getKnownEntityByCode = (code: string): KnownEntity | undefined => {
  return KNOWN_ENTITIES.find(e => e.code.toLowerCase() === code.toLowerCase());
};
