'use strict';

const express = require('express');
const { Barber, WorkingSchedule } = require('../models');

const router = express.Router({ mergeParams: true });
const editableFields = ['dayOfWeek', 'startTime', 'endTime'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidDay(value) {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  return hours <= 23 && minutes <= 59 && seconds <= 59;
}

function timeToSeconds(value) {
  const [hours, minutes, seconds = '0'] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function validateSchedule(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'A JSON object is required';
  }

  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !editableFields.includes(key))) {
    return 'Provide valid schedule fields to update';
  }
  if (!isValidDay(body.dayOfWeek)) {
    return 'dayOfWeek must be an integer between 0 and 6';
  }
  if (!isValidTime(body.startTime) || !isValidTime(body.endTime)) {
    return 'startTime and endTime must be valid times in HH:mm or HH:mm:ss format';
  }
  if (timeToSeconds(body.startTime) >= timeToSeconds(body.endTime)) {
    return 'startTime must be earlier than endTime';
  }
  return null;
}

function isUniqueConstraintError(error) {
  return error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'ER_DUP_ENTRY';
}

router.get('/', async (req, res) => {
  const barberId = parseId(req.params.barberId);
  if (!barberId) return res.status(400).json({ error: 'Invalid barber ID' });

  try {
    const barber = await Barber.findByPk(barberId);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    const schedules = await WorkingSchedule.findAll({
      where: { barberId },
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']],
    });
    return res.status(200).json(schedules);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const barberId = parseId(req.params.barberId);
  if (!barberId) return res.status(400).json({ error: 'Invalid barber ID' });

  const validationError = validateSchedule(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const barber = await Barber.findByPk(barberId);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    const schedule = await WorkingSchedule.create({ ...req.body, barberId });
    return res.status(201).json(schedule);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'A schedule already exists for this barber and day' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const barberId = parseId(req.params.barberId);
  const scheduleId = parseId(req.params.id);
  if (!barberId) return res.status(400).json({ error: 'Invalid barber ID' });
  if (!scheduleId) return res.status(400).json({ error: 'Invalid schedule ID' });

  try {
    const barber = await Barber.findByPk(barberId);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    const schedule = await WorkingSchedule.findOne({ where: { id: scheduleId, barberId } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'A JSON object is required' });
    }
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((key) => !editableFields.includes(key))) {
      return res.status(400).json({ error: 'Provide valid schedule fields to update' });
    }

    const updates = {
      dayOfWeek: Object.hasOwn(body, 'dayOfWeek') ? body.dayOfWeek : schedule.dayOfWeek,
      startTime: Object.hasOwn(body, 'startTime') ? body.startTime : schedule.startTime,
      endTime: Object.hasOwn(body, 'endTime') ? body.endTime : schedule.endTime,
    };
    const validationError = validateSchedule(updates);
    if (validationError) return res.status(400).json({ error: validationError });

    await schedule.update(updates);
    return res.status(200).json(schedule);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'A schedule already exists for this barber and day' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const barberId = parseId(req.params.barberId);
  const scheduleId = parseId(req.params.id);
  if (!barberId) return res.status(400).json({ error: 'Invalid barber ID' });
  if (!scheduleId) return res.status(400).json({ error: 'Invalid schedule ID' });

  try {
    const barber = await Barber.findByPk(barberId);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    const schedule = await WorkingSchedule.findOne({ where: { id: scheduleId, barberId } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    await schedule.destroy();
    return res.status(200).json({ message: 'Schedule deleted' });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
