'use strict';

const express = require('express');
const { Customer } = require('../models');

const router = express.Router();
const editableFields = ['name', 'phone', 'email'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value) {
  return isNonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateCustomer(body, requiredFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'A JSON object is required';
  }

  const keys = Object.keys(body);
  if (keys.some((key) => !editableFields.includes(key))) {
    return 'Provide valid customer fields';
  }
  if (keys.length === 0 || requiredFields.some((field) => !Object.hasOwn(body, field))) {
    return 'name, phone and email are required';
  }
  for (const field of keys) {
    if (!isNonEmptyString(body[field])) {
      return `${field} must be a non-empty string`;
    }
  }
  if (Object.hasOwn(body, 'email') && !isValidEmail(body.email)) {
    return 'email must have a valid format';
  }
  return null;
}

function isForeignKeyConstraintError(error) {
  return error.name === 'SequelizeForeignKeyConstraintError'
    || error.original?.code === 'ER_ROW_IS_REFERENCED_2'
    || error.original?.code === 'ER_ROW_IS_REFERENCED';
}

router.get('/', async (_req, res) => {
  try {
    const customers = await Customer.findAll({ order: [['name', 'ASC']] });
    return res.status(200).json(customers);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid customer ID' });

  try {
    const customer = await Customer.findByPk(id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    return res.status(200).json(customer);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const validationError = validateCustomer(req.body, editableFields);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const customer = await Customer.create({
      name: req.body.name.trim(),
      phone: req.body.phone.trim(),
      email: req.body.email.trim(),
    });
    return res.status(201).json(customer);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid customer ID' });

  try {
    const customer = await Customer.findByPk(id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'A JSON object is required' });
    }
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((key) => !editableFields.includes(key))) {
      return res.status(400).json({ error: 'Provide valid customer fields to update' });
    }
    const validationError = validateCustomer(body, []);
    if (validationError) return res.status(400).json({ error: validationError });

    const updates = {};
    for (const field of keys) updates[field] = body[field].trim();
    await customer.update(updates);
    return res.status(200).json(customer);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid customer ID' });

  try {
    const customer = await Customer.findByPk(id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    await customer.destroy();
    return res.status(200).json({ message: 'Customer deleted' });
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      return res.status(409).json({ error: 'Customer cannot be deleted because they have associated appointments' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
