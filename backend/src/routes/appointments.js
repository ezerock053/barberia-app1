'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { Appointment, Barber, Customer, Service } = require('../models');
const { getReservationWindowError } = require('../utils/reservationWindow');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();
const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
const editableFields = ['customerId', 'barberId', 'serviceId', 'startAt', 'notes', 'status'];
const associations = [
  { model: Customer, as: 'customer' },
  { model: Barber, as: 'barber' },
  { model: Service, as: 'service' },
];

function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isValidDateTime(value, requireExactHour = false) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return !requireExactHour || (minute === 0 && second === 0 && (!match[7] || Number(match[7]) === 0));
}

function parseDateTime(value) {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

function isValidDateFilter(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isValidDateTime(`${value} 00:00:00`);
  }
  return isValidDateTime(value);
}

function parseDateFilter(value, isUpperBound = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseDateTime(`${value} ${isUpperBound ? '23:59:59.999' : '00:00:00'}`);
  }
  return parseDateTime(value);
}

function endTimeFor(startAt) {
  return new Date(startAt.getTime() + 60 * 60 * 1000);
}

function validateBody(body, requiredFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'A JSON object is required';
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !editableFields.includes(key))) {
    return 'Provide valid appointment fields';
  }
  for (const field of requiredFields) {
    if (!Object.hasOwn(body, field)) return `${field} is required`;
  }
  for (const field of ['customerId', 'barberId', 'serviceId']) {
    if (Object.hasOwn(body, field) && parseId(String(body[field])) === null) {
      return `${field} must be a positive integer`;
    }
  }
  if (Object.hasOwn(body, 'startAt') && !isValidDateTime(body.startAt, true)) {
    return 'startAt must be a valid date and time on the hour';
  }
  if (Object.hasOwn(body, 'notes') && body.notes !== null && typeof body.notes !== 'string') {
    return 'notes must be a string or null';
  }
  if (Object.hasOwn(body, 'status') && !statuses.includes(body.status)) {
    return `status must be one of: ${statuses.join(', ')}`;
  }
  return null;
}

async function findActiveRelations({ customerId, barberId, serviceId }) {
  const [customer, barber, service] = await Promise.all([
    Customer.findByPk(customerId),
    Barber.findByPk(barberId),
    Service.findByPk(serviceId),
  ]);
  if (!customer) return { error: 'Customer not found', status: 404 };
  if (!barber) return { error: 'Barber not found', status: 404 };
  if (!service) return { error: 'Service not found', status: 404 };
  if (!barber.active) return { error: 'Barber is inactive', status: 400 };
  if (!service.active) return { error: 'Service is inactive', status: 400 };
  return { customer, barber, service };
}

// Kept in one helper so a transaction or lock can be added here if concurrency needs it.
async function hasScheduleConflict(barberId, startAt, excludedId) {
  const where = {
    barberId,
    startAt,
    status: { [Op.ne]: 'cancelled' },
  };
  if (excludedId !== undefined) where.id = { [Op.ne]: excludedId };
  return Appointment.findOne({ attributes: ['id'], where });
}

function buildWhere(query) {
  const where = {};
  for (const field of ['barberId', 'customerId']) {
    if (query[field] !== undefined) {
      const id = parseId(query[field]);
      if (id === null) return { error: `${field} must be a positive integer` };
      where[field] = id;
    }
  }
  if (query.status !== undefined) {
    if (!statuses.includes(query.status)) return { error: 'Invalid status' };
    where.status = query.status;
  }
  const range = {};
  if (query.from !== undefined) {
    if (!isValidDateFilter(query.from)) return { error: 'from must be a valid date or date and time' };
    range[Op.gte] = parseDateFilter(query.from);
  }
  if (query.to !== undefined) {
    if (!isValidDateFilter(query.to)) return { error: 'to must be a valid date or date and time' };
    range[Op.lte] = parseDateFilter(query.to, true);
  }
  if (Object.keys(range).length) where.startAt = range;
  if (query.from && query.to && parseDateFilter(query.from) > parseDateFilter(query.to, true)) {
    return { error: 'from must be earlier than or equal to to' };
  }
  return { where };
}

router.get('/', requireAdmin, async (req, res) => {
  const parsed = buildWhere(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const appointments = await Appointment.findAll({
      where: parsed.where,
      include: associations,
      order: [['startAt', 'ASC']],
    });
    return res.status(200).json(appointments);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid appointment ID' });
  try {
    const appointment = await Appointment.findByPk(id, { include: associations });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    return res.status(200).json(appointment);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const publicBody = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? { ...req.body }
    : req.body;
  if (publicBody && typeof publicBody === 'object') delete publicBody.status;
  const validationError = validateBody(publicBody, ['customerId', 'barberId', 'serviceId', 'startAt']);
  if (validationError) return res.status(400).json({ error: validationError });
  const startAt = parseDateTime(publicBody.startAt);
  try {
    const relations = await findActiveRelations(publicBody);
    if (relations.error) return res.status(relations.status).json({ error: relations.error });
    const reservationWindowError = getReservationWindowError(startAt);
    if (reservationWindowError) return res.status(400).json({ error: reservationWindowError });
    if (await hasScheduleConflict(req.body.barberId, startAt)) {
      return res.status(409).json({ error: 'Barber already has an appointment at this time' });
    }
    const appointment = await Appointment.create({
      customerId: publicBody.customerId,
      barberId: publicBody.barberId,
      serviceId: publicBody.serviceId,
      startAt,
      endAt: endTimeFor(startAt),
      serviceName: relations.service.name,
      servicePrice: relations.service.price,
      notes: publicBody.notes ?? null,
      status: 'pending',
    });
    await appointment.reload({ include: associations });
    return res.status(201).json(appointment);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid appointment ID' });
  try {
    const appointment = await Appointment.findByPk(id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    const validationError = validateBody(req.body, []);
    if (validationError) return res.status(400).json({ error: validationError });

    const updates = {};
    for (const field of ['customerId', 'barberId', 'serviceId', 'notes', 'status']) {
      if (Object.hasOwn(req.body, field)) updates[field] = req.body[field];
    }
    const customerId = updates.customerId ?? appointment.customerId;
    const barberId = updates.barberId ?? appointment.barberId;
    const serviceId = updates.serviceId ?? appointment.serviceId;
    const startAt = Object.hasOwn(req.body, 'startAt') ? parseDateTime(req.body.startAt) : appointment.startAt;
    const scheduleChanged = barberId !== appointment.barberId || startAt.getTime() !== new Date(appointment.startAt).getTime();

    if (Object.hasOwn(req.body, 'customerId')) {
      if (!await Customer.findByPk(customerId)) return res.status(404).json({ error: 'Customer not found' });
    }
    if (Object.hasOwn(req.body, 'barberId')) {
      const barber = await Barber.findByPk(barberId);
      if (!barber) return res.status(404).json({ error: 'Barber not found' });
      if (!barber.active) return res.status(400).json({ error: 'Barber is inactive' });
    }
    if (Object.hasOwn(req.body, 'serviceId')) {
      const service = await Service.findByPk(serviceId);
      if (!service) return res.status(404).json({ error: 'Service not found' });
      if (!service.active) return res.status(400).json({ error: 'Service is inactive' });
      updates.serviceName = service.name;
      updates.servicePrice = service.price;
    }
    const willBeActive = (updates.status ?? appointment.status) !== 'cancelled';
    const reactivating = appointment.status === 'cancelled' && willBeActive;
    const reservationChanged = Object.hasOwn(req.body, 'startAt')
      || Object.hasOwn(req.body, 'barberId')
      || reactivating;
    if (reservationChanged && willBeActive) {
      const reservationWindowError = getReservationWindowError(startAt);
      if (reservationWindowError) return res.status(400).json({ error: reservationWindowError });
    }
    if ((scheduleChanged || reactivating) && willBeActive && await hasScheduleConflict(barberId, startAt, id)) {
      return res.status(409).json({ error: 'Barber already has an appointment at this time' });
    }
    if (Object.hasOwn(req.body, 'startAt')) {
      updates.startAt = startAt;
      updates.endAt = endTimeFor(startAt);
    }
    await appointment.update(updates);
    await appointment.reload({ include: associations });
    return res.status(200).json(appointment);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid appointment ID' });
  try {
    const appointment = await Appointment.findByPk(id, { include: associations });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    await appointment.update({ status: 'cancelled' });
    return res.status(200).json(appointment);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
