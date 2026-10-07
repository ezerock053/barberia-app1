'use strict';

const express = require('express');
const { Barber } = require('../models');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();
const editableFields = ['name', 'phone', 'image', 'active'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 255;
}

function isValidOptionalText(value, maxLength) {
  return value === null || (
    typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
  );
}

router.get('/', (req, res, next) => req.query.includeInactive === 'true'
  ? requireAdmin(req, res, next)
  : next(), async (req, res) => {
  try {
    const barbers = await Barber.findAll({
      ...(req.query.includeInactive === 'true' ? {} : { where: { active: true } }),
      order: [['name', 'ASC']],
    });

    return res.status(200).json(barbers);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid barber ID' });

  try {
    const barber = await Barber.findByPk(id);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });
    return res.status(200).json(barber);
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
    return res.status(400).json({ error: 'name is required and must be a non-empty string of at most 255 characters' });
  }
  if (body.phone !== undefined && !isValidOptionalText(body.phone, 50)) {
    return res.status(400).json({ error: 'phone must be a non-empty string of at most 50 characters or null' });
  }
  if (body.image !== undefined && !isValidOptionalText(body.image, 255)) {
    return res.status(400).json({ error: 'image must be a non-empty string of at most 255 characters or null' });
  }

  try {
    const barber = await Barber.create({
      name: body.name.trim(),
      phone: body.phone == null ? null : body.phone.trim(),
      image: body.image == null ? null : body.image.trim(),
      active: true,
    });
    return res.status(201).json(barber);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid barber ID' });

  try {
    const barber = await Barber.findByPk(id);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'A JSON object is required' });
    }
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((key) => !editableFields.includes(key))) {
      return res.status(400).json({ error: 'Provide valid barber fields to update' });
    }

    const updates = {};
    if (Object.hasOwn(body, 'name')) {
      if (!isValidName(body.name)) {
        return res.status(400).json({ error: 'name must be a non-empty string of at most 255 characters' });
      }
      updates.name = body.name.trim();
    }
    if (Object.hasOwn(body, 'phone')) {
      if (!isValidOptionalText(body.phone, 50)) {
        return res.status(400).json({ error: 'phone must be a non-empty string of at most 50 characters or null' });
      }
      updates.phone = body.phone === null ? null : body.phone.trim();
    }
    if (Object.hasOwn(body, 'image')) {
      if (!isValidOptionalText(body.image, 255)) {
        return res.status(400).json({ error: 'image must be a non-empty string of at most 255 characters or null' });
      }
      updates.image = body.image === null ? null : body.image.trim();
    }
    if (Object.hasOwn(body, 'active')) {
      if (typeof body.active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' });
      }
      updates.active = body.active;
    }

    await barber.update(updates);
    return res.status(200).json(barber);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid barber ID' });

  try {
    const barber = await Barber.findByPk(id);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    await barber.update({ active: false });
    return res.status(200).json(barber);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
