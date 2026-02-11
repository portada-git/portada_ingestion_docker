# Esquema de Status del Sistema

## 📊 Definición de Status

El sistema utiliza un esquema simple de 3 estados para los archivos de ingestión:

| Status | Valor | Descripción | Color | Icono |
|--------|-------|-------------|-------|-------|
| **En Cola** | `0` | Archivo subido, esperando procesamiento | Amarillo | 🕐 Clock |
| **Procesado** | `1` | Archivo procesado exitosamente | Verde | ✓ CheckCircle |
| **Error** | `2` | Error durante el procesamiento | Rojo | ⚠ AlertCircle |

## 🔄 Flujo de Estados

```
┌─────────────┐
│   Upload    │
│  (Usuario)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Status: 0  │ ◄── Archivo guardado en Redis
│  En Cola    │     Esperando procesamiento
└──────┬──────┘
       │
       │ (Monitor detecta archivo)
       │ (Dagster procesa)
       │
       ▼
┌─────────────┐
│  Status: 1  │ ◄── Procesamiento exitoso
│  Procesado  │     Datos en Delta Lake
└─────────────┘

       │ (Si hay error)
       ▼
┌─────────────┐
│  Status: 2  │ ◄── Error en procesamiento
│   Error     │     Revisar logs
└─────────────┘
```

## 📁 Ubicación en el Código

### Backend (Python)

**Modelo de datos** (`portada_backend/app/models.py`):
```python
status = Column(Integer, default=0) # 0=en cola, 1=procesado, 2=error
```

**Endpoint de ingestión** (`portada_backend/app/routers/ingest.py`):
```python
metadata = {
    "status": "0",  # 0=en cola, 1=procesado, 2=error
    ...
}
```

**Endpoint de listado** (`portada_backend/app/routers/ingest.py`):
```python
@router.get("/files")
async def list_files(
    status: Optional[int] = Query(None, description="Filter by status (0=en cola, 1=procesado, 2=error)"),
    ...
)
```

### Frontend (TypeScript/React)

**Interfaz** (`frontend/src/views/ProcessDashboardView.tsx`):
```typescript
interface RedisFile {
  status: number; // 0=en cola, 1=procesado, 2=error
  ...
}
```

**Funciones de mapeo**:
```typescript
const getStatusLabel = (status: number) => {
  switch (status) {
    case 0: return "En Cola";
    case 1: return "Procesado";
    case 2: return "Error";
  }
};

const getStatusColor = (status: number) => {
  switch (status) {
    case 0: return "bg-yellow-100 text-yellow-800";
    case 1: return "bg-green-100 text-green-800";
    case 2: return "bg-red-100 text-red-800";
  }
};
```

**Filtros por tab**:
```typescript
if (activeTab === "queue") {
  statusFilter = 0;  // Solo archivos en cola
} else {
  statusFilter = 1;  // Solo archivos procesados
}
```

## 🛠️ Scripts de Utilidad

### Actualizar status manualmente

**Script**: `update_status_simple.py`

```bash
# Listar todos los archivos
python update_status_simple.py list

# Marcar archivo como procesado
python update_status_simple.py <file_key> 1

# Marcar archivo como error
python update_status_simple.py <file_key> 2
```

### Consultar desde Redis CLI

```bash
# Conectar a Redis
redis-cli

# Ver todos los archivos
LRANGE files:all 0 -1

# Ver metadata de un archivo
HGETALL file:<file_key>

# Ver solo el status
HGET file:<file_key> status

# Actualizar status
HSET file:<file_key> status 1
```

## 📊 Dashboard de Procesos

El dashboard (`/processes`) muestra dos tabs:

### Tab "En Cola" (Queue)
- Muestra archivos con `status: 0`
- Auto-actualización cada 5 segundos
- Indica archivos esperando procesamiento

### Tab "Completados" (Completed)
- Muestra archivos con `status: 1`
- Historial de archivos procesados exitosamente
- Incluye timestamp de procesamiento

### Filtros disponibles
- Por status: Todos / En Cola / Completados / Errores
- Por tipo: Todos / Entradas de Barco / Entidades
- Por búsqueda: Nombre de archivo o usuario

## 🔍 Estadísticas

El dashboard calcula automáticamente:

```typescript
const stats = {
  totalTasks: totalFiles,           // Total de archivos
  activeTasks: files.filter(f => f.status === 0).length,  // En cola
  completedTasks: files.filter(f => f.status === 1).length,  // Procesados
  failedTasks: files.filter(f => f.status === 2).length,  // Errores
};
```

## ⚠️ Importante

1. **Status 0 es el inicial**: Todos los archivos comienzan con `status: 0` al subirse
2. **Status 1 es el objetivo**: El monitor/Dagster debe cambiar a `1` cuando procese exitosamente
3. **Status 2 es para errores**: Si hay un error, cambiar a `2` y guardar mensaje de error
4. **No hay status 3**: El sistema solo usa 0, 1 y 2

## 🔄 Proceso de Actualización

Cuando el monitor/Dagster procesa un archivo:

1. Lee archivo de Redis con `status: 0`
2. Procesa el archivo (carga a Delta Lake)
3. Si éxito: `HSET file:<key> status 1`
4. Si error: `HSET file:<key> status 2` + guardar error_message

## 📝 Notas de Migración

Si tienes datos antiguos con status 3 (del esquema anterior):
- Status 3 ya no se usa
- Convertir status 3 → status 2 (error)
- Actualizar todos los archivos en Redis

```bash
# Script para migrar (si es necesario)
redis-cli --scan --pattern "file:*" | while read key; do
  status=$(redis-cli HGET "$key" status)
  if [ "$status" = "3" ]; then
    redis-cli HSET "$key" status 2
    echo "Migrado: $key"
  fi
done
```
