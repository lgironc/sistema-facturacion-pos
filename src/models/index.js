const Proveedor = require('./Proveedor');
const Producto = require('./Producto');
const Compra = require('./Compra');
const CompraDetalle = require('./CompraDetalle');
const Cliente = require('./Cliente');
const Factura = require('./Factura');
const FacturaDetalle = require('./FacturaDetalle');
const FacturaBackup = require('./FacturaBackup');
const HistorialInventario = require('./HistorialInventario'); // ✅ Historial definitivo
const MovimientoFinanciero = require('./MovimientoFinanciero');
const CuentaPorCobrar = require('./CuentaPorCobrar');



// ====================
// RELACIONES COMPRAS
// ====================
Compra.belongsTo(Proveedor, { foreignKey: 'proveedorId', as: 'Proveedor' });
Proveedor.hasMany(Compra, { foreignKey: 'proveedorId', as: 'Compras' });

CompraDetalle.belongsTo(Compra, { foreignKey: 'compraId', as: 'Compra' });
Compra.hasMany(CompraDetalle, { foreignKey: 'compraId', as: 'CompraDetalles' });

CompraDetalle.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });
Producto.hasMany(CompraDetalle, { foreignKey: 'productoId', as: 'CompraDetalles' });

// ====================
// RELACIONES FACTURAS
// ====================
Factura.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'Cliente' });
Cliente.hasMany(Factura, { foreignKey: 'clienteId', as: 'Facturas' });

Factura.hasMany(FacturaDetalle, { foreignKey: 'facturaId', as: 'FacturaDetalles' });
FacturaDetalle.belongsTo(Factura, { foreignKey: 'facturaId', as: 'Factura' });

FacturaDetalle.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });
Producto.hasMany(FacturaDetalle, { foreignKey: 'productoId', as: 'FacturaDetalles' });

// ====================
// RELACIÓN HISTORIAL INVENTARIO
// ====================
HistorialInventario.belongsTo(Producto, { foreignKey: 'productoId', as: 'Producto' });
Producto.hasMany(HistorialInventario, { foreignKey: 'productoId', as: 'HistorialEntradas' });

Cliente.hasMany(CuentaPorCobrar, { foreignKey: 'clienteId' });
CuentaPorCobrar.belongsTo(Cliente, { foreignKey: 'clienteId' });

Factura.hasOne(CuentaPorCobrar, { foreignKey: 'facturaId' });
CuentaPorCobrar.belongsTo(Factura, { foreignKey: 'facturaId' });

MovimientoFinanciero.belongsTo(Factura, { foreignKey: 'facturaId' });
Factura.hasMany(MovimientoFinanciero, { foreignKey: 'facturaId' });



// ✅ Exportar TODOS los modelos
module.exports = {
  Proveedor,
  Producto,
  Compra,
  CompraDetalle,
  Cliente,
  Factura,
  FacturaDetalle,
  FacturaBackup,
  HistorialInventario,
  MovimientoFinanciero,
  CuentaPorCobrar
};
