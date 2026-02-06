# Documentación API PortAda (Backend)

Esta documentación describe la API RESTful desarrollada para el proyecto PortAda. La API permite la gestión de ingesta de datos, consultas al _Delta Lake_ y auditoría de metadatos mediante una arquitectura contenerizada.

---

## 🏗 Arquitectura e Infraestructura

El backend está diseñado como un microservicio independiente encapsulado en Docker.

- **Lenguaje/Framework**: Python 3.12 (FastAPI).
- **Motor de Datos**: PySpark 3.5.3 + Delta Lake 3.2.1.

* **Gestión de Metadatos/Estado**: Redis 7.

- **Librería Core**: `py-portada-data-layer` (Capa de abstracción sobre Delta Lake).
- **Despliegue**: Docker Compose.

### Ubicación del Proyecto

El código reside en la carpeta `portada_backend/`.

### Cómo Ejecutar

Para levantar la API, base de datos y conectar los volúmenes de datos:

```bash
cd portada_backend
docker-compose up --build
```

La API estará disponible en **`http://localhost:8000`**.
La documentación interactiva (Swagger UI) se encuentra en **`http://localhost:8000/docs`**.

---

## 🔐 Autenticación y Seguridad

La API utiliza un mecanismo simple basado en API Key para identificar a los usuarios en operaciones de escritura (subida de archivos).

- **Consultas (GET)**: Son públicas y no requieren autenticación.
- **Ingesta (POST)**: Requieren el header `x-api-key`.
  - **Header**: `x-api-key: <nombre_de_usuario>`
  - **Comportamiento**:
    - Si el usuario no existe en PostgreSQL, **se crea automáticamente** al primer intento (Auto-SignUp).
    - Si existe, se asocia la subida a su ID.

---

## 📂 Endpoints de Ingesta (Uploads)

Permiten a los usuarios subir ficheros de datos crudos o definiciones de entidades. Los archivos se guardan en el Delta Lake (`ingest/`) y se registran en Redis.

### 1. Subir Datos de Entrada (Ship Entries)

Carga archivos JSON con información de barcos para un usuario específico. **Soporta carga múltiple (hasta 20 archivos)**.

- **Ruta**: `POST /api/v1/ingest/entry`
- **Headers**: `x-api-key: jcanell4` (ejemplo de username)
- **Body (Form-Data)**: `files` (Múltiples archivos .json)
- **Destino en disco**: `delta_lake/ingest/ship_entries/<username>/<filename>.json`
- **Respuesta**:
  ```json
  {
    "message": "Entries uploaded successfully",
    "file_ids": ["uuid-1", "uuid-2"],
    "count": 2
  }
  ```

### 2. Subir Entidades Conocidas

Carga archivos YAML o JSON con definiciones de entidades maestras (ej. tipos de barco, capitanes).

- **Ruta**: `POST /api/v1/ingest/entity`
- **Headers**: `x-api-key: jcanell4`
- **Query Params**: `type` (ej. `ship_type`, `captain`)
- **Body (Form-Data)**: `file` (archivo .yaml/.json)
- **Destino en disco**: `delta_lake/ingest/entity/<type>/<filename>.yaml`

---

## 📊 Endpoints de Consulta (Queries)

Consultas analíticas directamente contra el Delta Lake. Usan `portada_data_layer` por debajo.

### 3. Detección de Fechas Faltantes (Gaps)

Identifica discontinuidades en las publicaciones de periódicos.

- **Ruta**: `GET /api/v1/queries/gaps`
- **Parámetros**:
  - `publication` (Requerido): Código del periódico (ej. `db`, `sm`).
  - `start_date` (Opcional): Fecha inicio `YYYY-MM-DD`.
  - `end_date` (Opcional): Fecha fin `YYYY-MM-DD`.
- **Ruta Alternativa (Por Archivo)**: `POST /api/v1/queries/gaps/file`
  - Sube un archivo de texto/lista con fechas específicas a comprobar.

### 4. Volumen de Entradas

Cuenta cuántos barcos hay registrados agrupados jerárquicamente.

- **Ruta**: `GET /api/v1/queries/entries/count`
- **Parámetros**: `publication`, `start_date`, `end_date`.
- **Respuesta**: Lista de objetos agrupados por Año -> Mes -> Día -> Edición.

### 5. Catálogo de Entidades

Lista qué tipos de entidades auxiliares existen en el sistema.

- **Ruta**: `GET /api/v1/queries/entities`
- **Respuesta**: Lista con el tipo de entidad y cantidad de recursos (archivos) encontrados.

---

## 🛡 Endpoints de Auditoría (Audit)

Herramientas para administradores para trazar la calidad y procesos del dato.

### 6. Metadatos de Duplicados

Consulta los logs de detección de duplicados durante la ingesta.

- **Ruta**: `GET /api/v1/audit/duplicates/metadata`
- **Parámetros**: `publication`, `user`, `start_date`, `end_date`.
- **Respuesta (Maestro)**: Lista de eventos de duplicidad encontrados.
- **Detalle**: `GET /api/v1/audit/duplicates/records/{log_id}` devuelve los registros específicos implicados.

### 7. Auditoría de Almacenamiento

Historial de cambios en las tablas del Delta Lake.

- **Ruta**: `GET /api/v1/audit/storage`
- **Parámetros**: `table_name`, `process`. Por defecto filtra `stage=0` (éxito).
- **Detalle (Lineage)**: `GET /api/v1/audit/storage/{log_id}/lineage` muestra qué columnas y transformaciones ocurrieron.

### 8. Auditoría de Procesos

Log general de ejecución de procesos ETL.

- **Ruta**: `GET /api/v1/audit/process`
- **Parámetros**: `process` (nombre del proceso). Filtra `stage=0`.

---

## 🛠 Configuración Técnica

El backend espera encontrar y montar los siguientes volúmenes (definidos en `docker-compose.yml`):

1.  **Datos (Delta Lake)**: Mapeado a `/app/delta_lake`. Los uploads se guardan directamente aquí (`ingest/`).
2.  **Configuración**: Mapeado a `/app/config/delta_data_layer_config.json`.

### Base de Datos

Utiliza **Redis** (imagen `redis:7-alpine`) para gestión de usuarios, control de API Keys y registro de metadatos de archivos subidos.
