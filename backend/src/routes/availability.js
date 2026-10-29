'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { Appointment, Barber, WorkingSchedule } = require('../models');
const { isWithinReservationWindow } = require('../utils/reservationWindow');
const { businessDayRange } = require('../utils/businessDay');
const { slotInstant } = require('../utils/appointmentTime');

const router = express.Router();

function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function timeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 60 + minutes + seconds / 60;
}

router.get('/', async (req, res) => {
  const barberId = parseId(req.query.barberId);
  if (barberId === null) return res.status(400).json({ error: 'barberId is required and must be a positive integer' });

  const date = parseDate(req.query.date);
  if (!date) return res.status(400).json({ error: 'date is required and must use YYYY-MM-DD format' });

  try {
    const barber = await Barber.findByPk(barberId);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });
    if (!barber.active) return res.status(400).json({ error: 'Barber is inactive' });

    const dayOfWeek = date.getUTCDay();
    const schedule = await WorkingSchedule.findOne({ where: { barberId, dayOfWeek } });
    if (!schedule) return res.status(200).json({ date: req.query.date, barberId, availableSlots: [], slotStartsAt: {} });

    const startMinute = timeToMinutes(schedule.startTime);
    const endMinute = timeToMinutes(schedule.endTime);
    if (startMinute === null || endMinute === null || startMinute >= endMinute) {
      return res.status(500).json({ error: 'Invalid working schedule' });
    }

    const { start, end } = businessDayRange(req.query.date);
    const appointments = await Appointment.findAll({
      attributes: ['startAt'],
      where: {
        barberId,
        status: { [Op.ne]: 'cancelled' },
        startAt: { [Op.gte]: start, [Op.lt]: end },
      },
    });
    const occupiedSlots = new Set(appointments.map((appointment) => new Date(appointment.startAt).getTime()));

    const availableSlots = [];
    const slotStartsAt = {};
    const now = new Date();
    let slotStart = Math.ceil(startMinute / 60) * 60;
    while (slotStart + 60 <= endMinute) {
      const slot = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}`;
      const slotAt = slotInstant(req.query.date, slot);
      if (slotAt && !occupiedSlots.has(slotAt.getTime()) && isWithinReservationWindow(slotAt, now)) {
        availableSlots.push(slot);
        slotStartsAt[slot] = slotAt.toISOString();
      }
      slotStart += 60;
    }

    return res.status(200).json({ date: req.query.date, barberId, availableSlots, slotStartsAt });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
