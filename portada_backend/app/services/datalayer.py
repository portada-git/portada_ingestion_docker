
import os
import json
import logging
from typing import List, Optional, Any
from pyspark.sql import functions as F

# Attempt to import portada_data_layer, or mock if missing for development
try:
    from portada_data_layer import PortadaBuilder
    from portada_data_layer.data_lake_metadata_manager import DataLakeMetadataManager
    PORTADA_AVAILABLE = True
except ImportError:
    PORTADA_AVAILABLE = False
    print("WARNING: portada_data_layer not found. API will fail on data queries.")

logger = logging.getLogger(__name__)

class DataLayerService:
    _instance = None
    
    def __init__(self):
        self.config_path = os.getenv("CONFIG_PATH", "/data/config/delta_data_layer_config.json")
        
        # Configuracion general
        self.data_layer_builder = None
        self.boat_layer = None
        self.entities_layer = None
        self.metadata_layer = None
        self.config = {}
        
        if PORTADA_AVAILABLE:
            self._init_layers()

    def _init_layers(self):
        """Inicializa todas las capas al arrancar la API"""
        if os.path.exists(self.config_path):
            with open(self.config_path) as f:
                self.config = json.load(f)
        else:
            logger.warning(f"Config file not found at {self.config_path}. Using empty config.")
            self.config = {}

        # Configuracion general - usar el builder directamente con la config
        self.data_layer_builder = PortadaBuilder(self.config)
        
        # Build layers
        self.boat_layer = self.data_layer_builder.build(PortadaBuilder.BOAT_NEWS_TYPE)
        self.entities_layer = self.data_layer_builder.build(PortadaBuilder.KNOWN_ENTITIES_TYPE)
        
        # Start sessions
        self.boat_layer.start_session()
        self.entities_layer.start_session()
        
        # Metadata layer
        self.metadata_layer = DataLakeMetadataManager(self.boat_layer.get_configuration())
        
        logger.info("Data layers initialized successfully")

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_missing_dates(self, publication_name: str, start_date: str = None, end_date: str = None, date_list: str = None):
        """
        Fechas faltantes - tres variantes:
        1. Por publicacion + rango de fechas
        2. Por publicacion + archivo YAML
        3. Solo publicacion (todas las fechas faltantes)
        """
        if date_list:
            # Con archivo YAML
            result = self.boat_layer.get_missing_dates_from_a_newspaper(
                publication_name=publication_name,
                date_and_edition_list=date_list
            )
        else:
            # Con filtros de fecha o sin filtros
            result = self.boat_layer.get_missing_dates_from_a_newspaper(
                publication_name=publication_name,
                start_date=start_date,
                end_date=end_date
            )
        
        # Devolver lista de strings
        return result

    def get_duplicate_metadata(self, publication=None, user=None, start_date=None, end_date=None):
        """
        Para obtener todos los duplicados a nivel general: 
        date, edition, duplicates (cantidad), publication, timestamp, duplicates_filter
        """
        df_dup = self.metadata_layer.read_log("duplicates_log")
        
        # Aplicar filtros
        if publication:
            df_dup = df_dup.filter(F.lower(F.col("publication")) == publication.lower())
        if user:
            df_dup = df_dup.filter(F.col("uploaded_by") == user)
        if start_date:
            df_dup = df_dup.filter(F.col("date") >= start_date)
        if end_date:
            df_dup = df_dup.filter(F.col("date") <= end_date)
        
        # Seleccionar campos incluyendo duplicates_filter para el detalle
        results = df_dup.select(
            "date", "edition", "duplicates", "publication", "timestamp", "duplicates_filter"
        ).collect()
        
        return [row.asDict() for row in results]

    def get_duplicate_details(self, duplicates_filter: str):
        """
        Para obtener los detalles de cada duplicado:
        1. Leer duplicates_records
        2. Aplicar duplicates_filter
        3. Seleccionar solo parsed_text
        """
        # 1. Leer registros de duplicados
        df_duplicates = self.metadata_layer.read_log("duplicates_records")
        
        # 2. Aplicar duplicates_filter
        df_duplicates = df_duplicates.filter(duplicates_filter)
        
        # 3. Seleccionar solo parsed_text y convertir a lista
        results = df_duplicates.select(df_duplicates.parsed_text).collect()
        
        return [row.asDict() for row in results]

    def count_entries(self, publication, start_date=None, end_date=None):
        """
        Cantidad de entradas por año, mes, dia y edicion
        Devuelve estructura jerárquica: años -> meses -> días
        """
        # 1. Leer datos
        df = self.boat_layer.read_raw_data(publication)
        
        # Filtrar por fechas si se proporcionan
        if start_date:
            df = df.filter(F.col("publication_date") >= start_date)
        if end_date:
            df = df.filter(F.col("publication_date") <= end_date)
        
        # 2. Preparar columnas de fecha
        df = df.withColumn("data_dt", F.to_date("publication_date", "yyyy-MM-dd")) \
               .withColumn("y", F.year("data_dt")) \
               .withColumn("m", F.month("data_dt")) \
               .withColumn("d", F.dayofmonth("data_dt"))
        
        # 3. Calcular totales y subtotales
        df_counter = df.rollup("y", "m", "d", "publication_edition") \
                       .agg(F.count("*").alias("count")) \
                       .orderBy("y", "m", "d", "publication_edition")
        
        # 4. Convertir a JSON y organizar jerárquicamente
        resultados = df_counter.collect()
        
        # Estructura jerárquica
        years = {}
        total = 0
        
        for row in resultados:
            if row.y is None:
                # Total general
                total = row['count']
            elif row.m is None:
                # Total por año
                year = row.y
                if year not in years:
                    years[year] = {
                        'year': year,
                        'count': row['count'],
                        'months': {}
                    }
            elif row.d is None:
                # Total por mes
                year = row.y
                month = row.m
                if year not in years:
                    years[year] = {'year': year, 'count': 0, 'months': {}}
                if month not in years[year]['months']:
                    years[year]['months'][month] = {
                        'month': month,
                        'count': row['count'],
                        'days': {}
                    }
            elif row.publication_edition is None:
                # Total por día
                year = row.y
                month = row.m
                day = row.d
                if year not in years:
                    years[year] = {'year': year, 'count': 0, 'months': {}}
                if month not in years[year]['months']:
                    years[year]['months'][month] = {'month': month, 'count': 0, 'days': {}}
                if day not in years[year]['months'][month]['days']:
                    years[year]['months'][month]['days'][day] = {
                        'day': day,
                        'count': row['count'],
                        'editions': []
                    }
            else:
                # Por edición
                year = row.y
                month = row.m
                day = row.d
                edition = row.publication_edition
                if year not in years:
                    years[year] = {'year': year, 'count': 0, 'months': {}}
                if month not in years[year]['months']:
                    years[year]['months'][month] = {'month': month, 'count': 0, 'days': {}}
                if day not in years[year]['months'][month]['days']:
                    years[year]['months'][month]['days'][day] = {'day': day, 'count': 0, 'editions': []}
                years[year]['months'][month]['days'][day]['editions'].append({
                    'edition': edition,
                    'count': row['count']
                })
        
        # Convertir diccionarios a listas
        result = {
            'total': total,
            'years': []
        }
        
        for year_key in sorted(years.keys()):
            year_data = years[year_key]
            months_list = []
            for month_key in sorted(year_data['months'].keys()):
                month_data = year_data['months'][month_key]
                days_list = []
                for day_key in sorted(month_data['days'].keys()):
                    day_data = month_data['days'][day_key]
                    days_list.append(day_data)
                month_data['days'] = days_list
                months_list.append(month_data)
            year_data['months'] = months_list
            result['years'].append(year_data)
        
        return result

    def list_known_entities(self):
        """
        Lista todos los tipos de entidades y el número de recursos existente
        Escanea el filesystem para encontrar tipos de entidades
        """
        # Obtener base_path de la configuración
        config = self.boat_layer.get_configuration()
        base_path = config["_base_path"]
        project_name = config["_project_data_name"]
        
        # Buscar en la estructura de entidades
        entities_path = os.path.join(base_path, project_name, "ingest", "known_entities")
        
        entities = []
        entity_types = set()
        
        if os.path.exists(entities_path):
            for item in os.listdir(entities_path):
                if item == "ship_entries" or item == "original_files":
                    continue
                    
                path = os.path.join(entities_path, item)
                if os.path.isdir(path):
                    entity_types.add(item)
                    # Contar archivos
                    count = 0
                    for _, _, files in os.walk(path):
                        count += len([f for f in files if f.endswith('.json') or f.endswith('.yaml') or f.endswith('.parquet')])
                    
                    entities.append({
                        "name": item,
                        "type": item,
                        "count": count
                    })
        
        return {
            "entities": entities,
            "total_entities": len(entities),
            "entity_types": list(entity_types)
        }
    
    def get_entity_data(self, entity_type: str):
        """
        Obtiene los datos de un tipo de entidad específico
        Según la librería: df = entities_layer.read_raw_entities(entity=entity_type)
        """
        if not self.entities_layer:
            raise Exception("Entities layer not available")
        
        try:
            df = self.entities_layer.read_raw_entities(entity=entity_type)
            
            if df is None:
                # No hay datos para este tipo de entidad
                return {
                    "name": entity_type,
                    "type": entity_type,
                    "data": [],
                    "total_records": 0
                }
            
            # Cantidad de ese tipo
            cantidad = df.select(F.count("*")).collect()[0][0]
            
            # Lista de valores
            lista_valores = df.collect()
            
            return {
                "name": entity_type,
                "type": entity_type,
                "data": [row.asDict() for row in lista_valores],
                "total_records": cantidad
            }
        except Exception as e:
            logger.error(f"Error reading entity data for {entity_type}: {str(e)}")
            # Si hay error, devolver estructura vacía
            return {
                "name": entity_type,
                "type": entity_type,
                "data": [],
                "total_records": 0
            }

    def get_storage_audit(self, table_name=None, process=None):
        """
        Metadatos de almacenaje - proceso de ingestión de datos
        """
        df = self.metadata_layer.read_log("storage_log")
        
        # Filtrar por stage = 0 (exitosos)
        df = df.filter(F.col("stage") == 0)
        
        # Aplicar filtros adicionales
        if table_name:
            df = df.filter(F.col("table_name") == table_name)
        if process:
            df = df.filter(F.col("process") == process)
        
        # Convertir a lista de diccionarios y mapear campos al formato esperado por el frontend
        results = []
        for row in df.collect():
            row_dict = row.asDict()
            # Mapear campos al formato esperado por el frontend
            mapped_row = {
                "log_id": row_dict.get("log_id", ""),
                "publication_name": row_dict.get("publication_name"),
                "table_name": row_dict.get("table_name", ""),
                "process_name": row_dict.get("process", ""),
                "stage": row_dict.get("stage", 0),
                "records_stored": row_dict.get("num_records", 0),
                "storage_path": row_dict.get("target_path", ""),
                "created_at": row_dict.get("timestamp", ""),
                "metadata": {
                    "format": "delta",
                    "compression": "snappy",
                    "schema_version": "1.0",
                    "partition_columns": []
                }
            }
            results.append(mapped_row)
        
        return results

    def get_lineage_detail(self, log_id):
        """
        Detalle de lineage para un log específico
        """
        df = self.metadata_layer.read_log("field_lineage_log")
        df = df.filter(F.col("stored_log_id") == log_id)
        
        return [row.asDict() for row in df.collect()]

    def get_process_audit(self, process_name=None):
        """
        Auditoría de procesos - stage debe ser siempre == 0
        """
        df = self.metadata_layer.read_log("process_log")

        # Filtrar por stage = 0
        df = df.filter(F.col("stage") == 0)

        if process_name:
            df = df.filter(F.col("process") == process_name)

        # Convertir a lista de diccionarios y mapear campos al formato esperado por el frontend
        results = []
        for row in df.collect():
            row_dict = row.asDict()
            # Incluir todos los campos originales más los campos mapeados para el frontend
            mapped_row = {
                # Campos mapeados para compatibilidad con el frontend
                "process_log_id": row_dict.get("log_id", ""),
                "publication_name": row_dict.get("publication_name", "N/A"),
                "status": row_dict.get("status", "UNKNOWN"),
                "records_processed": row_dict.get("num_records", 0),
                "processed_at": row_dict.get("timestamp", ""),
                # Todos los campos originales
                "log_id": row_dict.get("log_id", ""),
                "timestamp": row_dict.get("timestamp", ""),
                "stage": row_dict.get("stage", 0),
                "description": row_dict.get("description", ""),
                "start_time": row_dict.get("start_time", ""),
                "end_time": row_dict.get("end_time", ""),
                "duration": row_dict.get("duration", 0),
                "num_records": row_dict.get("num_records", 0),
                "extra_info": row_dict.get("extra_info", {}),
                "process": row_dict.get("process", "")
            }
            results.append(mapped_row)
        
        return results

    def get_publications(self):
        """
        Lista de publicaciones disponibles - escanea el filesystem
        """
        # Obtener base_path de la configuración
        config = self.boat_layer.get_configuration()
        base_path = config["_base_path"]
        project_name = config["_project_data_name"]
        
        # Buscar en la estructura de ship_entries
        ship_entries_path = os.path.join(base_path, project_name, "ingest", "ship_entries")
        pubs = set()
        
        if os.path.exists(ship_entries_path):
            for item in os.listdir(ship_entries_path):
                item_path = os.path.join(ship_entries_path, item)
                if os.path.isdir(item_path):
                    pubs.add(item.upper())
        
        if not pubs:
            pubs.add("DB")
        
        return list(pubs)

