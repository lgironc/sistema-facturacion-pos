let productosParaFactura = [];

// ================= Clientes =================
async function fetchClientes() {
  const res = await fetch('/clientes');
  const clientes = await res.json();
  const lista = document.getElementById('listaClientes');
  lista.innerHTML = '';
  clientes.forEach(c => {
    lista.innerHTML += `<li>${c.nombre} - ${c.correo} 
      <button onclick="eliminarCliente('${c._id}')">Eliminar</button></li>`;
  });
}

async function agregarCliente() {
  const nombre = document.getElementById('clienteNombre').value;
  const correo = document.getElementById('clienteCorreo').value;

  await fetch('/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, correo })
  });

  document.getElementById('clienteNombre').value = '';
  document.getElementById('clienteCorreo').value = '';
  fetchClientes();
}

async function eliminarCliente(id) {
  await fetch(`/clientes/${id}`, { method: 'DELETE' });
  fetchClientes();
}

// ================= Productos =================
async function fetchProductos() {
  const res = await fetch('/productos');
  const productos = await res.json();
  const lista = document.getElementById('listaProductos');
  lista.innerHTML = '';
  productos.forEach(p => {
    lista.innerHTML += `<li>${p.nombre} - $${p.precio} - Stock: ${p.stock} 
      <button onclick="eliminarProducto('${p._id}')">Eliminar</button></li>`;
  });
}

async function agregarProducto() {
  const nombre = document.getElementById('productoNombre').value;
  const precio = parseFloat(document.getElementById('productoPrecio').value);
  const stock = parseInt(document.getElementById('productoStock').value);

  await fetch('/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, precio, stock })
  });

  document.getElementById('productoNombre').value = '';
  document.getElementById('productoPrecio').value = '';
  document.getElementById('productoStock').value = '';
  fetchProductos();
}

async function eliminarProducto(id) {
  await fetch(`/productos/${id}`, { method: 'DELETE' });
  fetchProductos();
}

// ================= Facturas =================
async function fetchFacturas() {
  const res = await fetch('/facturas');
  const facturas = await res.json();
  const lista = document.getElementById('listaFacturas');
  lista.innerHTML = '';
  facturas.forEach(f => {
    const productosStr = f.productos.map(p => `${p.cantidad}x ${p.producto.nombre}`).join(', ');
    lista.innerHTML += `<li>Cliente: ${f.cliente.nombre} - Total: $${f.total} - Productos: ${productosStr} 
      <button onclick="eliminarFactura('${f._id}')">Eliminar</button></li>`;
  });
}

async function agregarFactura() {
  const clienteId = document.getElementById('facturaCliente').value;
  const productosIds = document.getElementById('facturaProductos').value
    .split(',').map(p => p.trim());

  // productosIds = ["idProducto:cantidad", ...]
  const productos = productosIds.map(p => {
    const [id, cant] = p.split(':');
    return { producto: id, cantidad: parseInt(cant), precio: 0 }; // el precio se obtiene en backend
  });

  await fetch('/facturas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente: clienteId, productos })
  });

  document.getElementById('facturaCliente').value = '';
  document.getElementById('facturaProductos').value = '';
  fetchFacturas();
  fetchProductos(); // actualizar stock
}

async function eliminarFactura(id) {
  await fetch(`/facturas/${id}`, { method: 'DELETE' });
  fetchFacturas();
  fetchProductos(); // actualizar stock al eliminar factura
}

// ================= Inicialización =================
document.addEventListener('DOMContentLoaded', () => {
  fetchClientes();
  fetchProductos();
  fetchFacturas();
});

