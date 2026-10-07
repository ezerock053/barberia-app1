'use strict';

const express = require('express');
const { Service } = require('../models');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();
const editableFields = ['name', 'description', 'price', 'active'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidName(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidDescription(value) {
  return value === null || typeof value === 'string';
}

router.get('/', (req, res, next) => req.query.includeInactive === 'true'
  ? requireAdmin(req, res, next)
  : next(), async (req, res) => {
  try {
    const services = await Service.findAll({
      ...(req.query.includeInactive === 'true' ? {} : { where: { active: true } }),
      order: [['name', 'ASC']],
    });

    return res.status(200).json(services);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid service ID' });

  try {
    const service = await Service.findByPk(id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    return res.status(200).json(service);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'A JSON object is required' });
  }
  if (!isValidName(body.name)) {
    return res.status(400).json({ error: 'name is required and must be a non-empty string' });
  }
  if (!isValidPrice(body.price)) {
    return res.status(400).json({ error: 'price is required and must be a number greater than or equal to 0' });
  }
  if (body.description !== undefined && !isValidDescription(body.description)) {
    return res.status(400).json({ error: 'description must be a string or null' });
  }

  try {
    const service = await Service.create({
      name: body.name.trim(),
      description: body.description ?? null,
      price: body.price,
      active: true,
    });
    return res.status(201).json(service);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid service ID' });

  try {
    const service = await Service.findByPk(id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'A JSON object is required' });
    }
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((key) => !editableFields.includes(key))) {
      return res.status(400).json({ error: 'Provide valid service fields to update' });
    }

    const updates = {};
    if (Object.hasOwn(body, 'name')) {
      if (!isValidName(body.name)) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      updates.name = body.name.trim();
    }
    if (Object.hasOwn(body, 'description')) {
      if (!isValidDescription(body.description)) {
        return res.status(400).json({ error: 'description must be a string or null' });
      }
      updates.description = body.description;
    }
    if (Object.hasOwn(body, 'price')) {
      if (!isValidPrice(body.price)) {
        return res.status(400).json({ error: 'price must be a number greater than or equal to 0' });
      }
      updates.price = body.price;
    }
    if (Object.hasOwn(body, 'active')) {
      if (typeof body.active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' });
      }
      updates.active = body.active;
    }

    await service.update(updates);
    return res.status(200).json(service);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid service ID' });

  try {
    const service = await Service.findByPk(id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    await service.update({ active: false });
    return res.status(200).json(service);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
