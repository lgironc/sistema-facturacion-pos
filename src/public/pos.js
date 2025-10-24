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
    .filter(p => p.nombre?.toLowerCase().includes(q))
    .forEach(p => {
      const tr = document.createElement('tr');
      tr.className = 'product-row';
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
        <button class="btn btn-warning btn-sm me-2 btn-editar">✏</button>
        <button class="btn btn-danger btn-sm btn-eliminar">🗑</button>
      </td>
    `;

    tr.querySelector('.btn-editar').addEventListener('click', () => cargarEdicionProducto(p));
    tr.querySelector('.btn-eliminar').addEventListener('click', () => eliminarProducto(p.id));

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

async function facturar() {
  if (!state.carrito.length) {
    alert('El carrito está vacío.');
    return;
  }

  const clienteId = el('clienteId').value || null;
  const efectivoRecibidoInput = el('efectivoRecibido');
  const efectivo = parseFloat(efectivoRecibidoInput.value);

  // Validar efectivo
  if (isNaN(efectivo) || efectivo <= 0) {
    alert('Ingrese un monto válido en efectivo.');
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

    // 📄 Obtener PDF desde el backend
    const pdfRes = await fetch(`${BASE}/facturas/${facturaId}/pdf`);
    const pdfData = await pdfRes.json();

    if (pdfData.ok && pdfData.filePath) {
      btnAbrirPDF.style.display = 'block';
      btnAbrirPDF.onclick = () => {
        window.open(`file://${pdfData.filePath}`);
      };
    } else {
      errorDiv.textContent = 'Factura guardada, pero no se pudo generar el PDF.';
    }

  } catch (err) {
    console.error('Error facturando:', err);
    errorDiv.textContent = '❌ Ocurrió un error al crear la factura.';
  }
}


// =========================================
// 🗑 ELIMINAR PRODUCTO
// =========================================
async function eliminarProducto(id) {
  if (!confirm('¿Seguro de eliminar este producto?')) return;
  try {
    await fetch(`${BASE}/productos/${id}`, { method: 'DELETE' });
    await cargarProductos();
  } catch (e) {
    console.error('Error eliminando producto:', e);
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
    alert('El nombre del cliente es obligatorio.');
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
        <button class="btn btn-danger btn-sm" onclick="eliminarCliente(${c.id})">🗑</button>
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

  tbody.innerHTML = '';
  state.historial.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.Producto?.nombre || 'N/A'}</td>
      <td class="text-end">${h.cantidad}</td>
      <td class="text-end">${new Date(h.createdAt).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================
// 🚀 INICIALIZACIÓN GLOBAL (Corregida)
// =========================================
function init() {
  cargarProductos();
  cargarHistorial();

  // ✅ Crear producto
  el('btnCrearProducto')?.addEventListener('click', crearProducto);
  el('btnCrearCliente')?.addEventListener('click', crearCliente);
  el('btnFacturar')?.addEventListener('click', facturar);
  el('btnConfirmarEfectivo')?.addEventListener('click', confirmarEfectivo);




  // ✅ Guardar cambios en modal de edición
  el('btnGuardarEdicion')?.addEventListener('click', guardarEdicion);

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
