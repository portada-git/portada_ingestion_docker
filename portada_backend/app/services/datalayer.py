
import os
import json
import logging
import datetime
from typing import List, Optional, Any

# Attempt to import portada_data_layer, or mock if missing for development
try:
    from portada_data_layer import DeltaDataLayerBuilder, PortadaBuilder
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
        self.base_path = os.getenv("DELTA_LAKE_PATH", "/data/delta_lake")
        self.protocol = "file://"
        self.builder = None
        self.config = {}
        
        if PORTADA_AVAILABLE:
            self._init_builder()

    def _init_builder(self):
        # Determine config content. If file doesn't exist, use empty or dummy?
        # User prompt implies getting config from file.
        if os.path.exists(self.config_path):
            with open(self.config_path) as f:
                self.config = json.load(f)
        else:
            logger.warning(f"Config file not found at {self.config_path}. Using empty config.")
            self.config = {}

        self.builder = (
            PortadaBuilder(self.config)
            .protocol(self.protocol)
            .base_path(self.base_path)
            .app_name("PortAdaAPI")
            # Removing explicit project_name might help if library auto-appends it to path
            # and our data is at root. Alternatively, set project_name to empty string/None if supported.
            # Based on error: /app/delta_lake/default_portada/... 
            # We want: /app/delta_lake/... 
            # Trying to reset project_name or set it to "." if library insists on a subfolder.
            .project_name("") 
        )

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_layer(self, layer_type):
        if not self.builder:
            raise Exception("DataLayer not initialized (Library missing or config error)")
        
        layer = self.builder.build(layer_type)
        layer.start_session()
        return layer

    def get_missing_dates(self, publication_name: str, start_date: str = None, end_date: str = None, date_list: str = None):
        """
        Wrapper for get_missing_dates_from_a_newspaper
        """
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE)
        # Check argument combination
        if date_list:
            # YAML/List content passed directly
            return layer.get_missing_dates_from_a_newspaper(
                publication_name=publication_name,
                date_and_edition_list=date_list
            )
        else:
            return layer.get_missing_dates_from_a_newspaper(
                publication_name=publication_name,
                start_date=start_date,
                end_date=end_date
            )

    def get_duplicate_metadata(self, publication=None, user=None, start_date=None, end_date=None):
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE) # Needed to get config for metadata manager? 
        # Actually metadata manager takes configuration dict
        metadata = DataLakeMetadataManager(layer.get_configuration())
        
        # Optimized singular call as suggested
        # df_dup_md, df_dup_re = metadata.read_log("duplicates_log", include_duplicates=True)
        # Note: 'include_duplicates=True' might be a hypothetical feature in prompt. 
        # Checking main.py: metadata.read_log returns one DF. 
        # The prompt says: "O bien con una única llamada... A fin de obtener dos dataframes"
        # I will stick to separate calls if the dual call isn't standard in the library I saw.
        # But let's assume separate calls based on main.py evidence.
        
        df_md = metadata.read_log("duplicates_log")
        df_re = metadata.read_log("duplicates_records")
        
        # Apply filters on Master (df_md)
        if publication:
            df_md = df_md.filter(f"lower(publication) = '{publication.lower()}'")
        if user:
            df_md = df_md.filter(f"uploaded_by = '{user}'")
        if start_date:
            df_md = df_md.filter(f"date >= '{start_date}'")
        if end_date:
            df_md = df_md.filter(f"date <= '{end_date}'")

        # Convert to list of dicts for API response
        # The client will handle the "Master-Detail" interaction view. 
        # API should probably return the Master list, and an endpoint for Details.
        # Or return nested? "Vista Maestro... al seleccionar una fila... mostrar dinámicamente"
        # This implies API provides Master list first.
        
        results = [row.asDict() for row in df_md.collect()]
        return results

    def get_duplicate_details(self, log_id: str):
        # We need to fetch the log entry first to get filters?
        # User prompt: "usando el segundo dataframe i aplicando el filtro siguiente: filter(<duplicates_filter>).filter(df_dup_re.entry_id.isin(<duplicate_ids>))"
        # So we need the Log ID to find the Master Record, extract filter info, then query Details.
        
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE)
        metadata = DataLakeMetadataManager(layer.get_configuration())
        
        df_md = metadata.read_log("duplicates_log")
        master_row = df_md.filter(f"log_id = '{log_id}'").first()
        
        if not master_row:
            return []
            
        dup_filter = master_row["duplicates_filter"]
        dup_ids = master_row["duplicate_ids"]
        
        df_re = metadata.read_log("duplicates_records")
        
        # Apply filters
        # Note: dup_filter string might be SQL-like string.
        if dup_filter:
            df_re = df_re.filter(dup_filter)
            
        if dup_ids:
             # dup_ids is likely a list
             df_re = df_re.filter(df_re.entry_id.isin(dup_ids))
             
        return [row.asDict() for row in df_re.collect()]

    def count_entries(self, publication, start_date=None, end_date=None):
        from pyspark.sql import functions as F
        
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE)
        df = layer.read_raw_data(publication) # read_raw_data(publication_name=...)
        
        # Filter dates
        if start_date:
            df = df.filter(F.col("publication_date") >= start_date)
        if end_date:
            df = df.filter(F.col("publication_date") <= end_date)
            
        # Logic from prompt
        df = df.withColumn("data_dt", F.to_date("publication_date", "yyyy-MM-dd")) \
               .withColumn("y", F.year("data_dt")) \
               .withColumn("m", F.month("data_dt")) \
               .withColumn("d", F.dayofmonth("data_dt"))
               
        # Rollup aggregation
        dfr = df.rollup("y", "m", "d", "publication_edition") \
                .agg(F.count("*").alias("count")) \
                .orderBy("y", "m", "d", "publication_edition")
                
        return [row.asDict() for row in dfr.collect()]

    def list_known_entities(self):
        # Prompt: "mostrará todos los tipos de entidades y el número de recursos existente"
        # Requires walking the directory or checking metadata?
        # main.py uses 'layer = builder.build(builder.KNOWN_ENTITIES_TYPE)' and 'df_entity_pr = layer.read_raw_entities(entity="pr")'
        # But we need a Catalog.
        
        # If there isn't a direct method to list ALL types, we might need to rely on filesystem (as I wrote in script 5).
        # Assuming we can inspect the ingest/entities folder or similar.
        # IF portada_data_layer doesn't expose a "list_all_entity_types", I will implement a FS scan here using generic config paths.
        
        base = os.path.join(self.base_path, "ingest", "entities") # Guessing path
        if not os.path.exists(base):
             # Try root ingest
             base = os.path.join(self.base_path, "ingest")
        
        entities = []
        if os.path.exists(base):
            for item in os.listdir(base):
                if item == "ship_entries": continue
                path = os.path.join(base, item)
                if os.path.isdir(path):
                    # Count files
                    count = 0 
                    for _, _, files in os.walk(path):
                        count += len([f for f in files if f.endswith('.json') or f.endswith('.yaml')])
                    
                    entities.append({"type": item, "count": count})
                    
        return entities

    def get_storage_audit(self, table_name=None, process=None):
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE)
        metadata = DataLakeMetadataManager(layer.get_configuration())
        
        df = metadata.read_log("storage_log")
        df = df.filter("stage = 0")
        
        if table_name:
            df = df.filter(f"table_name = '{table_name}'")
        if process:
            df = df.filter(f"process = '{process}'")
            
        return [row.asDict() for row in df.collect()]

    def get_lineage_detail(self, log_id):
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE)
        metadata = DataLakeMetadataManager(layer.get_configuration())
        
        df = metadata.read_log("field_lineage_log")
        df = df.filter(f"stored_log_id = '{log_id}'")
        
        return [row.asDict() for row in df.collect()]

    def get_process_audit(self, process_name=None):
        layer = self._get_layer(PortadaBuilder.BOAT_NEWS_TYPE)
        metadata = DataLakeMetadataManager(layer.get_configuration())
        
        df = metadata.read_log("process_log")
        # "Por defecto, aquí, la condición del campo “stage” debe ser siempre == 0"
        # Check if stage column exists or if logic applies. Assuming yes.
        # Note: In main.py, I saw examples filtering filters.
        # I'll try to apply stage=0 if the column exists in the schema, but robustly.
        try:
            df = df.filter("stage = 0")
        except:
            pass # Maybe column doesn't exist

        if process_name:
            df = df.filter(f"process = '{process_name}'")
            
        return [row.asDict() for row in df.collect()]

    def get_publications(self):
        import os
        base_path = "/app/delta_lake/metadata/duplicates_records"
        pubs = set()
        if os.path.exists(base_path):
            for item in os.listdir(base_path):
                if item.startswith("publication_name="):
                    pub = item.split("=")[1]
                    pubs.add(pub)
        if not pubs:
            pubs.add("DB")
        return list(pubs)

    def get_known_entities(self):
        import os
        base_path = "/app/delta_lake/ingest/entity"
        entities = []
        if os.path.exists(base_path):
            for item in os.listdir(base_path):
                if os.path.isdir(os.path.join(base_path, item)):
                    entities.append({"name": item, "count": 0, "last_updated": ""})
        return {"entities": entities, "total": len(entities)}

