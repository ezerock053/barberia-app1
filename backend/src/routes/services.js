'use strict';

const express = require('express');
const { Service } = require('../models');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const services = await Service.findAll({
      where: { active: true },
      order: [['name', 'ASC']],
    });

    return res.status(200).json(services);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;