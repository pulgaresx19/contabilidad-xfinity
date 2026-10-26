# Contabilidad XFinity (Comcast Cable Tech) ⚡

Sistema móvil de gestión operativa, control contable y auditoría de trabajos para técnicos instaladores de cableado y acometidas (Drop Bury) de **Xfinity / Comcast** (Técnico Javier `P0G1`, Elkhart, Indiana).

---

## 🚀 Características Principales

### 1. 📱 Jornada del Día (Inicio)
- **Ruta diaria enfocada:** Vista exclusiva de los trabajos asignados para la fecha activa con navegación por fechas (`< [Fecha] >`) y botón rápido **Hoy**.
- **Numeración en círculo:** Identificación rápida de trabajos con círculo numerado (**①**, **②**, **③**...).
- **Captura Dual de Hojas de Ruta:** Escáner OCR con opción directa de tomar foto con la cámara (`📸`) o elegir desde la galería (`🖼️`).
- **Añadir trabajos manuales:** Formulario rápido con Job ID, dirección, teléfono, metraje, tipo de cable y bore.

### 2. 💰 Motor de Tarifas y Reglas de Pago
- **Tarifa Base:** $100.00 por trabajo estándar (configurable).
- **Bono Driveway Bore (DW):** +$30.00 por perforación de entrada vehicular (configurable).
- **Regla de Metraje Largo (>300 ft):** +$25.00 automáticos por cada 100 ft adicionales a partir de los 300 ft base.
- **Ajustes de Supervisor:** Ajuste manual de saldo (+ bono o - descuento) con motivo y justificación obligatoria para constancia contable.

### 3. 📸 Evidencias y Compartir por WhatsApp
- **Subida de fotos por trabajo:** Respaldo fotográfico de acometida, casa, medidor y perforación.
- **Reporte en un solo bloque:** Envío conjunto a WhatsApp con fotos adjuntas y texto desglosado listo para supervisores.

### 4. 📅 Cierres Semanales y Auditoría de Pagos
- **Selector Lineal de Cierre:** Configuración horizontal de 7 días (`[Lun] [Mar] [Mié] [Jue] [Vie] [Sáb] [Dom]`) para definir el día exacto de cierre contable.
- **Control de Cobros:** Marcado de semanas como **Pendiente por Cobrar** o **Cobrado ✓** con un solo toque.
- **Modal de Detalle Semanal:** Visualización superpuesta con desglose completo y botón de cierre (`✕`).
- **Constancia de Auditoría & Reclamo:** Botón para copiar el desglose formal de la semana ante inconsistencias de pago.

### 5. 🔍 Historial General
- Pestaña con todos los trabajos históricos organizados cronológicamente.
- **Buscador Inteligente:** Búsqueda en tiempo real por Job ID, dirección, teléfono, ciudad o tipo de cable (**RG6** / **RG11**).
- **Filtros por Estado:** `Todos`, `Hechos`, `Pendientes` y `Cancelados`.

### 6. 📊 Reporte Mensual y Control de Gastos
- **Suma de Semanas:** Totaliza todas las semanas cerradas en el mes para conocer exactamente el total cobrado, facturado y pendiente.
- **Registro de Gastos:** Registro con categorías (Combustible, Herramientas, Vehículo, Viáticos, Teléfono, Seguro, Otros) y foto de comprobante opcional.
- **Balance Neto en Mano:** Cálculo en tiempo real de `Cobrado - Gastos` con margen porcentual de ganancia.
- **Constancia para WhatsApp:** Copia de reporte formal mensual listo para supervisores y contadores con un solo toque.

### 7. ☀️🌙 Modo Claro y Modo Oscuro
- Conmutador rápido en la barra superior (☀️ / 🌙) y persistencia en `localStorage`.
- Paleta de alto contraste optimizada para visibilidad bajo luz solar o en la noche.
- Botones de navegación con ícono arriba y texto abajo.

---

## 🛠️ Stack Tecnológico
- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React.
- **Backend:** Node.js, Express.
- **Base de Datos:** SQLite (`better-sqlite3`).
- **OCR:** Tesseract.js para escaneo de hojas de despacho.
- **Túnel Móvil:** Cloudflare Tunnel (`cloudflared`).

---

## 💻 Instalación y Uso Local

```bash
# 1. Instalar dependencias del servidor
npm install

# 2. Instalar dependencias del cliente React
cd client
npm install
npm run build
cd ..

# 3. Iniciar el servidor
node server.js
```

El servidor iniciará en `http://localhost:5000`.
