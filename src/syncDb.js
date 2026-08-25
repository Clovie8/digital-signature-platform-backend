const { sequelize } = require('./models');

sequelize.sync({ alter: true })
  .then(() => {
    console.log('All tables synced successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });