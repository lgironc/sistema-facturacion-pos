// =========================================
// POS.JS - CONTROL GENERAL DEL SISTEMA POS
// =========================================

const BASE = 'http://localhost:4000'; // Usa mismo host (http://localhost:4000)
let productoEnEdicion = null;
let _clienteAEliminar = null; // <- ya la usas en abrirModalEliminarCliente/confirmarEliminar


const state = {
  productos: [],
  carrito: [],
  clientes: [],
  historial: [], 
  finanzas: [], 
  movimientosFinancieros: [],
  rutaActual: null,      // { id, detalles: [...] }
  rutaDetalles: []       // tabla que editas en el front
};

const el = id => document.getElementById(id);
const formatoQ = n => `Q${Number(n || 0).toFixed(2)}`;

// ==========================================
// 🔹 CARGA DE PRODUCTOS
// ==========================================
async function cargarProductos() {
  try {
    const res = await fetch(`${BASE}/productos`);
    state.productos = await res.json();
    renderProductosPOS();
    renderProductosAdmin();
     llenarFiltroHistorialProductos();
     renderProductosRuta(); // 👈 aquí
  } catch (e) {
    console.error('Error cargando productos:', e);
  }
}

function renderProductosPOS() {
  const tbody = el('productosBody');
  if (!tbody) return;
  
  const q = (el('search')?.value || '').toLowerCase();
  tbody.innerHTML = '';
  
  state.productos
    .filter(p => p.activo !== false && p.nombre?.toLowerCase().includes(q))
    .forEach(p => {
      const tr = document.createElement('tr'); 
      tr.innerHTML = `
        <td>${p.nombre}</td>
        <td class="text-end">${formatoQ(p.precioVenta)}</td>
        <td class="text-end ${p.stock <= 0 ? 'text-danger' : ''}">${p.stock}</td>
        <td class="text-end">
          <div class="input-group input-group-sm justify-content-end">
            <input type="number" min="1" value="1" class="form-control form-control-sm small-input" />
            <button class="btn btn-success btn-sm">+</button>
          </div>
        </td>
      `;

      tr.querySelector('button').addEventListener('click', () => {
        const cant = Math.max(1, parseInt(tr.querySelector('input').value || '1'));
        agregarAlCarrito(p, cant);
      });

      tbody.appendChild(tr);
    });
}

function renderProductosAdmin() {
  const tbody = el('productosAdminBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  state.productos.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.nombre}</td>
      <td class="text-end">${formatoQ(p.precioVenta)}</td>
      <td class="text-end">${p.stock}</td>
      <td class="text-end">${new Date(p.fechaIngreso || p.createdAt).toLocaleDateString()}</td>
      <td class="text-center">
  ${
    p.activo === false
      ? `<button class="btn btn-success btn-sm btn-reactivar">♻️ Reactivar</button>`
      : `
          <button class="btn btn-warning btn-sm me-2 btn-editar">✏</button>
          <button class="btn btn-danger btn-sm btn-eliminar">🗑</button>
        `
  }
</td>

    `;

   // ✅ Botón Editar (solo si está activo)
    if (p.activo !== false) {
      tr.querySelector('.btn-editar').addEventListener('click', () => cargarEdicionProducto(p));
      tr.querySelector('.btn-eliminar').addEventListener('click', () => {
        abrirModalEliminarProducto(p.id, p.nombre);
      });
    }

    // ✅ Botón Reactivar (solo si está inactivo)
    if (p.activo === false) {
      tr.querySelector('.btn-reactivar').addEventListener('click', () => reactivarProducto(p.id));
    }

    tbody.appendChild(tr);
  });
}

// =========================================
// 🛒 CARRITO Y FACTURACIÓN (REACTIVADO)
// =========================================
function agregarAlCarrito(prod, cant) {
  const idx = state.carrito.findIndex(i => i.productoId === prod.id);
  const cantidadFinal = Math.min(cant, prod.stock);

  if (idx >= 0) {
    state.carrito[idx].cantidad = Math.min(state.carrito[idx].cantidad + cant, prod.stock);
  } else {
    state.carrito.push({
      productoId: prod.id,
      nombre: prod.nombre,
      precioVenta: prod.precioVenta,
      cantidad: cantidadFinal
    });
  }
  renderCarrito();
}

function renderCarrito() {
  const tbody = el('carritoBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  let total = 0;

  state.carrito.forEach((item, i) => {
    const subtotal = item.cantidad * item.precioVenta;
    total += subtotal;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td class="text-end">
        <input type="number"
               min="1"
               class="form-control form-control-sm small-input input-cant"
               value="${item.cantidad}">
      </td>
      <td class="text-end">
        <input type="number"
               min="0"
               step="0.01"
               class="form-control form-control-sm small-input text-end input-precio"
               value="${item.precioVenta}">
      </td>
      <td class="text-end">${formatoQ(subtotal)}</td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm">×</button>
      </td>
    `;

    const qtyInput   = tr.querySelector('.input-cant');
    const priceInput = tr.querySelector('.input-precio');
    const btnDelete  = tr.querySelector('button');

    // 🔹 Cambiar cantidad
    qtyInput.addEventListener('change', e => {
      let nuevaCant = parseInt(e.target.value);
      if (!Number.isFinite(nuevaCant) || nuevaCant <= 0) nuevaCant = 1;
      state.carrito[i].cantidad = nuevaCant;
      renderCarrito();
    });

    // 🔹 Cambiar precio unitario (descuento / precio especial)
    priceInput.addEventListener('change', e => {
      let nuevoPrecio = parseFloat(e.target.value);
      if (!Number.isFinite(nuevoPrecio) || nuevoPrecio < 0) {
        // si está mal, se regresa al valor anterior
        e.target.value = item.precioVenta;
        return;
      }
      state.carrito[i].precioVenta = nuevoPrecio;
      renderCarrito();
    });

    // 🔹 Eliminar línea
    btnDelete.addEventListener('click', () => {
      state.carrito.splice(i, 1);
      renderCarrito();
    });

    tbody.appendChild(tr);
  });

  el('totalCell').textContent = formatoQ(total);
}


function mostrarToast(mensaje, tipo = 'info') {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) return;

  // Opciones de color según tipo
  const colores = {
    success: 'bg-success text-white',
    danger: 'bg-danger text-white',
    warning: 'bg-warning text-dark',
    info: 'bg-info text-dark'
  };

  const colorClase = colores[tipo] || colores.info;

  // Crear el toast
  const toast = document.createElement('div');
  toast.className = `toast align-items-center ${colorClase} border-0 show`;
  toast.setAttribute('role', 'alert');

  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${mensaje}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  // Agregar y mostrar
  toastContainer.appendChild(toast);

  // Auto-eliminar después de 3 segundos
  setTimeout(() => {
    toast.remove();
  }, 3000);
}


async function facturar() {
  if (!state.carrito.length) {
    mostrarToast('El carrito está vacío.', 'warning');
    return;
  }

  // ✅ Calcular total de la factura ANTES de validar
  const totalFactura = state.carrito.reduce(
    (sum, item) => sum + (Number(item.precioVenta) * Number(item.cantidad)),
    0
  );

  const clienteId = el('clienteId').value || null;
  const tipoPago = el('tipoPago').value; // "contado" o "credito"

  // ✅ Obtener los campos según tipo de pago
  let efectivo = 0;
  let abonoInicial = 0;

  if (tipoPago === 'contado') {
    efectivo = parseFloat(el('efectivoRecibido').value) || 0;
  } else if (tipoPago === 'credito') {
    abonoInicial = parseFloat(el('abonoCredito')?.value) || 0;
  }

  // ✅ Validaciones básicas
  if (tipoPago === 'contado') {
    if (!Number.isFinite(totalFactura) || totalFactura <= 0) {
      mostrarToast('Total inválido para facturar', 'warning');
      return;
    }
    if (efectivo < totalFactura) {
      mostrarToast('El efectivo recibido no puede ser menor al total de la factura', 'warning');
      return;
    }
  }

 if (window.electronAPI?.abrirCajon) {
  window.electronAPI.abrirCajon('AON Printer')
    .then(r => { if (!r?.success) console.warn('No abrió cajón:', r?.error); });
}

  if (tipoPago === 'credito') {
    if (abonoInicial < 0) {
      mostrarToast('El abono inicial no puede ser negativo', 'warning');
      return;
    }
    if (abonoInicial > totalFactura) {
      mostrarToast('El abono inicial no puede ser mayor al total de la factura', 'warning');
      return;
    }
  }

  const productos = state.carrito.map(item => ({
    productoId: item.productoId,
    cantidad: Number(item.cantidad),
    precioUnitario: Number(item.precioVenta),
    precio: Number(item.precioVenta)
  }));

  const resultDiv = el('result');
  const errorDiv = el('error');
  const btnAbrirPDF = el('btnAbrirPDF');

  // ✅ Limpiar mensajes previos
  resultDiv.textContent = '';
  errorDiv.textContent = '';
  btnAbrirPDF.style.display = 'none';

  try {
    // ✅ Crear factura en el backend
    const res = await fetch(`${BASE}/facturas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, productos, tipoPago, efectivo, abonoInicial })
    });

    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      const msg = data?.detalle || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    // 👇👇👇 AQUÍ LEEMOS EL ID DE LA FACTURA
    const facturaId = data?.facturaId || data?.id;
    if (!facturaId) {
      throw new Error('El servidor no devolvió facturaId');
    }

    // ✅ Calcular cambio SOLO si es contado
    const cambio = tipoPago === 'contado' ? (efectivo - totalFactura) : 0;

    // ✅ Mostrar éxito en el POS
    resultDiv.innerHTML = `
      ✅ Factura creada (ID: ${facturaId})<br>
      Total: Q${totalFactura.toFixed(2)} | 
      ${tipoPago === 'contado'
        ? `Efectivo: Q${efectivo.toFixed(2)} | Cambio: Q${cambio.toFixed(2)}`
        : `Crédito procesado correctamente`}
    `;

    // ✅ Guardar automáticamente el PDF en disco (sin abrirlo)
    if (window.electronAPI && window.electronAPI.descargarPDF) {
      window.electronAPI.descargarPDF(`/facturas/${facturaId}/pdf`)
        .then(res => {
          if (!res?.success) {
            console.warn('No se pudo guardar automáticamente el PDF:', res?.error);
          }
        })
        .catch(err => console.warn('Error guardando PDF automático:', err));
    }


    // ✅ Limpiar carrito y campos
    state.carrito = [];
    renderCarrito();
    cargarProductos();
    if (el('efectivoRecibido')) el('efectivoRecibido').value = '';
    if (el('abonoCredito')) el('abonoCredito').value = '';
    el('clienteInput').value = '';
    el('clienteId').value = '';
    el('search')?.focus();

     // 🔄 👉 AQUÍ: recargar la tabla de Ingresos y Egresos
    if (typeof cargarMovimientosFinancieros === 'function') {
      cargarMovimientosFinancieros();
    }

    // 📄 Mostrar botón para abrir PDF generado
    btnAbrirPDF.style.display = 'block';
   btnAbrirPDF.onclick = () => {
  abrirFacturaPDF(`/facturas/${facturaId}/ticket`);
};

// 📄 Mostrar botón para re-imprimir ticket
btnAbrirPDF.style.display = 'block';
btnAbrirPDF.textContent = '🧾 Re-imprimir ticket';

btnAbrirPDF.onclick = () => {
  abrirFacturaPDF(`/facturas/${facturaId}/pdf`); // si querés abrir PDF normal
};

// imprimir ticket térmico
if (window.electronAPI?.imprimirPDF) {
  window.electronAPI.imprimirPDF(`/facturas/${facturaId}/ticket`);
}


  } catch (err) {
    console.error('Error facturando:', err);
    errorDiv.textContent = '❌ Ocurrió un error al crear la factura.';
  }
}


// =========================================
// 🗑 ELIMINAR PRODUCTO (NUEVA LÓGICA CON MODAL)
// =========================================
let _productoAEliminar = null;

function abrirModalEliminarProducto(id, nombre) {
  // 🚫 Validar permiso para eliminar productos
  const permitirProductos = localStorage.getItem(CONFIG_KEYS.ELIMINAR_PRODUCTOS) === 'true';
  if (!permitirProductos) {
    if (typeof mostrarToast === 'function') {
      mostrarToast('La eliminación de productos está desactivada ', 'warning');
    }
    return;
  }

  _productoAEliminar = id;
  const nameSpan = document.getElementById('deleteProductName');
  if (nameSpan) nameSpan.textContent = nombre || `ID ${id}`;

  const modalEl = document.getElementById('confirmDeleteModal');
  if (!modalEl) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function abrirModalEliminarCliente(id, nombre) {
  // Validar permiso
  const permitirClientes = localStorage.getItem(CONFIG_KEYS.ELIMINAR_CLIENTES) === 'true';
  if (!permitirClientes) {
    mostrarToast('La eliminación de clientes está desactivada ⚠️', 'warning');
    return;
  }

  // Guardar ID de cliente
  _clienteAEliminar = id;
  _productoAEliminar = null; // Aseguramos que no hay un producto activo

  // Cambiar texto del modal
  const nameSpan = document.getElementById('deleteProductName');
  if (nameSpan) nameSpan.textContent = nombre || `Cliente ID ${id}`;

  const modalEl = document.getElementById('confirmDeleteModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}



async function confirmarEliminar() {
  try {
    // ✅ Si estamos eliminando un producto
    if (_productoAEliminar) {
      const res = await fetch(`${BASE}/productos/${_productoAEliminar}`, { method: 'DELETE' });
      if (!res.ok) {
        mostrarToast('No se pudo marcar el producto como inactivo.', 'danger');
        return;
      }
      await cargarProductos();
      mostrarToast('Producto marcado como inactivo ✅', 'success');

    }

    // ✅ Si estamos eliminando un cliente
    if (_clienteAEliminar) {
      const res = await fetch(`${BASE}/clientes/${_clienteAEliminar}`, { method: 'DELETE' });
      if (!res.ok) {
        mostrarToast('No se pudo eliminar el cliente.', 'danger');
        return;
      }
      await cargarClientes();
      mostrarToast('Cliente eliminado correctamente ✅', 'success');
    }

  } catch (err) {
    mostrarToast('Ocurrió un error al eliminar.', 'danger');
  } finally {
    // Reset variables
    _productoAEliminar = null;
    _clienteAEliminar = null;
    cerrarModalEliminarProducto();
  }
}

async function reactivarProducto(id) {
  try {
    const res = await fetch(`${BASE}/productos/${id}/reactivar`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Error al reactivar');

    await cargarProductos();
    mostrarToast('Producto reactivado correctamente ✅', 'success');
  } catch (e) {
    mostrarToast('No se pudo reactivar el producto ❌', 'danger');
  }
}



function cerrarModalEliminarProducto() {
  const modalEl = document.getElementById('confirmDeleteModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.hide();
}

function cargarEdicionProducto(producto) {
  productoEnEdicion = producto; // Guardamos el producto actual

  // Llenamos los campos del modal
  el('editProductId').value = producto.id;
  el('editProductName').value = producto.nombre;
  el('editProductCost').value = producto.costoCompra;
  el('editProductPrice').value = producto.precioVenta;
  el('editProductCurrentStock').value = producto.stock;
  el('editProductAddStock').value = 0;
  el('editProductBarcode').value = producto.barcode || ''; // ✅ NUEVO

  // Abrimos el modal
  const modalEl = document.getElementById('editProductModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

async function guardarCambiosProducto() {
  if (!productoEnEdicion) return;

  const id = el('editProductId').value;
  const nombre = el('editProductName').value;
  const costoCompra = parseFloat(el('editProductCost').value);
  const precioVenta = parseFloat(el('editProductPrice').value);
  const stockExtra = parseInt(el('editProductAddStock').value) || 0;
  const barcode = el('editProductBarcode')?.value?.trim() || null;

  try {
    // ✅ Enviar actualización al backend
    const res = await fetch(`${BASE}/productos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, costoCompra, precioVenta, stockExtra, barcode })
    });

    if (!res.ok) throw new Error('Error al actualizar producto');

    mostrarToast('Producto actualizado correctamente.', 'success');

    // Recargar productos
    await cargarProductos();

    // Cerrar modal
    const modalEl = document.getElementById('editProductModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

  } catch (err) {
    mostrarToast('No se pudo actualizar el producto.', 'danger');
    console.error(err);
  }
}



function abrirFacturaPDF(urlFactura) {
  console.log("🟢 Llamando a abrirFacturaPDF con:", urlFactura);
  if (window.electronAPI && window.electronAPI.abrirPDF) {
    return window.electronAPI.abrirPDF(urlFactura).then(res => {
      console.log("📄 Respuesta de IPC:", res);
    });
  } else {
    console.error('❌ electronAPI no está disponible.');
  }
}

function generarCierrePDF() {
  const desde = document.getElementById('cierreDesde')?.value || '';
  const hasta = document.getElementById('cierreHasta')?.value || '';

  const params = new URLSearchParams();
  if (desde) params.append('desde', desde);
  if (hasta) params.append('hasta', hasta);

  const url = `/finanzas/cierre/pdf${params.toString() ? `?${params.toString()}` : ''}`;

  console.log('🧾 Generando cierre de caja con URL:', url);
  abrirFacturaPDF(url);   // 👈 usa la misma lógica que para facturas
}



// =========================================
// 📦 CREAR PRODUCTO
// =========================================
async function crearProducto() {
  const nombre = el('prodNombre').value?.trim();
  const costoCompra = el('prodCosto').value;
  const precioVenta = el('prodPrecio').value;
  const stock = el('prodStock').value;

  // ✅ NUEVO
  const barcode = el('prodBarcode')?.value?.trim() || null;

  try {
    await fetch(`${BASE}/productos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, costoCompra, precioVenta, stock, barcode })
    });

    await cargarProductos();

    el('prodNombre').value = '';
    el('prodCosto').value = '';
    el('prodPrecio').value = '';
    el('prodStock').value = '';
    if (el('prodBarcode')) el('prodBarcode').value = ''; // ✅ NUEVO
  } catch (e) {
    console.error('Error creando producto:', e);
  }
}

// =========================================
// 👤 CLIENTES (CRUD SIMPLE - Solo creación/listado)
// =========================================
async function crearCliente() {
  const nombre = el('cliNombre').value;
  const telefono = el('cliTelefono').value;
  const nit = el('cliNit').value;
  const direccion = el('cliDireccion').value;

  if (!nombre) {
    mostrarToast('El nombre del cliente es obligatorio.', 'warning');
    return;
  }

  try {
    await fetch(`${BASE}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, telefono, nit, direccion })
    });

    await cargarClientes();

    // Limpiar formulario
    el('cliNombre').value = '';
    el('cliTelefono').value = '';
    el('cliNit').value = '';
    el('cliDireccion').value = '';
  } catch (e) {
    console.error('Error creando cliente:', e);
  }
}

async function cargarClientes() {
  try {
    const res = await fetch(`${BASE}/clientes`);
    state.clientes = await res.json();
    renderClientes();
  } catch (e) {
    console.error('Error cargando clientes:', e);
  }
}

// =========================================
// 🔍 AUTOCOMPLETAR CLIENTE (NOMBRE/NIT)
// =========================================

function setupClienteAutocomplete() {
  const input = el('clienteInput');
  const lista = el('clienteSugerencias');
  const hiddenId = el('clienteId');

  if (!input || !lista || !hiddenId) return;

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    lista.innerHTML = '';
    lista.style.display = 'none';
    hiddenId.value = ''; // Se limpia selección previa

    if (!query) return;

    // Buscar coincidencias en clientes existentes
    const coincidencias = state.clientes.filter(c =>
      c.nombre.toLowerCase().includes(query) ||
      (c.nit && c.nit.toLowerCase().includes(query))
    );

    if (coincidencias.length > 0) {
      coincidencias.forEach(c => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action';
        li.textContent = `${c.nombre} (${c.nit || 'C/F'})`;
        li.addEventListener('click', () => {
          input.value = `${c.nombre} (${c.nit || 'C/F'})`;
          hiddenId.value = c.id;
          lista.style.display = 'none';
        });
        lista.appendChild(li);
      });
    }

    // Opción para crear nuevo cliente
    const liNuevo = document.createElement('li');
    liNuevo.className = 'list-group-item list-group-item-action text-primary';
    liNuevo.innerHTML = `➕ Crear nuevo cliente con: <strong>${query}</strong>`;
    liNuevo.addEventListener('click', () => {
      lista.style.display = 'none';
      input.value = query;
      hiddenId.value = '';
      abrirModalNuevoCliente(query); // Llamaremos al modal en el siguiente paso
    });
    lista.appendChild(liNuevo);

    lista.style.display = 'block';
  });

  // Ocultar lista al salir del campo
  input.addEventListener('blur', () => {
    setTimeout(() => {
      lista.style.display = 'none';
    }, 200);
  });
}


function renderClientes() {
  const tbody = el('clientesBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  state.clientes.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.nombre}</td>
      <td>${c.telefono || '-'}</td>
      <td>${c.nit || '-'}</td>
      <td>${c.direccion || '-'}</td>
      <td class="text-center">
        <button class="btn btn-danger btn-sm" onclick="abrirModalEliminarCliente(${c.id}, '${c.nombre}')">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function eliminarCliente(id) {
  if (!confirm('¿Seguro de eliminar este cliente?')) return;
  try {
    await fetch(`${BASE}/clientes/${id}`, { method: 'DELETE' });
    await cargarClientes();
  } catch (e) {
    console.error('Error eliminando cliente:', e);
  }
}

document.getElementById('creditos-tab').addEventListener('click', cargarCreditos);
document.getElementById('filtroEstado').addEventListener('change', cargarCreditos);


async function cargarCreditos() {
  const tbody = document.getElementById('tablaCreditosBody');
  const filtroEstado = document.getElementById('filtroEstado').value;
  const resumenDiv = document.getElementById('resumenCreditos');

  tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Cargando...</td></tr>`;

  try {
    // ✅ Primero obtenemos los datos
    const res = await fetch(`${BASE}/cuentas`);
    const cuentas = await res.json();

    if (!Array.isArray(cuentas)) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: formato de datos inválido</td></tr>`;
      return;
    }

    // ✅ Filtros combinados: estado + cliente
let cuentasFiltradas = cuentas;
const filtroCliente = document.getElementById('filtroCliente')?.value.trim().toLowerCase() || "";

if (filtroEstado !== "todos") {
  cuentasFiltradas = cuentasFiltradas.filter(c => c.estado === filtroEstado);
}

if (filtroCliente !== "") {
  cuentasFiltradas = cuentasFiltradas.filter(c => {
    const nombre = (c.Cliente?.nombre || "").toLowerCase();
    const direccion = (c.Cliente?.direccion || "").toLowerCase();
    return nombre.includes(filtroCliente) || direccion.includes(filtroCliente);
  });
}



    // ✅ Mostrar tabla
    if (!cuentasFiltradas.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No hay cuentas en este estado</td></tr>`;
    } else {
      tbody.innerHTML = cuentasFiltradas.map(cuenta => {
        const total = Number(cuenta.totalFactura || 0).toFixed(2);
        const saldo = Number(cuenta.saldoPendiente || 0).toFixed(2);
        const abonado = (total - saldo).toFixed(2);
        const fechaAbono = new Date(cuenta.updatedAt).toLocaleDateString() + ' ' + new Date(cuenta.updatedAt).toLocaleTimeString();

        const estadoBadge =
          cuenta.estado === 'pendiente' ? `<span class="badge bg-danger">Pendiente</span>` :
          cuenta.estado === 'parcial' ? `<span class="badge bg-warning text-dark">Parcial</span>` :
          `<span class="badge bg-success">Pagado</span>`;

        return `
          <tr>
            <td>#${cuenta.Factura?.id || '---'}</td>
            <td>${cuenta.Cliente?.nombre || 'Sin cliente'}</td>
            <td class="text-end">Q${total}</td>
            <td class="text-end">Q${abonado}</td>
            <td class="text-end">Q${saldo}</td>
            <td>${fechaAbono}</td>
            <td>${estadoBadge}</td>
            <td class="d-flex gap-2">
              <button class="btn btn-sm btn-primary" onclick="abrirAbonoModal(${cuenta.id}, '${saldo}')" ${saldo <= 0 ? 'disabled' : ''}>
                Abonar
              </button>
              <button class="btn btn-sm btn-outline-secondary" onclick="verHistorialAbonos(${cuenta.Factura?.id})">
                Historial
              </button>
            </td>
          </tr>`;
      }).join('');
    }

    // ✅ Después de recibir los datos, calculamos el resumen
    const pendientes = cuentas.filter(c => c.estado === 'pendiente');
    const parciales = cuentas.filter(c => c.estado === 'parcial');
    const pagados = cuentas.filter(c => c.estado === 'pagado');

    const totalPendienteQ = pendientes.reduce((sum, c) => sum + c.saldoPendiente, 0);
    const totalParcialQ = parciales.reduce((sum, c) => sum + c.saldoPendiente, 0);
    const totalAbonadoQ = cuentas.reduce((sum, c) => sum + (c.totalFactura - c.saldoPendiente), 0);
    const totalGeneralPendienteQ = totalPendienteQ + totalParcialQ;

    resumenDiv.innerHTML = `
      <div class="col-12 col-md-2 text-center bg-light p-2 rounded border">
        <strong>🔴 Pendientes:</strong><br>${pendientes.length} (Q${totalPendienteQ.toFixed(2)})
      </div>
      <div class="col-12 col-md-2 text-center bg-light p-2 rounded border">
        <strong>🟡 Parciales:</strong><br>${parciales.length} (Q${totalParcialQ.toFixed(2)})
      </div>
      <div class="col-12 col-md-2 text-center bg-light p-2 rounded border">
        <strong>🟢 Pagados:</strong><br>${pagados.length}
      </div>
      <div class="col-12 col-md-3 text-center bg-light p-2 rounded border">
        <strong>💰 Total pendiente:</strong><br>Q${totalGeneralPendienteQ.toFixed(2)}
      </div>
      <div class="col-12 col-md-3 text-center bg-light p-2 rounded border">
        <strong>📥 Total abonado:</strong><br>Q${totalAbonadoQ.toFixed(2)}
      </div>
    `;

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error cargando datos</td></tr>`;
  }
}


function abrirAbonoModal(cuentaId, saldo) {
  document.getElementById('cuentaAbonoId').value = cuentaId;
  document.getElementById('saldoPendienteTexto').innerText = `Q${parseFloat(saldo).toFixed(2)}`;
  document.getElementById('montoAbono').value = ""; // Limpiar campo anterior
  const modal = new bootstrap.Modal(document.getElementById('abonoModal'));
  modal.show();
}


async function guardarAbono() {
  const cuentaId = document.getElementById('cuentaAbonoId').value;
  const monto = parseFloat(document.getElementById('montoAbono').value);
  const saldoText = document.getElementById('saldoPendienteTexto').innerText.replace('Q', '');
  const saldoPendiente = parseFloat(saldoText);

  if (!monto || monto <= 0) {
    mostrarToast('Ingrese un monto válido', 'warning');
    return;
  }

  // ✅ Validación frontend: no permitir abonos mayores al saldo
  if (monto > saldoPendiente) {
    mostrarToast('❌ El abono no puede ser mayor al saldo pendiente.', 'danger');
    return;
  }

  try {
    const response = await fetch(`${BASE}/cuentas/abonar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuentaId, monto })
    });

    const data = await response.json();

    if (!response.ok) {
      mostrarToast(data.error || 'Error al registrar el abono', 'danger');
      return;
    }

    mostrarToast('✅ Abono registrado correctamente', 'success');
    
    // Cerrar modal y refrescar créditos
    bootstrap.Modal.getInstance(document.getElementById('abonoModal')).hide();
    cargarCreditos();

  } catch (error) {
    console.error('Error:', error);
    mostrarToast('Error al procesar el abono', 'danger');
  }
}


async function verHistorialAbonos(facturaId) {
  const tbody = document.getElementById('historialAbonoBody');
  tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Cargando...</td></tr>`;

  try {
    const res = await fetch(`${BASE}/finanzas?facturaId=${facturaId}`);
    const movimientos = await res.json();

    if (!movimientos.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No hay abonos registrados</td></tr>`;
      return;
    }

    tbody.innerHTML = movimientos.map(mov => {
      const fecha = new Date(mov.createdAt).toLocaleDateString() + ' ' + new Date(mov.createdAt).toLocaleTimeString();
      return `
        <tr>
          <td>Q${parseFloat(mov.monto).toFixed(2)}</td>
          <td>${mov.descripcion || 'Sin descripción'}</td>
          <td>${fecha}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Error cargando historial</td></tr>`;
  }

  const modal = new bootstrap.Modal(document.getElementById('historialAbonoModal'));
  modal.show();
}


// =========================================
// 💰 FINANZAS: INGRESOS / EGRESOS
// =========================================

// 🔹 Devuelve los movimientos filtrados por tipo, rango de fechas y texto
function obtenerMovimientosFiltrados() {
  const filtroTipo   = document.getElementById('filtroTipoMov')?.value || 'todos';
  const filtroTexto  = (document.getElementById('filtroBuscarMov')?.value || '').toLowerCase();
  const desdeStr     = document.getElementById('filtroFechaDesde')?.value || '';
  const hastaStr     = document.getElementById('filtroFechaHasta')?.value || '';

  const desde = desdeStr ? new Date(desdeStr + 'T00:00:00') : null;
  const hasta = hastaStr ? new Date(hastaStr + 'T23:59:59') : null;

  return (state.movimientosFinancieros || []).filter(m => {
    const fecha = new Date(m.createdAt);

    // Tipo
    if (filtroTipo === 'solo_ingresos' && m.tipo !== 'ingreso') return false;
    if (filtroTipo === 'solo_egresos' && m.tipo !== 'egreso') return false;

    // Rango de fechas
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;

    // Texto
    if (filtroTexto) {
      const texto = `${m.descripcion || ''} ${m.tipo || ''} ${m.monto || ''}`.toLowerCase();
      if (!texto.includes(filtroTexto)) return false;
    }

    return true;
  });
}


  function renderMovimientosFinancieros() {
  const tbody = document.getElementById('finanzasBody');
  if (!tbody) return;

  const movimientosFiltrados = obtenerMovimientosFiltrados();

  if (!movimientosFiltrados.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">
          No hay movimientos que coincidan con los filtros
        </td>
      </tr>
    `;
    renderResumenFinanciero([]);
    return;
  }

  // ✅ Render con "data-factura-id"
  tbody.innerHTML = movimientosFiltrados.map(m => {
    const fecha = new Date(m.createdAt);
    const textoFecha = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString();
    const esIngreso = m.tipo === 'ingreso';
    const signo = esIngreso ? '+' : '-';

    const facturaIdAttr = m.facturaId ? `data-factura-id="${m.facturaId}"` : '';
    const claseClick = m.facturaId ? 'row-factura' : '';

    return `
      <tr ${facturaIdAttr} class="${claseClick}" style="${m.facturaId ? 'cursor:pointer;' : ''}">
        <td>${esIngreso ? 'Ingreso' : 'Egreso'}</td>
        <td class="text-end ${esIngreso ? 'text-success' : 'text-danger'}">
          ${signo}Q${Number(m.monto || 0).toFixed(2)}
        </td>
        <td>${String(m.descripcion || m.origen || '').replaceAll('<','&lt;').replaceAll('>','&gt;')}</td>
        <td class="text-end">${textoFecha}</td>
      </tr>
    `;
  }).join('');

  // ✅ Agregar eventos click después de pintar
  tbody.querySelectorAll('tr[data-factura-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      const facturaId = tr.getAttribute('data-factura-id');
      if (!facturaId) return;
      abrirDetalleFacturaModal(facturaId);
    });
  });

  renderResumenFinanciero(movimientosFiltrados);
}


// 🔹 Carga desde el backend y guarda en state.movimientosFinancieros
async function cargarMovimientosFinancieros() {
  const tbody = document.getElementById('finanzasBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr><td colspan="4" class="text-center text-muted">Cargando...</td></tr>
    `;
  }

  try {
    const res = await fetch(`${BASE}/finanzas`);
    const movimientos = await res.json();

    state.movimientosFinancieros = Array.isArray(movimientos) ? movimientos : [];
    renderMovimientosFinancieros();   // 👈 ahora usamos esta función

  } catch (err) {
    console.error('Error cargando movimientos:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="4" class="text-center text-danger">Error cargando movimientos</td></tr>
      `;
    }
    renderResumenFinanciero([]);
  }
}

// 🔹 Resumen (ingresos, egresos y saldo)
function renderResumenFinanciero(movimientos) {
  const resumenDiv = document.getElementById('resumenFinanciero');
  if (!resumenDiv) return;

  let totalIngresos = 0;
  let totalEgresos = 0;

  (movimientos || []).forEach(m => {
    const monto = Number(m.monto || 0);
    if (m.tipo === 'ingreso') totalIngresos += monto;
    else if (m.tipo === 'egreso') totalEgresos += monto;
  });

  const saldo = totalIngresos - totalEgresos;

  resumenDiv.innerHTML = `
    <div class="col-12 col-md-4 text-center bg-light p-2 rounded border">
      <strong>💵 Total ingresos:</strong><br>Q${totalIngresos.toFixed(2)}
    </div>
    <div class="col-12 col-md-4 text-center bg-light p-2 rounded border">
      <strong>💸 Total egresos:</strong><br>Q${totalEgresos.toFixed(2)}
    </div>
    <div class="col-12 col-md-4 text-center bg-light p-2 rounded border">
      <strong>🧾 Saldo:</strong><br>Q${saldo.toFixed(2)}
    </div>
  `;
}

// 🔹 Guardar movimiento manual (Farmacia, pago de luz, etc.)
async function guardarMovimientoFinanciero() {
  const tipo = document.getElementById('movTipo')?.value;
  const monto = parseFloat(document.getElementById('movMonto')?.value || '0');
  const descripcion = document.getElementById('movDescripcion')?.value || '';

  if (!tipo || !['ingreso', 'egreso'].includes(tipo)) {
    mostrarToast('Seleccione un tipo de movimiento válido', 'warning');
    return;
  }
  if (!monto || monto <= 0) {
    mostrarToast('Ingrese un monto válido', 'warning');
    return;
  }

  try {
    const res = await fetch(`${BASE}/finanzas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, monto, descripcion })
    });

    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error || 'Error al guardar movimiento', 'danger');
      return;
    }

    mostrarToast('Movimiento guardado correctamente ✅', 'success');

    // Limpiar campos
    document.getElementById('movMonto').value = '';
    document.getElementById('movDescripcion').value = '';

    // Recargar lista y resumen
    cargarMovimientosFinancieros();

  } catch (err) {
    console.error('Error guardando movimiento:', err);
    mostrarToast('Error al guardar movimiento', 'danger');
  }
}

function byId(id) { return document.getElementById(id); }
function Q(n) { return `Q${Number(n || 0).toFixed(2)}`; }

async function abrirDetalleFacturaModal(facturaId) {
  // Reset UI
  byId('df_error').style.display = 'none';
  byId('df_error').textContent = '';
  byId('df_numero').textContent = `#${facturaId}`;
  byId('df_fecha').textContent = '—';
  byId('df_pago').textContent = '—';
  byId('df_cliente').textContent = '—';
  byId('df_total').textContent = 'Q0.00';
  byId('df_body').innerHTML = `<tr><td colspan="4" class="text-center text-muted">Cargando...</td></tr>`;

  // Abrir modal
  const modalEl = byId('detalleFacturaModal');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();

  try {
    const res = await fetch(`${BASE}/facturas/${facturaId}`);
    const factura = await res.json();

    if (!res.ok) throw new Error(factura?.error || 'No se pudo cargar la factura');

    // Header
    byId('df_numero').textContent = `INT-${String(factura.id).padStart(4, '0')}`;
    byId('df_fecha').textContent = new Date(factura.createdAt).toLocaleString();
    byId('df_pago').textContent = (factura.tipoPago || 'contado').toUpperCase();
    byId('df_cliente').textContent = factura.Cliente?.nombre || 'Mostrador';
    byId('df_total').textContent = Q(factura.total);

    // Detalles
    const detalles = factura.FacturaDetalles || [];
    if (!detalles.length) {
      byId('df_body').innerHTML = `<tr><td colspan="4" class="text-center text-muted">Sin productos</td></tr>`;
    } else {
      byId('df_body').innerHTML = detalles.map(d => {
        const cant = Number(d.cantidad || 0);
        const nombre = d.Producto?.nombre || 'N/D';
        const pu = Number((d.precioUnitario ?? d.precio ?? d.Producto?.precioVenta) || 0);
        const sub = cant * pu;

        return `
          <tr>
            <td>${escapeHtml(nombre)}</td>
            <td class="text-end">${cant}</td>
            <td class="text-end">${Q(pu)}</td>
            <td class="text-end">${Q(sub)}</td>
          </tr>
        `;
      }).join('');
    }

    // Botones
    byId('df_btnTicket').onclick = () => abrirFacturaPDF(`/facturas/${facturaId}/ticket`);
    byId('df_btnPDF').onclick = () => abrirFacturaPDF(`/facturas/${facturaId}/pdf`);

  } catch (err) {
    byId('df_error').style.display = 'block';
    byId('df_error').textContent = err.message;
    byId('df_body').innerHTML = `<tr><td colspan="4" class="text-center text-muted">Error</td></tr>`;
  }
}

// =========================================
// 📅 HISTORIAL INVENTARIO
// =========================================
async function cargarHistorial() {
  try {
    const res = await fetch(`${BASE}/historial`);
    state.historial = await res.json();
    renderHistorial();
  } catch (e) {
    console.error('Error cargando historial:', e);
  }
}

function renderHistorial() {
  const tbody = el('historialBody');
  if (!tbody) return;

  // ⚙️ Normalizar filtros
  const rawProductoSel = el('filtroProductoHistorial')?.value ?? '';
  const filtroProductoId = rawProductoSel.trim() === '' ? null : parseInt(rawProductoSel, 10);

  const filtroTipo = (el('filtroTipoHistorial')?.value || '').toLowerCase();
  const filtroTexto = (el('buscarHistorial')?.value || '').toLowerCase();

  tbody.innerHTML = '';

  // ✅ Procesar filtro
  const rows = state.historial.filter(h => {
    const idMovimiento = (h.Producto?.id != null) ? h.Producto.id
                      : (h.productoId != null) ? h.productoId
                      : null;

    const productoCoincide = (filtroProductoId == null) || (idMovimiento === filtroProductoId);
    const tipoMovimiento = (h.tipo || '').toLowerCase();
    const tipoCoincide = (filtroTipo === '') || (tipoMovimiento === filtroTipo);
    const nombreProd = (h.Producto?.nombre || h.productoNombre || '').toLowerCase();
    const textoCoincide = (filtroTexto === '') || nombreProd.includes(filtroTexto);

    return productoCoincide && tipoCoincide && textoCoincide;
  });

  // ✅ Si no hay resultados, mostrar mensaje
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="5" class="text-center text-muted py-3">
        No hay movimientos que coincidan con los filtros aplicados
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  // ✅ Renderizar filas cuando hay datos
  rows.forEach(h => {
    const esEntrada = (h.tipo || '').toLowerCase() === 'entrada';
    const movimiento = esEntrada ? 'Entrada' : 'Venta';
    const cantidadFormateada = (esEntrada ? '+' : '-') + Math.abs(h.cantidad);
    const claseCantidad = esEntrada ? 'text-success' : 'text-danger';
    const fecha = new Date(h.createdAt || h.fechaIngreso).toLocaleString();

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.Producto?.nombre || 'N/A'}</td>
      <td>${movimiento}</td>
      <td class="text-end ${claseCantidad}">${cantidadFormateada}</td>
      <td class="text-end">${h.stockFinal ?? '-'}</td>
      <td class="text-end">${fecha}</td>
    `;
    tbody.appendChild(tr);
  });
}


function llenarFiltroHistorialProductos() {
  const select = el('filtroProductoHistorial');
  if (!select) return;

  // Limpiar y añadir opción "Todos"
  select.innerHTML = '<option value="">Todos los productos</option>';

  // Agregar productos activos e inactivos
  state.productos.forEach(p => {
    const option = document.createElement('option');
    option.value = String (p.id);
    option.textContent = p.nombre;
    select.appendChild(option);
  });
}

// =========================================
// 🚚 RUTAS - SALIDA DE CAMIÓN
// =========================================

let rutaActualId = null; // para saber cuál fue la última ruta (para imprimir)

function renderProductosRuta() {
  const tbody = document.getElementById('rutasProductosBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  state.productos.forEach(p => {
    if (p.activo === false) return;

    const precio = Number(p.precioVenta || 0);
    const unidad = p.unidad || 'UND';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input
          type="number"
          min="0"
          max="${p.stock}"
          value="0"
          class="form-control form-control-sm text-end input-salida-ruta"
          data-producto-id="${p.id}"
          data-precio="${precio}"
        >
      </td>
      <td>${p.nombre}</td>
      <td class="text-center">${unidad}</td>
      <td class="text-end">Q <span class="precio-ruta">${precio.toFixed(2)}</span></td>
      <td class="text-end">Q <span class="total-ruta">0.00</span></td>
    `;
    tbody.appendChild(tr);
  });

  // eventos para recalcular totales al escribir cantidades
  document.querySelectorAll('.input-salida-ruta').forEach(input => {
    input.addEventListener('input', actualizarTotalFilaRuta);
  });

  actualizarTotalGeneralRuta();
}

function actualizarTotalFilaRuta(e) {
  const input = e.target;
  let cantidad = Number(input.value || 0);
  if (cantidad < 0) cantidad = 0;

  const precio = Number(input.dataset.precio || 0);

  const tr = input.closest('tr');
  const totalSpan = tr.querySelector('.total-ruta');
  const total = cantidad * precio;
  totalSpan.textContent = total.toFixed(2);

  actualizarTotalGeneralRuta();
}

function actualizarTotalGeneralRuta() {
  let suma = 0;
  document.querySelectorAll('.total-ruta').forEach(span => {
    const v = Number(span.textContent.replace(',', '') || 0);
    suma += v;
  });

  const lbl = document.getElementById('rutaTotalGeneral');
  if (lbl) lbl.textContent = suma.toFixed(2);
}



async function crearRuta() {
  console.log('crearRuta() llamado');

  const fecha       = document.getElementById('rutaFecha')?.value;
  const nombre      = document.getElementById('rutaNombre')?.value.trim();
  const direccion   = document.getElementById('rutaDireccion')?.value.trim();
  const piloto      = document.getElementById('rutaPiloto')?.value.trim();
  const licencia    = document.getElementById('rutaLicencia')?.value.trim();
  const condicion   = document.getElementById('rutaCondicion')?.value.trim();
  const placa       = document.getElementById('rutaPlaca')?.value.trim();
  const mensajeDiv  = document.getElementById('rutasMensaje');

  if (!fecha || !nombre) {
    mostrarToast('La fecha y el nombre son obligatorios para la ruta', 'warning');
    return;
  }

  // Leer cantidades
  const inputs = document.querySelectorAll('.input-salida-ruta');
  const productos = [];
  inputs.forEach(input => {
    const cant = parseInt(input.value || '0', 10);
    const productoId = parseInt(input.getAttribute('data-producto-id'), 10);
    if (cant > 0 && Number.isFinite(productoId)) {
      productos.push({ productoId, cantidadSalida: cant });
    }
  });

  if (productos.length === 0) {
    mostrarToast('No has indicado ninguna cantidad para sacar a ruta', 'warning');
    return;
  }

  try {
    const res = await fetch(`${BASE}/rutas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha,
        nombre,
        direccion,
        piloto,
        licencia,
        condicion,
        placa,
        productos
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Error HTTP en crearRuta:', res.status, txt);
      mostrarToast('Error creando la ruta', 'danger');
      return;
    }

    const data = await res.json();
    rutaActualId = data.rutaId || data.id || null;

    mostrarToast('Ruta registrada correctamente ✅', 'success');
    await refrescarRutasUI();
    await cargarRutasDevolucion();
await cargarRutasParaImprimir();



    // limpiar cantidades
    document.querySelectorAll('.input-salida-ruta').forEach(input => {
      input.value = '0';
    });
    document.querySelectorAll('.total-ruta').forEach(span => {
      span.textContent = '0.00';
    });
    actualizarTotalGeneralRuta();

    await cargarProductos();
    renderProductosRuta();

    const btnImprimir = document.getElementById('btnImprimirRuta');
    if (btnImprimir && rutaActualId) btnImprimir.disabled = false;

    if (mensajeDiv) {
      mensajeDiv.textContent = `Última ruta guardada: #${rutaActualId} - Nombre: ${nombre}`;
    }

  } catch (err) {
    console.error(err);
    mostrarToast('Error al guardar la ruta', 'danger');
  }
}



function imprimirRuta() {
  if (!rutaActualId) {
    mostrarToast('Primero guarda una ruta para poder imprimirla', 'warning');
    return;
  }

  const url = `/rutas/${rutaActualId}/pdf`;

  // Reutilizamos tu función abrirFacturaPDF (abre y descarga PDF)
  if (typeof abrirFacturaPDF === 'function') {
    abrirFacturaPDF(url);
  } else if (window.electronAPI && window.electronAPI.abrirPDF) {
    window.electronAPI.abrirPDF(url);
  } else {
    console.error('No hay método configurado para abrir PDFs');
  }
}

// =========================================
// 🚚 DEVOLUCIÓN DE RUTA
// =========================================

async function cargarRutasDevolucion() {
  const select = document.getElementById('selectRutaDevolucion');
  if (!select) return;

  try {
    const res = await fetch(`${BASE}/rutas`, {
      headers: { 'Accept': 'application/json' }
    });

    const text = await res.text(); // 👈 leer como texto primero

    if (!res.ok) {
      console.error('GET /rutas falló:', res.status, text);
      return;
    }

    let rutas;
    try {
      rutas = JSON.parse(text);
    } catch (e) {
      console.error('GET /rutas NO devolvió JSON. Respuesta:', text);
      return;
    }

    select.innerHTML = '<option value="">-- Seleccione una ruta --</option>';

    (rutas || []).forEach(r => {
      const fechaStr = r.fecha ? new Date(r.fecha).toLocaleDateString() : '';
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `Ruta #${r.id} - ${fechaStr} - ${r.piloto || ''}`;
      select.appendChild(opt);
    });

  } catch (err) {
    console.error('Error cargando rutas:', err);
  }
}


// Cargar detalles de la ruta seleccionada
async function cargarDetallesRutaDevolucion() {
  const select = document.getElementById('selectRutaDevolucion');
  const rutaId = select?.value;
  const tbody = document.getElementById('rutasDevolucionBody');
  const info = document.getElementById('infoRutaDevolucion');
  const btnGuardar = document.getElementById('btnGuardarDevolucionRuta');

  if (!tbody) return;

  tbody.innerHTML = '';
  if (info) info.textContent = '';
  if (btnGuardar) btnGuardar.disabled = true;

  if (!rutaId) return;

  try {
    const res = await fetch(`${BASE}/rutas/${rutaId}`);
    const ruta = await res.json();

    if (!res.ok || !ruta) {
      console.error('Error cargando ruta:', ruta);
      return;
    }

    if (info) {
      const fechaStr = ruta.fecha ? new Date(ruta.fecha).toLocaleDateString() : '';
      info.textContent = `Piloto: ${ruta.piloto || ''} | Vehículo: ${ruta.vehiculo || ''} | Fecha: ${fechaStr}`;
    }

    (ruta.DetallesRuta || []).forEach(det => {
      const salida = Number(det.cantidadSalida || 0);
      const devuelta = Number(det.cantidadDevuelta || 0);
      const vendido = salida - devuelta;

      const tr = document.createElement('tr');
      tr.dataset.detalleId = det.id;

      tr.innerHTML = `       
        <td>${det.ProductoRuta?.nombre || ''}</td>        
        <td class="text-end">${salida}</td>
        <td class="text-end">
          <input type="number"
                 min="0"
                 max="${salida}"
                 value="${devuelta}"
                 class="form-control form-control-sm text-end input-devuelta-ruta">
        </td>
        <td class="text-end col-vendido-ruta">${vendido}</td>
      `;

      // actualizar columna "Vendido" cuando cambie el input
      const input = tr.querySelector('.input-devuelta-ruta');
      input.addEventListener('input', () => {
        let val = Number(input.value || 0);
        if (val < 0) val = 0;
        if (val > salida) val = salida;
        const vendidoNuevo = salida - val;
        tr.querySelector('.col-vendido-ruta').textContent = vendidoNuevo;
      });

      tbody.appendChild(tr);
    });

    if (btnGuardar && (ruta.DetallesRuta || []).length > 0) {
      btnGuardar.disabled = false;
    }
  } catch (err) {
    console.error('Error cargando detalles de ruta:', err);
  }
}

// Guardar devolución
async function guardarDevolucionRuta() {
  const select = document.getElementById('selectRutaDevolucion');
  const rutaId = select?.value;
  if (!rutaId) {
    mostrarToast('Seleccione una ruta primero', 'warning');
    return;
  }

  const filas = document.querySelectorAll('#rutasDevolucionBody tr');
  const detalles = [];

  filas.forEach(tr => {
    const rutaDetalleId = Number(tr.dataset.detalleId);
    const input = tr.querySelector('.input-devuelta-ruta');
    let cantidadDevuelta = Number(input?.value || 0);
    if (!Number.isFinite(cantidadDevuelta) || cantidadDevuelta < 0) {
      cantidadDevuelta = 0;
    }
    detalles.push({ rutaDetalleId, cantidadDevuelta });
  });

  try {
    const res = await fetch(`${BASE}/rutas/${rutaId}/devolucion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detalles })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Error devolucion ruta:', data);
      mostrarToast(data.error || 'Error guardando devolución', 'danger');
      return;
    }

    mostrarToast('Devolución guardada correctamente ✅', 'success');
    await refrescarRutasUI();


    // Actualizar stock en pantalla y refrescar detalles
    await cargarProductos();
    await cargarDetallesRutaDevolucion();

  } catch (err) {
    console.error('Error guardando devolución de ruta:', err);
    mostrarToast('Error guardando devolución', 'danger');
  }
}


let rutaImprimirId = null;


function imprimirRutaSeleccionada() {
  if (!rutaImprimirId) {
    mostrarToast('Seleccione una ruta para imprimir', 'warning');
    return;
  }

  const url = `/rutas/${rutaImprimirId}/pdf`;

  if (typeof abrirFacturaPDF === 'function') {
    abrirFacturaPDF(url);
  } else if (window.electronAPI && window.electronAPI.abrirPDF) {
    window.electronAPI.abrirPDF(url);
  } else {
    console.error('No hay método configurado para abrir PDFs');
    mostrarToast('No se pudo abrir el PDF', 'danger');
  }
}

// ============================
// DEVOLUCIONES RUTA - HISTORIAL (TABLA PLANA)
// ============================

async function cargarDevolucionesRutaFlat() {
  const desde = document.getElementById('devFiltroDesde').value;
  const hasta = document.getElementById('devFiltroHasta').value;
  const nombre = document.getElementById('devFiltroNombre').value.trim();
  const direccion = document.getElementById('devFiltroDireccion').value.trim();
  const vehiculo = document.getElementById('devFiltroVehiculo').value.trim();

  const params = new URLSearchParams();
  if (desde) params.append('desde', desde);
  if (hasta) params.append('hasta', hasta);
  if (nombre) params.append('nombre', nombre);
  if (direccion) params.append('direccion', direccion);
  if (vehiculo) params.append('vehiculo', vehiculo);

  const tbody = document.getElementById('tablaDevolucionesFlatBody');
  const resumen = document.getElementById('devResumen');

  tbody.innerHTML = `
    <tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>
  `;
  resumen.textContent = '';

  try {
    const res = await fetch(`${BASE}/rutas/devoluciones/resumen?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data?.error || 'Error en backend');

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="text-center text-muted">No hay devoluciones con esos filtros.</td></tr>
      `;
      resumen.textContent = '0 resultados';
      return;
    }

    resumen.textContent = `${data.length} resultado(s)`;

    tbody.innerHTML = data.map(r => {
      const total = Number(r.totalVendidoQ || 0).toFixed(2);

      return `
        <tr class="row-historial-ruta" data-ruta-id="${r.rutaId}" style="cursor:pointer;">
          <td>${r.fecha ?? ''}</td>
          <td>${escapeHtml(r.nombre ?? '')}</td>
          <td>${escapeHtml(r.direccion ?? '')}</td>
          <td>${escapeHtml(r.vehiculo ?? '')}</td>
          <td class="text-end fw-bold">Q${total}</td>
        </tr>
      `;
    }).join('');

    // click -> cargar detalle
    document.querySelectorAll('.row-historial-ruta').forEach(tr => {
      tr.addEventListener('click', async () => {
        const rutaId = tr.getAttribute('data-ruta-id');
        await cargarDetalleRutaParaEditar(rutaId);
      });
    });

  } catch (err) {
    console.error('Error obteniendo resumen devoluciones:', err);
    alert(`Error cargando historial: ${err.message}`);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error cargando historial.</td></tr>`;
  }
}

function limpiarFiltrosDevoluciones() {
  document.getElementById('devFiltroDesde').value = '';
  document.getElementById('devFiltroHasta').value = '';
  document.getElementById('devFiltroNombre').value = '';
  document.getElementById('devFiltroDireccion').value = '';
  document.getElementById('devFiltroVehiculo').value = '';

  document.getElementById('devResumen').textContent = '';
  document.getElementById('tablaDevolucionesFlatBody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-muted">
        Aún no has buscado devoluciones.
      </td>
    </tr>
  `;
}

// Utilidad para evitar inyección HTML en tablas
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Eventos
document.addEventListener('DOMContentLoaded', () => {
  const btnBuscar = document.getElementById('btnBuscarDevoluciones');
  const btnLimpiar = document.getElementById('btnLimpiarDevoluciones');

  if (btnBuscar) btnBuscar.addEventListener('click', cargarDevolucionesRutaFlat);
  if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltrosDevoluciones);

  // Buscar al presionar Enter en cualquier filtro
  ['devFiltroDesde','devFiltroHasta','devFiltroNombre','devFiltroDireccion','devFiltroVehiculo']
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cargarDevolucionesRutaFlat();
      });
    });
});

function q(v) {
  return `Q${Number(v || 0).toFixed(2)}`;
}

async function cargarDetalleRutaParaEditar(rutaId) {
  const card = document.getElementById('detalleRutaCard');
  const titulo = document.getElementById('detalleRutaTitulo');
  const tbody = document.getElementById('detalleRutaBody');
  const totalCell = document.getElementById('detalleRutaTotal');

  card.style.display = 'block';
  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Cargando...</td></tr>`;
  totalCell.textContent = 'Q0.00';

  try {
    const res = await fetch(`${BASE}/rutas/${rutaId}/detalle`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Error cargando detalle');

    const r = data.ruta;
    titulo.textContent = `Detalle ruta #${r.id} — ${r.fecha} — ${r.nombre} — ${r.vehiculo}`;

    let total = 0;

    tbody.innerHTML = data.items.map(item => {
      total += Number(item.total || 0);

      return `
        <tr data-detalle-id="${item.detalleId}">
          <td>${escapeHtml(item.producto)}</td>
          <td class="text-end">${item.cantidadSalida}</td>

          <td class="text-end" style="width:120px;">
            <input type="number"
                   class="form-control form-control-sm text-end input-devuelto"
                   min="0"
                   max="${item.cantidadSalida}"
                   value="${item.cantidadDevuelta}">
          </td>

          <td class="text-end fw-bold vendido-cell">${item.vendido}</td>
          <td class="text-end">${q(item.precio)}</td>
          <td class="text-end total-cell">${q(item.total)}</td>

          <td class="text-center">
            <button class="btn btn-sm btn-success btn-guardar-dev">Guardar</button>
          </td>
        </tr>
      `;
    }).join('');

    totalCell.textContent = q(total);

    // recalcular vendido/total al cambiar devuelto (sin guardar todavía)
    tbody.querySelectorAll('tr').forEach(tr => {
      const input = tr.querySelector('.input-devuelto');
      const salida = Number(tr.children[1].textContent || 0);
      const precioTxt = tr.children[4].textContent.replace('Q', '');
      const precio = Number(precioTxt || 0);

      input.addEventListener('input', () => {
        let dev = Number(input.value || 0);
        if (dev < 0) dev = 0;
        if (dev > salida) dev = salida;
        input.value = dev;

        const vendido = salida - dev;
        const totalLinea = vendido * precio;

        tr.querySelector('.vendido-cell').textContent = vendido;
        tr.querySelector('.total-cell').textContent = q(totalLinea);

        // recalcular total general
        let suma = 0;
        tbody.querySelectorAll('.total-cell').forEach(td => {
          suma += Number(td.textContent.replace('Q', '') || 0);
        });
        totalCell.textContent = q(suma);
      });
    });

    // guardar por fila
    tbody.querySelectorAll('.btn-guardar-dev').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const detalleId = tr.getAttribute('data-detalle-id');
        const devuelto = Number(tr.querySelector('.input-devuelto').value || 0);

        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = '...';

        try {
          const resp = await fetch(`${BASE}/rutas/detalle/${detalleId}/devolucion`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cantidadDevuelta: devuelto })
          });

          const out = await resp.json();
          if (!resp.ok) throw new Error(out?.error || 'Error guardando');

          btn.textContent = 'OK';
          setTimeout(() => (btn.textContent = oldText), 800);

          // (Opcional) refrescar resumen para que cambie el total vendido Q arriba:
          // await cargarDevolucionesRutaFlat();

        } catch (e) {
          alert(`No se pudo guardar: ${e.message}`);
          btn.textContent = oldText;
        } finally {
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${err.message}</td></tr>`;
  }
}

// cerrar detalle
document.getElementById('btnCerrarDetalleRuta')?.addEventListener('click', () => {
  document.getElementById('detalleRutaCard').style.display = 'none';
});

async function cargarRutasParaImprimir() {
  const select = document.getElementById('selectRutaImprimir');
  const btn = document.getElementById('btnImprimirRutaSeleccionada');
  if (!select) return;

  // estado inicial
  select.innerHTML = '<option value="">-- Cargando rutas... --</option>';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${BASE}/rutas`, { headers: { 'Accept': 'application/json' } });
    const rutas = await res.json();

    if (!res.ok) {
      console.error('GET /rutas falló:', rutas);
      select.innerHTML = '<option value="">-- Error cargando rutas --</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Seleccione una ruta --</option>';

    (rutas || []).forEach(r => {
      const fechaStr = r.fecha ? new Date(r.fecha).toLocaleDateString() : '';
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `Ruta #${r.id} - ${fechaStr} - ${r.piloto || ''}`;
      select.appendChild(opt);
    });

  } catch (err) {
    console.error('Error cargando rutas para imprimir:', err);
    select.innerHTML = '<option value="">-- Error cargando rutas --</option>';
  }
}

// =============================
// ⚙ CONFIGURACIÓN (localStorage)
// =============================
const CONFIG_KEYS = {
  ELIMINAR_PRODUCTOS: 'permitirEliminarProductos',
  ELIMINAR_CLIENTES: 'permitirEliminarClientes'
};

function cargarConfiguracion() {
  const prodSwitch = el('switchEliminarProductos');
  const cliSwitch = el('switchEliminarClientes');

  const permitirProductos = localStorage.getItem(CONFIG_KEYS.ELIMINAR_PRODUCTOS) === 'true';
  const permitirClientes = localStorage.getItem(CONFIG_KEYS.ELIMINAR_CLIENTES) === 'true';

  if (prodSwitch) prodSwitch.checked = permitirProductos;
  if (cliSwitch) cliSwitch.checked = permitirClientes;
}

function guardarConfiguracion() {
  const prodSwitch = el('switchEliminarProductos');
  const cliSwitch = el('switchEliminarClientes');

  if (prodSwitch) localStorage.setItem(CONFIG_KEYS.ELIMINAR_PRODUCTOS, prodSwitch.checked);
  if (cliSwitch) localStorage.setItem(CONFIG_KEYS.ELIMINAR_CLIENTES, cliSwitch.checked);

  if (typeof mostrarToast === 'function') {
    mostrarToast('Configuración guardada', 'success');
  }
}

function toggleCamposPago() {
  const tipoPago = document.getElementById('tipoPago')?.value;
  const campoEfectivo = document.getElementById('campoEfectivo');
  const campoAbono = document.getElementById('campoAbono');

  if (!campoEfectivo || !campoAbono) return;

  if (tipoPago === 'contado') {
    campoEfectivo.style.display = 'block';
    campoAbono.style.display = 'none';
    const abono = document.getElementById('abonoCredito');
    if (abono) abono.value = '';
  } else {
    campoEfectivo.style.display = 'none';
    campoAbono.style.display = 'block';
    const ef = document.getElementById('efectivoRecibido');
    if (ef) ef.value = '';
  }
}

// =========================================
// 🔄 REFRESCAR UI DE RUTAS (GLOBAL)
// =========================================
async function refrescarRutasUI() {
  // 1) productos/stock
  await cargarProductos();
  renderProductosRuta();

  // 2) recargar selects
  await cargarRutasDevolucion();
  await cargarRutasParaImprimir();

  // 3) recargar historial (si existe)
  if (typeof cargarDevolucionesRutaFlat === 'function') {
    await cargarDevolucionesRutaFlat();
  }
}

// ===========================
// SCANNER HID (teclado) -> buscar por barcode -> agregar al carrito
// ===========================
// ===========================
// SCANNER HID (teclado) -> buscar por barcode -> agregar 1 al carrito
// ===========================
let scanBuffer = "";
let scanTimer = null;

function resetScanTimer() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => { scanBuffer = ""; }, 80);
}

function isPOSSectionActive() {
  // Solo cuando estás en la pestaña POS
  const posPane = document.getElementById('posSection');
  return posPane && posPane.classList.contains('active') && posPane.classList.contains('show');
}

async function procesarScan(code) {
  const clean = (code || "").trim();
  if (!clean) return;

  try {
    // 1) Buscar en memoria primero
    let prod = state.productos.find(p => (p.barcode || "") === clean);

    // 2) Si no está, pedirlo al backend
    if (!prod) {
      const res = await fetch(`${BASE}/productos/barcode/${encodeURIComponent(clean)}`);
      if (!res.ok) throw new Error("No existe ese código en productos");
      prod = await res.json();
    }

    // ✅ Agregar 1 al carrito
    agregarAlCarrito(prod, 1);
    mostrarToast(`Agregado: ${prod.nombre}`, "success");
  } catch (err) {
    mostrarToast(`Código no encontrado: ${clean}`, "warning");
  }
}

window.addEventListener("keydown", async (e) => {
  // Solo en POS
  if (!isPOSSectionActive()) return;

  // Ignorar teclas especiales
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  // Terminan el scan (depende del lector): Enter o Tab
  if (e.key === "Enter" || e.key === "Tab") {
    const code = scanBuffer;
    scanBuffer = "";

    // Evita que el Enter dispare botones o el Tab cambie de campo
    e.preventDefault();

    await procesarScan(code);
    return;
  }

  // Construir buffer con caracteres imprimibles
  if (e.key.length === 1) {
    scanBuffer += e.key;
    resetScanTimer();
  }
}, true);


// =========================================
// 🚀 INICIALIZACIÓN GLOBAL (ARREGLADA)
// =========================================
function init() {
  // 🔹 cargas iniciales
  cargarProductos();
  cargarHistorial();
  cargarConfiguracion();
  cargarClientes();
  setupClienteAutocomplete();
  cargarMovimientosFinancieros();

  renderProductosRuta();
  cargarRutasDevolucion();
  cargarRutasParaImprimir();

  // ✅ Guardar configuración cuando cambien los switches
  el('switchEliminarProductos')?.addEventListener('change', guardarConfiguracion);
  el('switchEliminarClientes')?.addEventListener('change', guardarConfiguracion);

  // ✅ Crear producto/cliente/facturar
  el('btnCrearProducto')?.addEventListener('click', crearProducto);
  el('btnCrearCliente')?.addEventListener('click', crearCliente);
  el('btnFacturar')?.addEventListener('click', facturar);
  el('btnConfirmarEfectivo')?.addEventListener('click', confirmarEfectivo);
  el('btnConfirmDelete')?.addEventListener('click', confirmarEliminar);
  el('btnSaveProductChanges')?.addEventListener('click', guardarCambiosProducto);
  

  // ✅ POS filtros
  el('search')?.addEventListener('input', renderProductosPOS);

  // ✅ Historial inventario filtros
  el('filtroProductoHistorial')?.addEventListener('change', renderHistorial);
  el('filtroTipoHistorial')?.addEventListener('change', renderHistorial);
  el('buscarHistorial')?.addEventListener('input', renderHistorial);
  el('btnRefrescarHistorial')?.addEventListener('click', async () => {
    await cargarHistorial();
    renderHistorial();
  });

  // ✅ Finanzas
  el('btnGuardarMovimiento')?.addEventListener('click', guardarMovimientoFinanciero);
  el('btnCierrePDF')?.addEventListener('click', generarCierrePDF);

  el('filtroTipoMov')?.addEventListener('change', renderMovimientosFinancieros);
  el('filtroFechaDesde')?.addEventListener('change', renderMovimientosFinancieros);
  el('filtroFechaHasta')?.addEventListener('change', renderMovimientosFinancieros);
  el('filtroBuscarMov')?.addEventListener('input', renderMovimientosFinancieros);

  // ✅ Créditos filtros
  el('filtroCliente')?.addEventListener('input', cargarCreditos);
  el('filtroEstado')?.addEventListener('change', cargarCreditos);

  // ✅ Rutas
  document.getElementById('btnGuardarRuta')?.addEventListener('click', crearRuta);
  document.getElementById('btnImprimirRuta')?.addEventListener('click', imprimirRuta);

  // ✅ Rutas - devolución
  document.getElementById('selectRutaDevolucion')?.addEventListener('change', cargarDetallesRutaDevolucion);
  document.getElementById('btnGuardarDevolucionRuta')?.addEventListener('click', guardarDevolucionRuta);

  // ✅ Pestañas: al entrar recarga lo que toca (para que no tengas que “moverte” manualmente)
  document.getElementById('creditos-tab')?.addEventListener('shown.bs.tab', cargarCreditos);
  document.getElementById('finanzas-tab')?.addEventListener('shown.bs.tab', cargarMovimientosFinancieros);

  document.getElementById('rutas-tab')?.addEventListener('shown.bs.tab', async () => {
    renderProductosRuta();
    await cargarRutasDevolucion();
    await cargarRutasParaImprimir();
  });

  // ✅ Imprimir ruta guardada (UNA SOLA VEZ)
  const selectRutaImprimir = document.getElementById('selectRutaImprimir');
  const btnImprimirRutaSeleccionada = document.getElementById('btnImprimirRutaSeleccionada');

  selectRutaImprimir?.addEventListener('change', () => {
    rutaImprimirId = Number(selectRutaImprimir.value) || null;
    if (btnImprimirRutaSeleccionada) btnImprimirRutaSeleccionada.disabled = !rutaImprimirId;
  });

  btnImprimirRutaSeleccionada?.addEventListener('click', imprimirRutaSeleccionada);

  // ✅ (Opcional) Si tú quieres manejar altura manualmente, OK.
  // Pero OJO: Bootstrap ya maneja show/active.
  // Si lo de abajo te causa glitches, me decís y lo quitamos.
  document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tabButton => {
    tabButton.addEventListener('shown.bs.tab', (event) => {
      const targetSelector = event.target.getAttribute('data-bs-target');
      const target = document.querySelector(targetSelector);
      if (!target) return;

      const tabContent = document.querySelector('.tab-content');
      if (tabContent) tabContent.style.height = 'auto';
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
