
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
                       .agg(F.count("*").alias("t")) \
                       .orderBy("y", "m", "d", "publication_edition")
        
        # 4. Convertir a JSON
        resultados = df_counter.collect()
        
        return [row.asDict() for row in resultados]

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
        if os.path.exists(entities_path):
            for item in os.listdir(entities_path):
                if item == "ship_entries" or item == "original_files":
                    continue
                    
                path = os.path.join(entities_path, item)
                if os.path.isdir(path):
                    # Contar archivos
                    count = 0
                    for _, _, files in os.walk(path):
                        count += len([f for f in files if f.endswith('.json') or f.endswith('.yaml') or f.endswith('.parquet')])
                    
                    entities.append({"type": item, "count": count})
        
        return entities
    
    def get_entity_data(self, entity_type: str):
        """
        Obtiene los datos de un tipo de entidad específico
        Según ejemplos.py: df = entities_layer.read_raw_entities(entity=entity_type)
        """
        if not self.entities_layer:
            raise Exception("Entities layer not available")
            
        df = self.entities_layer.read_raw_entities(entity=entity_type)
        
        # Cantidad de ese tipo
        cantidad = df.select(F.count("*")).collect()[0][0]
        
        # Lista de valores
        lista_valores = df.collect()
        
        return {
            "type": entity_type,
            "count": cantidad,
            "data": [row.asDict() for row in lista_valores]
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
        
        # Devolver todas las columnas
        return [row.asDict() for row in df.collect()]

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

        return [row.asDict() for row in df.collect()]

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

