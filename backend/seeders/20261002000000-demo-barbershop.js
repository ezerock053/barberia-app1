'use strict';

const services = [
  { name: 'Corte clásico', description: 'Corte a tijera o máquina, terminado y peinado.', price: '12000.00' },
  { name: 'Corte y barba', description: 'Corte completo y perfilado de barba con toalla caliente.', price: '18000.00' },
  { name: 'Arreglo de barba', description: 'Perfilado y cuidado de barba.', price: '8000.00' },
  { name: 'Corte de cabello y lavado', description: 'Corte, lavado y peinado para todos los días.', price: '14000.00' },
];

const barbers = [
  { name: 'Mateo González', phone: null, image: null, active: true },
  { name: 'Lucas Fernández', phone: null, image: null, active: true },
  { name: 'Tomás Rodríguez', phone: null, image: null, active: true },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    for (const service of services) {
      const [record] = await queryInterface.sequelize.query(
        'SELECT id FROM services WHERE name = :name LIMIT 1',
        { replacements: { name: service.name }, type: Sequelize.QueryTypes.SELECT },
      );
      if (!record) {
        await queryInterface.bulkInsert('services', [{
          ...service, active: true, createdAt: now, updatedAt: now,
        }]);
      }
    }

    for (const barber of barbers) {
      const [record] = await queryInterface.sequelize.query(
        'SELECT id FROM barbers WHERE name = :name LIMIT 1',
        { replacements: { name: barber.name }, type: Sequelize.QueryTypes.SELECT },
      );
      if (!record) {
        await queryInterface.bulkInsert('barbers', [{
          ...barber, createdAt: now, updatedAt: now,
        }]);
      }
      const [savedBarber] = record ? [record] : await queryInterface.sequelize.query(
        'SELECT id FROM barbers WHERE name = :name LIMIT 1',
        { replacements: { name: barber.name }, type: Sequelize.QueryTypes.SELECT },
      );
      const barberId = savedBarber.id;

      for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
        const [schedule] = await queryInterface.sequelize.query(
          'SELECT id FROM working_schedules WHERE barberId = :barberId AND dayOfWeek = :dayOfWeek LIMIT 1',
          { replacements: { barberId, dayOfWeek }, type: Sequelize.QueryTypes.SELECT },
        );
        if (!schedule) {
          await queryInterface.bulkInsert('working_schedules', [{
            barberId,
            dayOfWeek,
            startTime: '10:00:00',
            endTime: dayOfWeek === 6 ? '17:00:00' : '19:00:00',
            createdAt: now,
            updatedAt: now,
          }]);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const barberNames = barbers.map(({ name }) => name);
    const barberIds = await queryInterface.sequelize.query(
      'SELECT id FROM barbers WHERE name IN (:names)',
      { replacements: { names: barberNames }, type: Sequelize.QueryTypes.SELECT },
    );
    const ids = barberIds.map(({ id }) => id);
    if (ids.length) {
      await queryInterface.bulkDelete('working_schedules', { barberId: ids });
      await queryInterface.bulkDelete('barbers', { id: ids });
    }
    await queryInterface.bulkDelete('services', { name: services.map(({ name }) => name) });
  },
};
