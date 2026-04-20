"""
Script de diagnóstico para verificar cargo_list
"""

import json
from pathlib import Path
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, explode
from pyspark.sql.types import ArrayType, StructType, StructField, StringType

# Configuración
DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"

print("\n" + "="*80)
print("DIAGNÓSTICO DE CARGO_LIST")
print("="*80 + "\n")

# Leer configuración
with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

# Crear sesión de Spark
spark = SparkSession.builder \
    .appName("CargoListDiagnostic") \
    .master("local[*]") \
    .config("spark.jars.packages", "io.delta:delta-spark_2.12:3.2.1") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

# Rutas
base_path = config_layer.get("base_path", "/app/delta_test/docker")
project_name = config_layer.get("project_data_name", "portada_project")

possible_paths = [
    f"{base_path}/{project_name}/bronze/original_data/ship_entries",
    f"/app/delta_lake/{project_name}/bronze/original_data/ship_entries",
]

entries_path = None
for path in possible_paths:
    if Path(path).exists():
        entries_path = path
        break

if not entries_path:
    print("ERROR: No se encontró el directorio de entradas")
    exit(1)

print(f"[1/6] Leyendo entradas desde: {entries_path}")
df = spark.read.format("delta").load(entries_path)
print(f"✓ {df.count()} entradas cargadas\n")

# Verificar columnas
print("[2/6] Verificando columnas...")
columns = df.columns
print(f"✓ Total columnas: {len(columns)}")
print(f"✓ Tiene cargo_list: {'cargo_list' in columns}")
print(f"✓ Tiene ship_tons: {'ship_tons' in columns}")
print(f"✓ Tiene travel_duration: {'travel_duration' in columns}\n")

# Verificar ship_tons
if "ship_tons" in columns:
    print("[3/6] Analizando ship_tons...")
    ship_tons_count = df.filter(col("ship_tons").isNotNull()).count()
    print(f"✓ Registros con ship_tons: {ship_tons_count}")
    if ship_tons_count > 0:
        sample = df.filter(col("ship_tons").isNotNull()).select("ship_tons").limit(5).collect()
        print("Ejemplos:")
        for row in sample:
            print(f"  - {row['ship_tons']}")
    print()

# Verificar travel_duration
if "travel_duration" in columns:
    print("[4/6] Analizando travel_duration...")
    duration_count = df.filter(col("travel_duration").isNotNull()).count()
    print(f"✓ Registros con travel_duration: {duration_count}")
    if duration_count > 0:
        sample = df.filter(col("travel_duration").isNotNull()).select("travel_duration").limit(5).collect()
        print("Ejemplos:")
        for row in sample:
            print(f"  - {row['travel_duration']}")
    print()

# Verificar cargo_list
if "cargo_list" in columns:
    print("[5/6] Analizando cargo_list...")
    cargo_count = df.filter(col("cargo_list").isNotNull()).count()
    print(f"✓ Registros con cargo_list: {cargo_count}")
    
    if cargo_count > 0:
        # Mostrar ejemplos
        sample = df.filter(col("cargo_list").isNotNull()).select("cargo_list").limit(3).collect()
        print("\nEjemplos de cargo_list (STRING):")
        for i, row in enumerate(sample, 1):
            cargo_str = str(row['cargo_list'])[:200]
            print(f"  {i}. {cargo_str}...")
        
        # Intentar parsear
        print("\n[6/6] Intentando parsear cargo_list...")
        cargo_schema = ArrayType(StructType([
            StructField("comodity", StringType(), True),
            StructField("unit", StringType(), True),
            StructField("quantity", StringType(), True)
        ]))
        
        try:
            df_parsed = df.withColumn(
                "cargo_list_parsed",
                from_json(col("cargo_list"), cargo_schema)
            )
            
            # Verificar si el parsing funcionó
            parsed_count = df_parsed.filter(col("cargo_list_parsed").isNotNull()).count()
            print(f"✓ Registros parseados exitosamente: {parsed_count}")
            
            if parsed_count > 0:
                # Explotar y contar
                df_exploded = df_parsed.select(explode("cargo_list_parsed").alias("cargo"))
                
                comodity_count = df_exploded.filter(col("cargo.comodity").isNotNull()).count()
                unit_count = df_exploded.filter(col("cargo.unit").isNotNull()).count()
                
                print(f"✓ Comodities extraídas: {comodity_count}")
                print(f"✓ Units extraídas: {unit_count}")
                
                # Mostrar ejemplos
                if comodity_count > 0:
                    print("\nEjemplos de comodity:")
                    samples = df_exploded.filter(col("cargo.comodity").isNotNull()).select("cargo.comodity").limit(5).collect()
                    for row in samples:
                        print(f"  - {row['comodity']}")
                
                if unit_count > 0:
                    print("\nEjemplos de unit:")
                    samples = df_exploded.filter(col("cargo.unit").isNotNull()).select("cargo.unit").limit(5).collect()
                    for row in samples:
                        print(f"  - {row['unit']}")
            else:
                print("⚠ El parsing devolvió NULL para todos los registros")
                print("Esto significa que el formato del JSON no coincide con el schema")
                
        except Exception as e:
            print(f"✗ ERROR al parsear: {str(e)}")

spark.stop()

print("\n" + "="*80)
print("DIAGNÓSTICO COMPLETADO")
print("="*80 + "\n")
