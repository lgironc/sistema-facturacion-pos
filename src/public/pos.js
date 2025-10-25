// =========================================
// POS.JS - CONTROL GENERAL DEL SISTEMA POS
// =========================================

const BASE = ''; // Usa mismo host (http://localhost:4000)

const state = {
  productos: [],
  carrito: [],
  clientes: [],
  historial: []
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
        <input type="number" min="1" class="form-control form-control-sm small-input" value="${item.cantidad}">
      </td>
      <td class="text-end">${formatoQ(item.precioVenta)}</td>
      <td class="text-end">${formatoQ(subtotal)}</td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm">×</button>
      </td>
    `;

    tr.querySelector('input').addEventListener('change', e => {
      state.carrito[i].cantidad = Math.max(1, parseInt(e.target.value));
      renderCarrito();
    });

    tr.querySelector('button').addEventListener('click', () => {
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

  const clienteId = el('clienteId').value || null;
  const efectivoRecibidoInput = el('efectivoRecibido');
  const efectivo = parseFloat(efectivoRecibidoInput.value);

  // Validar efectivo
  if (isNaN(efectivo) || efectivo <= 0) {
    mostrarToast('Ingrese un monto válido en efectivo.', 'danger');
    return;
  }

  const productos = state.carrito.map(item => ({
    productoId: item.productoId,
    cantidad: item.cantidad
  }));

  const resultDiv = el('result');
  const errorDiv = el('error');
  const btnAbrirPDF = el('btnAbrirPDF');

  // Limpiar mensajes previos
  resultDiv.textContent = '';
  errorDiv.textContent = '';
  btnAbrirPDF.style.display = 'none';

  try {
    // ✅ Crear factura en el backend
    const res = await fetch(`${BASE}/facturas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, productos })
    });

    if (!res.ok) throw new Error('Error creando factura');

    const data = await res.json();
    const facturaId = data.facturaId;
    const totalFactura = data.total;

    // ✅ Calcular cambio
    const cambio = efectivo - totalFactura;

    // ✅ Mostrar éxito en el POS
    resultDiv.innerHTML = `
      ✅ Factura creada (ID: ${facturaId})<br>
      Total: Q${totalFactura.toFixed(2)} | Efectivo: Q${efectivo.toFixed(2)} | Cambio: Q${cambio.toFixed(2)}
    `;

    // ✅ Limpiar carrito y entradas
    state.carrito = [];
    renderCarrito();
    cargarProductos();
    efectivoRecibidoInput.value = '';

    // 📄 Mostrar botón para abrir PDF generado
btnAbrirPDF.style.display = 'block';
btnAbrirPDF.onclick = () => {
  // Le pasamos la ruta para que el main.js lo descargue, guarde y abra
  abrirFacturaPDF(`/facturas/${facturaId}/pdf`);
};



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



// =========================================
// 📦 CREAR PRODUCTO
// =========================================
async function crearProducto() {
  const nombre = el('prodNombre').value;
  const costoCompra = el('prodCosto').value;
  const precioVenta = el('prodPrecio').value;
  const stock = el('prodStock').value;

  try {
    await fetch(`${BASE}/productos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, costoCompra, precioVenta, stock })
    });

    await cargarProductos();
    el('prodNombre').value = '';
    el('prodCosto').value = '';
    el('prodPrecio').value = '';
    el('prodStock').value = '';
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

  const filtroProductoId = el('filtroProductoHistorial')?.value || '';
  const filtroTexto = (el('buscarHistorial')?.value || '').toLowerCase();

  tbody.innerHTML = '';

  state.historial
    .filter(h => {
      // ✅ Filtro por producto desde el ComboBox
      const coincProducto = filtroProductoId === '' || h.Producto?.id == filtroProductoId;

      // ✅ Filtro por texto en el nombre del producto
      const coincTexto = h.Producto?.nombre?.toLowerCase().includes(filtroTexto);

      return coincProducto && coincTexto;
    })
    .forEach(h => {
  // Determinar si es entrada o venta
  const esEntrada = h.tipo === 'entrada';
  const movimiento = esEntrada ? 'Entrada' : 'Venta';
  const cantidadFormateada = (esEntrada ? '+' : '-') + Math.abs(h.cantidad);
  const claseCantidad = esEntrada ? 'text-success' : 'text-danger';
  const fecha = new Date(h.createdAt).toLocaleString();

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
    option.value = p.id;
    option.textContent = p.nombre;
    select.appendChild(option);
  });
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
    mostrarToast('Configuración guardada ✅', 'success');
  }
}


// =========================================
// 🚀 INICIALIZACIÓN GLOBAL (Corregida)
// =========================================
function init() {
  cargarProductos();
  cargarHistorial();
cargarConfiguracion();

// ✅ Guardar configuración cuando cambien los switches
el('switchEliminarProductos')?.addEventListener('change', guardarConfiguracion);
el('switchEliminarClientes')?.addEventListener('change', guardarConfiguracion);

  // ✅ Crear producto
  el('btnCrearProducto')?.addEventListener('click', crearProducto);
  el('btnCrearCliente')?.addEventListener('click', crearCliente);
  el('btnFacturar')?.addEventListener('click', facturar);
  el('btnConfirmarEfectivo')?.addEventListener('click', confirmarEfectivo);
  el('btnConfirmDelete')?.addEventListener('click', confirmarEliminar);

  //el('btnGuardarEdicion')?.addEventListener('click', guardarEdicion);

el('filtroProductoHistorial')?.addEventListener('change', renderHistorial);
el('buscarHistorial')?.addEventListener('input', renderHistorial);


  // ✅ Agregar eventos tab para recargar datos al cambiar
  document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => {
      if (tab.id === 'productos-tab') cargarProductos();
      if (tab.id === 'clientes-tab') cargarClientes();
      if (tab.id === 'historial-tab') cargarHistorial();
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
