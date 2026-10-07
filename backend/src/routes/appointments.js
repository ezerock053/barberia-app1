'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { Appointment, Barber, Customer, Service, WorkingSchedule, sequelize } = require('../models');
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
  if (Object.hasOwn(body, 'notes') && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 255)) {
    return 'notes must be a string of at most 255 characters or null';
  }
  if (Object.hasOwn(body, 'status') && !statuses.includes(body.status)) {
    return `status must be one of: ${statuses.join(', ')}`;
  }
  return null;
}

function timeToSeconds(value) {
  const [hours, minutes, seconds = '0'] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function fitsSchedule(schedule, startAt) {
  if (!schedule) return false;
  const startSeconds = startAt.getUTCHours() * 3600 + startAt.getUTCMinutes() * 60 + startAt.getUTCSeconds();
  const scheduleStart = timeToSeconds(schedule.startTime);
  const scheduleEnd = timeToSeconds(schedule.endTime);
  const appointmentEnd = startSeconds + 60 * 60;
  return startSeconds >= scheduleStart && appointmentEnd <= scheduleEnd;
}

async function lockBarbers(barberIds, transaction) {
  const ids = [...new Set(barberIds)].sort((left, right) => left - right);
  const barbers = await Barber.findAll({
    where: { id: { [Op.in]: ids } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (barbers.length !== ids.length) return null;
  return new Map(barbers.map((barber) => [barber.id, barber]));
}

async function getSchedule(barberId, startAt, transaction) {
  return WorkingSchedule.findOne({
    where: { barberId, dayOfWeek: startAt.getUTCDay() },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

async function hasScheduleConflict(barberId, startAt, excludedId, transaction) {
  const where = {
    barberId,
    startAt,
    status: { [Op.ne]: 'cancelled' },
  };
  if (excludedId !== undefined) where.id = { [Op.ne]: excludedId };
  return Appointment.findOne({ attributes: ['id'], where, transaction });
}

function validateBookingCustomer(customer) {
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) return 'customer must include name, phone and email';
  const allowed = ['name', 'phone', 'email'];
  if (Object.keys(customer).some((field) => !allowed.includes(field))) return 'customer contains invalid fields';
  if (allowed.some((field) => typeof customer[field] !== 'string' || customer[field].trim().length === 0)) {
    return 'customer name, phone and email are required';
  }
  if (customer.name.trim().length > 255 || customer.phone.trim().length > 255 || customer.email.trim().length > 255) {
    return 'customer fields must be at most 255 characters';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) return 'customer email must have a valid format';
  return null;
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
  const publicFields = ['customer', 'barberId', 'serviceId', 'startAt', 'notes'];
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'A JSON object is required' });
  }
  const publicBody = { ...req.body };
  delete publicBody.status;
  if (Object.keys(publicBody).some((field) => !publicFields.includes(field))) {
    return res.status(400).json({ error: 'Provide valid appointment fields' });
  }
  const missingField = ['customer', 'barberId', 'serviceId', 'startAt'].find((field) => !Object.hasOwn(publicBody, field));
  const validationError = missingField
    ? `${missingField} is required`
    : validateBody({ barberId: publicBody.barberId, serviceId: publicBody.serviceId, startAt: publicBody.startAt, ...(Object.hasOwn(publicBody, 'notes') ? { notes: publicBody.notes } : {}) }, ['barberId', 'serviceId', 'startAt'])
      || validateBookingCustomer(publicBody.customer);
  if (validationError) return res.status(400).json({ error: validationError });
  const startAt = parseDateTime(publicBody.startAt);
  const barberId = Number(publicBody.barberId);
  const serviceId = Number(publicBody.serviceId);
  const reservationWindowError = getReservationWindowError(startAt);
  if (reservationWindowError) return res.status(400).json({ error: reservationWindowError });

  try {
    const result = await sequelize.transaction(async (transaction) => {
      const barbers = await lockBarbers([barberId], transaction);
      if (!barbers) return { status: 404, body: { error: 'Barber not found' } };
      const barber = barbers.get(barberId);
      if (!barber.active) return { status: 400, body: { error: 'Barber is inactive' } };

      const windowErrorAfterLock = getReservationWindowError(startAt);
      if (windowErrorAfterLock) return { status: 400, body: { error: windowErrorAfterLock } };
      const service = await Service.findByPk(serviceId, { transaction, lock: transaction.LOCK.UPDATE });
      const schedule = await getSchedule(barberId, startAt, transaction);
      if (!service) return { status: 404, body: { error: 'Service not found' } };
      if (!service.active) return { status: 400, body: { error: 'Service is inactive' } };
      if (!fitsSchedule(schedule, startAt)) {
        return { status: 400, body: { error: 'Appointment must fit within the barber working schedule' } };
      }
      if (await hasScheduleConflict(barberId, startAt, undefined, transaction)) {
        return { status: 409, body: { error: 'Barber already has an appointment at this time' } };
      }

      const customer = await Customer.create({
        name: publicBody.customer.name.trim(),
        phone: publicBody.customer.phone.trim(),
        email: publicBody.customer.email.trim(),
      }, { transaction });
      const appointment = await Appointment.create({
        customerId: customer.id,
        barberId,
        serviceId,
        startAt,
        endAt: endTimeFor(startAt),
        serviceName: service.name,
        servicePrice: service.price,
        notes: publicBody.notes?.trim() || null,
        status: 'pending',
      }, { transaction });
      return {
        status: 201,
        body: { id: appointment.id, startAt: appointment.startAt, endAt: appointment.endAt },
      };
    });
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid appointment ID' });
  const validationError = validateBody(req.body, []);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const appointment = await Appointment.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!appointment) return { status: 404, body: { error: 'Appointment not found' } };

      const updates = {};
      for (const field of ['customerId', 'barberId', 'serviceId', 'notes', 'status']) {
        if (Object.hasOwn(req.body, field)) updates[field] = req.body[field];
      }
      for (const field of ['customerId', 'barberId', 'serviceId']) {
        if (Object.hasOwn(updates, field)) updates[field] = Number(updates[field]);
      }
      const customerId = updates.customerId ?? appointment.customerId;
      const barberId = updates.barberId ?? appointment.barberId;
      const serviceId = updates.serviceId ?? appointment.serviceId;
      const startAt = Object.hasOwn(req.body, 'startAt') ? parseDateTime(req.body.startAt) : appointment.startAt;
      const scheduleChanged = barberId !== appointment.barberId || startAt.getTime() !== new Date(appointment.startAt).getTime();

      if (Object.hasOwn(req.body, 'customerId')) {
        if (!await Customer.findByPk(customerId, { transaction })) return { status: 404, body: { error: 'Customer not found' } };
      }
      if (Object.hasOwn(req.body, 'serviceId')) {
        const service = await Service.findByPk(serviceId, { transaction });
        if (!service) return { status: 404, body: { error: 'Service not found' } };
        if (!service.active) return { status: 400, body: { error: 'Service is inactive' } };
        updates.serviceName = service.name;
        updates.servicePrice = service.price;
      }

      const willBeActive = (updates.status ?? appointment.status) !== 'cancelled';
      const reactivating = appointment.status === 'cancelled' && willBeActive;
      const scheduleRequested = Object.hasOwn(req.body, 'startAt')
        || Object.hasOwn(req.body, 'barberId')
        || reactivating;
      if (scheduleRequested && willBeActive) {
        const reservationWindowError = getReservationWindowError(startAt);
        if (reservationWindowError) return { status: 400, body: { error: reservationWindowError } };
      }

      const occupancyChanged = (scheduleRequested && willBeActive)
        || (appointment.status !== 'cancelled' && !willBeActive)
        || reactivating;
      if (occupancyChanged) {
        const barbers = await lockBarbers([appointment.barberId, barberId], transaction);
        if (!barbers) return { status: 404, body: { error: 'Barber not found' } };
        if (scheduleRequested && willBeActive) {
          const barber = barbers.get(barberId);
          if (!barber.active) return { status: 400, body: { error: 'Barber is inactive' } };
          const schedule = await getSchedule(barberId, startAt, transaction);
          if (!fitsSchedule(schedule, startAt)) {
            return { status: 400, body: { error: 'Appointment must fit within the barber working schedule' } };
          }
        }
        if (willBeActive && (scheduleChanged || reactivating)) {
          if (await hasScheduleConflict(barberId, startAt, id, transaction)) {
            return { status: 409, body: { error: 'Barber already has an appointment at this time' } };
          }
        }
      }

      if (Object.hasOwn(req.body, 'startAt')) {
        updates.startAt = startAt;
        updates.endAt = endTimeFor(startAt);
      }
      await appointment.update(updates, { transaction });
      await appointment.reload({ include: associations, transaction });
      return { status: 200, body: appointment };
    });
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid appointment ID' });
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const appointment = await Appointment.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!appointment) return { status: 404, body: { error: 'Appointment not found' } };
      const barbers = await lockBarbers([appointment.barberId], transaction);
      if (!barbers) return { status: 404, body: { error: 'Barber not found' } };
      await appointment.update({ status: 'cancelled' }, { transaction });
      await appointment.reload({ include: associations, transaction });
      return { status: 200, body: appointment };
    });
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
