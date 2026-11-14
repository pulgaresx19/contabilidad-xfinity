# Contabilidad XFinity (Comcast Cable Tech) ⚡

Sistema móvil de gestión operativa, control contable y auditoría de trabajos para técnicos instaladores de cableado y acometidas (**Drop Bury**) de **Xfinity / Comcast** (Técnico Javier `P0G1`, Elkhart, Indiana).

Optimizado para su despliegue en producción en **Vercel** y sincronización local/móvil vía **AuraCore AI**.

---

## 🚀 Características Principales

### 1. 📱 Jornada del Día (Inicio)
- **Ruta diaria enfocada:** Vista exclusiva de los trabajos asignados para la fecha activa con navegación cronológica (`< [Fecha] >`) y botón rápido **Hoy**.
- **Numeración en círculo:** Identificación rápida de trabajos con círculo numerado (**①**, **②**, **③**...).
- **Escáner Inteligente con IA (AuraCore + Google Gemini):** Captura directa de hojas de despacho y órdenes de trabajo mediante cámara (`📸`) o galería (`🖼️`) con extracción instantánea de Job ID, dirección, teléfono, metraje, tipo de cable (`RG-6` / `RG-11`) y tipo de perforación (`BORE`).
- **Añadir trabajos manuales:** Formulario rápido para ingreso manual de órdenes.

### 2. 🧠 Conexión con IA Multimodal (AuraCore AI en Vercel)
- **Motor Neuronal Ultrarrápido:** Conectado a **Google Gemini (`gemini-3.1-flash-lite`)** para respuestas y lectura de imágenes en menos de 1 segundo.
- **Despliegue Serverless en Vercel:** Integración mediante funciones serverless de Vercel (`api/handler.js` en AuraCore) o proxy same-origin (`/auracore`) en entorno local.
- **Resolución Automática:** Conmutación fluida en Ajustes (`Auto` o URL directa de Vercel `https://tu-auracore.vercel.app`) para escanear tanto desde el móvil en la calle como en la computadora.
- **Esquema Flexible y Tolerante:** Extracción robusta de renglones completos incluso con datos secundarios omitidos o manuscritos.

### 3. 📸 Evidencias de Trabajo & Constancia de No Realizado
- **Cámara Cockpit con Sello GPS y Hora Real:** Estampado automático e indeleble de coordenadas GPS, hora y dirección directamente sobre la fotografía de evidencia o del obstáculo.
- **Constancia de Trabajo No Realizado:** Flujo formal con motivo de cancelación requerido y previsualización compacta de fotos del obstáculo sin romper las dimensiones de la interfaz.
- **Modales con Altura Estandarizada:** Diseño consistente (`h-[80dvh]` en móvil) con contenido interno *scrollable* que evita saltos o desajustes de pantalla al abrir evidencias o constancias.
- **Reporte para WhatsApp:** Envío conjunto en un solo bloque con desglose completo y fotografías adjuntas.

### 4. 💰 Motor de Tarifas y Reglas de Pago
- **Tarifa Base:** $100.00 por trabajo estándar (configurable).
- **Bono Driveway Bore (DW):** +$30.00 por perforación de entrada vehicular (configurable).
- **Regla de Metraje Largo (>300 ft):** +$25.00 automáticos por cada 100 ft adicionales a partir de los 300 ft base.
- **Ajustes de Supervisor:** Modificación manual de saldo (+ bono o - descuento) con motivo y justificación obligatoria.

### 5. 📅 Cierres Semanales y Auditoría de Pagos
- **Selector Lineal de Cierre:** Configuración horizontal de 7 días (`[Lun] [Mar] [Mié] [Jue] [Vie] [Sáb] [Dom]`) para definir el día exacto de corte de la compañía.
- **Modal de Detalle Semanal y Mensual:** Vista superpuesta estandarizada que previene tarjetas sobrecargadas y agrupa órdenes con botones de acción alineados (`Cobrar` y `Copiar Auditoría`).
- **Constancia de Auditoría & Reclamo:** Copia instantánea del desglose formal para reclamos ante discrepancias de pago.

### 6. 📊 Reporte Mensual y Control de Gastos
- **Suma de Semanas:** Totalización en vivo de semanas cerradas, facturación acumulada y balance pendiente.
- **Control de Gastos Operativos:** Registro categorizado (Combustible, Herramientas, Seguro, Viáticos, etc.) con comprobantes.
- **Balance Neto en Mano:** Cálculo en tiempo real de `Cobrado - Gastos`.

---

## 🛠️ Stack Tecnológico
- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React.
- **Hosting de Producción:** **Vercel** (`vercel.json`).
- **Backend Local:** Node.js, Express, SQLite (`better-sqlite3`).
- **IA Multimodal:** AuraCore-AI (`@google/genai` con `gemini-3.1-flash-lite`).

---

## 💻 Puesta en Marcha Local

```bash
# 1. Instalar dependencias del servidor
npm install

# 2. Instalar dependencias del cliente React y compilar
cd client
npm install
npm run build
cd ..

# 3. Iniciar el servidor (levanta Contabilidad en :5000 y AuraCore en :3100 automáticamente)
node server.js
# O doble clic en Iniciar-Contabilidad.bat
```
