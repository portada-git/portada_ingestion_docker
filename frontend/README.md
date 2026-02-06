# PortAda Frontend

Sistema de Ingestión y Análisis de Datos - Interfaz de Usuario

## Descripción

Frontend moderno desarrollado con React, TypeScript, Vite y Bun. Implementa la interfaz de usuario para el sistema PortAda de ingestión y análisis de datos históricos de periódicos.

## Tecnologías Utilizadas

- **React 18** - Biblioteca de interfaz de usuario
- **TypeScript** - Tipado estático para JavaScript
- **Vite** - Herramienta de construcción y desarrollo
- **Bun** - Runtime y gestor de paquetes
- **Tailwind CSS** - Framework de CSS utilitario
- **Zustand** - Gestión de estado global
- **React Router** - Enrutamiento del lado del cliente
- **Lucide React** - Iconos modernos
- **React Dropzone** - Carga de archivos con drag & drop
- **Axios** - Cliente HTTP

## Características

### Autenticación
- Sistema de login con JWT
- Gestión de sesiones persistente
- Protección de rutas

### Ingestión de Datos
- Carga de datos de extracción (JSON)
- Carga de entidades conocidas (YAML)
- Separación de procesos para evitar conflictos
- Validación de archivos y progreso de carga
- Feedback en tiempo real

### Análisis de Datos
- Archivos pendientes de procesamiento
- Análisis de fechas faltantes
- Detección de duplicados
- Conteo de entradas diarias
- Gestión de entidades conocidas
- Metadatos de almacenamiento y procesos

### Interfaz de Usuario
- Diseño responsive y moderno
- Navegación lateral con menús desplegables
- Notificaciones toast automáticas
- Componentes reutilizables
- Manejo de errores robusto

## Estructura del Proyecto

```
frontend/
├── src/
│   ├── components/          # Componentes reutilizables
│   │   ├── analysis/        # Componentes de análisis
│   │   ├── Layout.tsx       # Layout principal
│   │   ├── LoadingSpinner.tsx
│   │   └── NotificationContainer.tsx
│   ├── services/            # Servicios de API
│   │   └── api.ts
│   ├── store/               # Gestión de estado
│   │   └── useStore.ts
│   ├── types/               # Definiciones de tipos
│   │   └── index.ts
│   ├── views/               # Vistas principales
│   │   ├── LoginView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── IngestionView.tsx
│   │   └── AnalysisView.tsx
│   ├── App.tsx              # Componente principal
│   ├── main.tsx             # Punto de entrada
│   └── index.css            # Estilos globales
├── public/                  # Archivos estáticos
├── package.json             # Dependencias y scripts
├── vite.config.ts           # Configuración de Vite
├── tailwind.config.js       # Configuración de Tailwind
├── tsconfig.json            # Configuración de TypeScript
└── README.md                # Este archivo
```

## Instalación y Desarrollo

### Prerrequisitos
- Bun >= 1.3.0
- Node.js >= 18.0.0 (para compatibilidad)

### Instalación
```bash
# Instalar dependencias
bun install
```

### Desarrollo
```bash
# Iniciar servidor de desarrollo
bun run dev

# El servidor estará disponible en http://localhost:3000
```

### Construcción
```bash
# Construir para producción
bun run build

# Vista previa de la construcción
bun run preview
```

### Linting y Verificación de Tipos
```bash
# Ejecutar ESLint
bun run lint

# Verificar tipos de TypeScript
bun run type-check
```

## Configuración

### Variables de Entorno
Crear un archivo `.env` en la raíz del proyecto:

```env
VITE_API_BASE_URL=http://localhost:8001/api
```

### Proxy de Desarrollo
El servidor de desarrollo está configurado para hacer proxy de las peticiones `/api/*` al backend en `http://localhost:8001`.

## Integración con Backend

El frontend se comunica con el backend FastAPI a través de:
- **Puerto**: 8001 (backend) → 3000 (frontend)
- **Autenticación**: JWT Bearer tokens
- **Formato**: JSON para todas las comunicaciones
- **CORS**: Configurado para desarrollo local

## Funcionalidades Implementadas

### ✅ Completadas
- [x] Autenticación y gestión de sesiones
- [x] Layout responsive con navegación lateral
- [x] Dashboard con estadísticas del sistema
- [x] Carga de archivos con validación
- [x] Separación de procesos de ingestión
- [x] Sistema de notificaciones
- [x] Manejo de errores robusto
- [x] Análisis de archivos pendientes

### 🚧 En Desarrollo
- [ ] Análisis de fechas faltantes
- [ ] Análisis de duplicados
- [ ] Conteo de entradas diarias
- [ ] Gestión de entidades conocidas
- [ ] Metadatos de almacenamiento
- [ ] Metadatos de procesos

## Arquitectura

### Gestión de Estado
- **Zustand** para estado global
- **Persistencia** automática de autenticación
- **Stores separados** por funcionalidad

### Comunicación con API
- **Axios** para peticiones HTTP
- **Interceptores** para manejo de tokens
- **Manejo de errores** centralizado
- **Tipos TypeScript** para todas las respuestas

### Componentes
- **Componentes funcionales** con hooks
- **Props tipadas** con TypeScript
- **Reutilización** máxima de componentes
- **Separación de responsabilidades**

## Mejores Prácticas

- **TypeScript estricto** para prevenir errores
- **ESLint** para calidad de código
- **Componentes pequeños** y enfocados
- **Hooks personalizados** para lógica reutilizable
- **Manejo de errores** en todos los niveles
- **Accesibilidad** con ARIA labels
- **Responsive design** mobile-first

## Contribución

1. Seguir las convenciones de TypeScript y React
2. Usar Tailwind CSS para estilos
3. Mantener componentes pequeños y reutilizables
4. Agregar tipos para todas las interfaces
5. Documentar funciones complejas
6. Probar en diferentes tamaños de pantalla

## Licencia

Este proyecto es parte del sistema PortAda de análisis de datos históricos.