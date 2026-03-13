import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import AlertaGPS from './components/AlertaGPS';
import SesionDesplazada from './components/SesionDesplazada';
import PedirNotificaciones from './components/PedirNotificaciones';
import ToastPedido from './components/ToastPedido';
import PedirGPS from './components/PedirGPS';
import InstalarApp from './components/InstalarApp';
import ActualizarApp from './components/ActualizarApp';
import { RepartidorProvider } from './context/RepartidorContext';
import { useAuth } from './context/AuthContext';

// Lazy-loaded pages
const Dashboard         = lazy(() => import('./pages/Dashboard'));
const Clientes          = lazy(() => import('./pages/Clientes'));
const Ventas            = lazy(() => import('./pages/Ventas'));
const Presentaciones    = lazy(() => import('./pages/Presentaciones'));
const Trazabilidad      = lazy(() => import('./pages/Presentaciones/Trazabilidad'));
const Caja              = lazy(() => import('./pages/Caja'));
const HistorialCajas    = lazy(() => import('./pages/Caja/HistorialCajas'));
const Insumos           = lazy(() => import('./pages/Insumos'));
const Produccion        = lazy(() => import('./pages/Produccion'));
const Compras           = lazy(() => import('./pages/Compras'));
const Proveedores       = lazy(() => import('./pages/Proveedores'));
const ComparadorPrecios = lazy(() => import('./pages/Proveedores/ComparadorPrecios'));
const Recetas           = lazy(() => import('./pages/Recetas'));
const Lavado            = lazy(() => import('./pages/Lavado'));
const Comprobantes      = lazy(() => import('./pages/Comprobantes'));
const Devoluciones      = lazy(() => import('./pages/Devoluciones'));
const PrediccionVentas  = lazy(() => import('./pages/Ventas/PrediccionVentas'));
const Deudas            = lazy(() => import('./pages/Deudas'));
const Usuarios          = lazy(() => import('./pages/Usuarios'));
const Vehiculos         = lazy(() => import('./pages/Vehiculos'));
const Pedidos           = lazy(() => import('./pages/Pedidos'));
const GestionRutas      = lazy(() => import('./pages/Reparto/GestionRutas'));
const GestionPedidos    = lazy(() => import('./pages/Reparto/GestionPedidos'));
const EntregaCaja       = lazy(() => import('./pages/Reparto/EntregaCaja'));
const RepartidorHome    = lazy(() => import('./pages/Repartidor'));
const RepartidorDash    = lazy(() => import('./pages/Repartidor/Dashboard'));
const MiVehiculo        = lazy(() => import('./pages/Repartidor/MiVehiculo'));
const MiCaja            = lazy(() => import('./pages/Repartidor/MiCaja'));
const DevolucionReparto = lazy(() => import('./pages/Repartidor/DevolucionReparto'));
const VentaAlPaso       = lazy(() => import('./pages/Repartidor/VentaAlPaso'));
const CobroDeuda        = lazy(() => import('./pages/Repartidor/CobroDeuda'));
const MisPedidos        = lazy(() => import('./pages/MisPedidos'));
const MonitoreoMapa     = lazy(() => import('./pages/Central/MonitoreoMapa'));
const PanelCentral      = lazy(() => import('./pages/Central/PanelCentral'));
const ServidorConfig    = lazy(() => import('./pages/Config/ServidorConfig'));
const ApisExternas      = lazy(() => import('./pages/Config/ApisExternas'));
const ConfigGeneral     = lazy(() => import('./pages/Config/ConfigGeneral'));
const MetodosPago       = lazy(() => import('./pages/Config/MetodosPago'));
const Facturacion       = lazy(() => import('./pages/Config/Facturacion'));
const CondicionesPago   = lazy(() => import('./pages/Config/CondicionesPago'));
const Reportes          = lazy(() => import('./pages/Reportes'));
const Metas             = lazy(() => import('./pages/Metas'));
const Mantenimientos    = lazy(() => import('./pages/Mantenimientos'));
const Calidad           = lazy(() => import('./pages/Calidad'));
const Auditoria         = lazy(() => import('./pages/Auditoria'));
const MapaClientes      = lazy(() => import('./pages/Administracion/MapaClientes'));

const LazySpinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
  </div>
);

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.rol === 'superadmin' || user?.rol === 'soporte') return <Navigate to="/central" replace />;
  if (user?.rol === 'chofer') return <Navigate to="/repartidor/dashboard" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RepartidorProvider>
        <AlertaGPS />
        <SesionDesplazada />
        <PedirNotificaciones />
        <PedirGPS />
        <ToastPedido />
        <InstalarApp />
        <ActualizarApp />
        <Suspense fallback={<LazySpinner />}>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/config-servidor" element={<ServidorConfig />} />

          {/* Protegidas */}
          <Route path="/" element={
            <PrivateRoute><HomeRedirect /></PrivateRoute>
          } />
          <Route path="/clientes" element={
            <PrivateRoute><Clientes /></PrivateRoute>
          } />
          <Route path="/ventas" element={
            <PrivateRoute><Ventas /></PrivateRoute>
          } />
          <Route path="/comprobantes" element={
            <PrivateRoute><Comprobantes /></PrivateRoute>
          } />
          <Route path="/devoluciones" element={
            <PrivateRoute><Devoluciones /></PrivateRoute>
          } />
          <Route path="/ventas/prediccion" element={
            <PrivateRoute><PrediccionVentas /></PrivateRoute>
          } />
          <Route path="/deudas" element={
            <PrivateRoute><Deudas /></PrivateRoute>
          } />
          <Route path="/presentaciones" element={
            <PrivateRoute><Presentaciones /></PrivateRoute>
          } />
          <Route path="/trazabilidad" element={
            <PrivateRoute><Trazabilidad /></PrivateRoute>
          } />
          <Route path="/caja" element={
            <PrivateRoute><Caja /></PrivateRoute>
          } />
          <Route path="/caja/historial" element={
            <PrivateRoute><HistorialCajas /></PrivateRoute>
          } />
          <Route path="/insumos" element={
            <PrivateRoute><Insumos /></PrivateRoute>
          } />
          <Route path="/produccion" element={
            <PrivateRoute><Produccion /></PrivateRoute>
          } />
          <Route path="/compras" element={
            <PrivateRoute><Compras /></PrivateRoute>
          } />
          <Route path="/recetas" element={
            <PrivateRoute><Recetas /></PrivateRoute>
          } />
          <Route path="/lavado" element={
            <PrivateRoute><Lavado /></PrivateRoute>
          } />
          <Route path="/proveedores" element={
            <PrivateRoute><Proveedores /></PrivateRoute>
          } />
          <Route path="/proveedores/comparar" element={
            <PrivateRoute><ComparadorPrecios /></PrivateRoute>
          } />
          <Route path="/usuarios" element={
            <PrivateRoute><Usuarios /></PrivateRoute>
          } />
          <Route path="/vehiculos" element={
            <PrivateRoute><Vehiculos /></PrivateRoute>
          } />
          <Route path="/pedidos" element={
            <PrivateRoute><Pedidos /></PrivateRoute>
          } />

          {/* Central — monitoreo */}
          <Route path="/monitoreo" element={
            <PrivateRoute><MonitoreoMapa /></PrivateRoute>
          } />
          <Route path="/central" element={
            <PrivateRoute><PanelCentral /></PrivateRoute>
          } />

          {/* Reparto (admin/encargada) */}
          <Route path="/reparto/rutas" element={
            <PrivateRoute><GestionRutas /></PrivateRoute>
          } />
          <Route path="/reparto/pedidos" element={
            <PrivateRoute><GestionPedidos /></PrivateRoute>
          } />
          <Route path="/reparto/caja" element={
            <PrivateRoute><EntregaCaja /></PrivateRoute>
          } />

          {/* Repartidor */}
          <Route path="/repartidor/dashboard" element={
            <PrivateRoute><RepartidorDash /></PrivateRoute>
          } />
          <Route path="/repartidor" element={
            <PrivateRoute><RepartidorHome /></PrivateRoute>
          } />
          <Route path="/repartidor/devoluciones" element={
            <PrivateRoute><DevolucionReparto /></PrivateRoute>
          } />
          <Route path="/mi-vehiculo" element={
            <PrivateRoute><MiVehiculo /></PrivateRoute>
          } />
          <Route path="/mis-pedidos" element={
            <PrivateRoute><MisPedidos /></PrivateRoute>
          } />
          <Route path="/mi-caja" element={
            <PrivateRoute><MiCaja /></PrivateRoute>
          } />
          <Route path="/venta-al-paso" element={
            <PrivateRoute><VentaAlPaso /></PrivateRoute>
          } />
          <Route path="/cobro-deuda" element={
            <PrivateRoute><CobroDeuda /></PrivateRoute>
          } />
          <Route path="/reportes" element={
            <PrivateRoute><Reportes /></PrivateRoute>
          } />
          <Route path="/metas" element={
            <PrivateRoute><Metas /></PrivateRoute>
          } />
          <Route path="/mantenimientos" element={
            <PrivateRoute><Mantenimientos /></PrivateRoute>
          } />
          <Route path="/calidad" element={
            <PrivateRoute><Calidad /></PrivateRoute>
          } />
          <Route path="/auditoria" element={
            <PrivateRoute><Auditoria /></PrivateRoute>
          } />
          <Route path="/mapa-clientes" element={
            <PrivateRoute><MapaClientes /></PrivateRoute>
          } />
          <Route path="/configuracion/general" element={
            <PrivateRoute><ConfigGeneral /></PrivateRoute>
          } />
          <Route path="/configuracion/apis" element={
            <PrivateRoute><ApisExternas /></PrivateRoute>
          } />
          <Route path="/configuracion/metodos-pago" element={
            <PrivateRoute><MetodosPago /></PrivateRoute>
          } />
          <Route path="/configuracion/facturacion" element={
            <PrivateRoute><Facturacion /></PrivateRoute>
          } />
          <Route path="/configuracion/condiciones-pago" element={
            <PrivateRoute><CondicionesPago /></PrivateRoute>
          } />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </RepartidorProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
