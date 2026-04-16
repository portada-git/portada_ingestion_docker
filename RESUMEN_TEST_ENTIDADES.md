# 📊 Resumen: Test de Comparación de Entidades

## ✅ Archivos creados

He creado un sistema completo para comparar entidades conocidas vs citaciones extraídas:

### 1. Script principal
- **`test_entity_comparison.py`** - Script Python que hace el análisis completo

### 2. Scripts de ejecución
- **`run_test_in_docker.sh`** - Para Linux/Mac
- **`run_test_in_docker.bat`** - Para Windows

### 3. Documentación
- **`TEST_ENTITY_COMPARISON_README.md`** - Guía completa de uso
- **`RESUMEN_TEST_ENTIDADES.md`** - Este archivo

---

## 🎯 Qué hace el test

El script compara las **entidades conocidas** (voces canónicas del Delta Lake) con las **citaciones reales** extraídas de las entradas de barcos, y ejecuta algoritmos de similitud para resolver ambigüedades.

### Proceso:

```
1. Extrae voces conocidas → Barcelona, Cádiz, Marsella...
2. Extrae citaciones reales → "barcelona", "barselona", "kadiz"...
3. Compara sin similitud → Identifica matches exactos
4. Ejecuta similitud → Resuelve variantes con algoritmos
5. Genera reportes → JSON con estadísticas detalladas
```

### Entidades procesadas:
- ✅ **port** (puertos)
- ✅ **ship_type** (tipos de barco)
- ✅ **flag** (banderas)
- ✅ **ship_tons** (toneladas)

---

## 🚀 Cómo ejecutar (RÁPIDO)

### En Windows:
```cmd
run_test_in_docker.bat
```

### En Linux/Mac:
```bash
./run_test_in_docker.sh
```

El script automáticamente:
1. Verifica que el contenedor está corriendo
2. Copia el script al contenedor
3. Instala dependencias si faltan
4. Ejecuta el test
5. Te dice dónde están los resultados

---

## 📁 Resultados generados

Los resultados se guardan en `/app/output/test_results/` dentro del contenedor:

```
test_results/
├── consolidated_summary.json      # ⭐ RESUMEN DE TODO
├── port_summary.json              # Estadísticas de puertos
├── port_exact.json                # Puertos con match exacto
├── port_consensus.json            # Puertos resueltos por consenso
├── port_gray_zone.json            # ⚠️ Puertos ambiguos (revisar)
├── port_one_vote.json             # Puertos con solo 1 voto
├── port_rejected.json             # Puertos rechazados
├── ship_type_summary.json         # Estadísticas de tipos de barco
├── ship_type_exact.json
├── ship_type_consensus.json
├── ship_type_gray_zone.json       # ⚠️ Tipos ambiguos
├── ...
└── [similar para flag y ship_tons]
```

### Para copiar resultados a tu máquina:

```bash
docker cp portada-api-1:/app/output/test_results ./test_results_local
```

---

## 📊 Ejemplo de salida

```
================================================================================
  ENTIDAD: PORT
================================================================================

  Entidades conocidas:
    • 150 entidades canónicas
    • 450 voces totales
    • 420 voces únicas

  Citaciones extraídas:
    • 5000 menciones totales
    • 320 términos únicos

  Matches exactos (sin similitud):
    • 180 términos (72.5% de menciones)

  Después de similitud:
    ✅ Resueltos: 280 términos (87.5%)
       → 4350 menciones (87.0%)
    ⚠️  Necesitan revisión:
       • GRAY_ZONE: 25
       • ONE_VOTE: 10
       • WEAK: 5
    ❌ Rechazados: 0
```

---

## 🔍 Qué información obtienes

### 1. Cobertura de entidades conocidas
- ¿Cuántas voces canónicas tienes?
- ¿Cuántas variantes por entidad?

### 2. Análisis de citaciones extraídas
- ¿Cuántos términos únicos hay en las entradas?
- ¿Cuántas menciones totales?

### 3. Efectividad de matches exactos
- ¿Qué % se resuelve sin algoritmos de similitud?
- ¿Cuántos términos necesitan similitud?

### 4. Resultados de similitud
- **EXACT**: Match exacto con voz conocida
- **CONSENSUS**: ≥2 algoritmos coinciden (alta confianza)
- **WEAK**: 2+ votos pero sin cumplir requisitos estrictos
- **ONE_VOTE**: Solo 1 algoritmo votó (baja confianza)
- **GRAY_ZONE**: Ningún voto pero en zona de incertidumbre
- **REJECTED**: Sin coincidencias significativas

### 5. Términos que necesitan revisión manual
- Lista de términos en GRAY_ZONE
- Lista de términos con ONE_VOTE
- Frecuencia de cada término problemático

---

## 🎓 Interpretación de resultados

### ✅ Cobertura alta (>85%)
- Las voces conocidas cubren bien las citaciones
- Los algoritmos funcionan correctamente
- Pocos términos necesitan revisión

### ⚠️ Cobertura media (60-85%)
- Faltan voces conocidas para algunas variantes
- Revisar términos en GRAY_ZONE
- Considerar agregar más voces canónicas

### ❌ Cobertura baja (<60%)
- Muchas citaciones no tienen voces conocidas
- Revisar calidad de extracción
- Ampliar lista de entidades conocidas

---

## 🔧 Configuración

### Cambiar algoritmos activos

Edita `/app/config/config_similarity.json` en el contenedor:

```json
{
  "algorithms": {
    "levenshtein_ratio": {
      "enabled": true,
      "threshold": 0.75
    },
    "jaro_winkler": {
      "enabled": true,
      "threshold": 0.88
    }
  }
}
```

### Usar entradas raw en lugar de clean

Edita `test_entity_comparison.py`:

```python
IS_DATA_CLEANED = False  # Cambiar a False
```

---

## 🐛 Solución de problemas

### El contenedor no está corriendo
```bash
docker-compose up -d
```

### Falta portada-s-index
```bash
docker exec -it portada-api-1 pip install portada-s-index
```

### No hay datos en Delta Lake
```bash
# Verificar que existe
docker exec -it portada-api-1 ls -la /app/delta_lake/portada_project/

# Si está vacío, necesitas cargar datos primero
```

### El script se cuelga
- Reduce las entidades a procesar (comenta algunas en `ENTITIES_TO_TEST`)
- Usa entradas clean en lugar de raw
- Verifica logs: `docker logs portada-api-1`

---

## 📝 Próximos pasos

Después de ejecutar el test:

1. **Revisar cobertura general** → `consolidated_summary.json`
2. **Identificar términos problemáticos** → archivos `*_gray_zone.json`
3. **Agregar voces faltantes** → Actualizar entidades conocidas
4. **Ajustar configuración** → Modificar thresholds si es necesario
5. **Re-ejecutar test** → Verificar mejoras

---

## 📚 Documentación adicional

- **Guía completa**: `TEST_ENTITY_COMPARISON_README.md`
- **Diagnóstico del proyecto**: Ver el diagnóstico que hice anteriormente
- **Librería portada-s-index**: `.examples/portada-s-index/portada-s-index/README.md`

---

## ✨ Resumen ejecutivo

Has creado un sistema completo para:
- ✅ Comparar entidades conocidas vs extraídas
- ✅ Medir cobertura de voces canónicas
- ✅ Identificar términos ambiguos
- ✅ Generar reportes detallados
- ✅ Ejecutar fácilmente desde Docker

**Siguiente paso:** Ejecuta el test y revisa los resultados para entender qué tan bien están funcionando los algoritmos de similitud en tu proyecto.
