const express = require('express');
const fs = require('fs');
const router = express.Router();
const { getPaths } = require('../utils/paths');

const DEFAULT_CONFIG = {
  negocio: {
    nombre: 'Mi negocio',
    direccion: '',
    telefono: '',
    nit: ''
  }
};

function readConfig() {
  const { configPath } = getPaths();

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return DEFAULT_CONFIG;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      negocio: {
        nombre: parsed?.negocio?.nombre ?? DEFAULT_CONFIG.negocio.nombre,
        direccion: parsed?.negocio?.direccion ?? DEFAULT_CONFIG.negocio.direccion,
        telefono: parsed?.negocio?.telefono ?? DEFAULT_CONFIG.negocio.telefono,
        nit: parsed?.negocio?.nit ?? DEFAULT_CONFIG.negocio.nit
      }
    };
  } catch (error) {
    console.error('❌ Error leyendo config.json:', error);
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  const { configPath } = getPaths();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

router.get('/', async (_req, res) => {
  try {
    const config = readConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error leyendo configuración', detalle: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    const direccion = String(req.body?.direccion ?? '').trim();
    const telefono = String(req.body?.telefono ?? '').trim();
    const nit = String(req.body?.nit ?? '').trim();

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del negocio es obligatorio.' });
    }

    const newConfig = {
      negocio: {
        nombre,
        direccion,
        telefono,
        nit
      }
    };

    saveConfig(newConfig);

    return res.json({
      ok: true,
      message: 'Configuración guardada correctamente.',
      config: newConfig
    });
  } catch (error) {
    console.error(' Error guardando configuración:', error);
    res.status(500).json({ error: 'Error guardando configuración', detalle: error.message });
  }
});

module.exports = router;