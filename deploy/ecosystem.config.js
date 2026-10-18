// PM2 keeps the API running and restarts it if it crashes or the server reboots.
module.exports = {
  apps: [
    {
      name: 'prasad-api',
      cwd: '/opt/prasad-shoes/server',
      script: 'dist/index.js',
      instances: 1,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      out_file: '/home/ubuntu/.pm2/logs/prasad-api.log',
      error_file: '/home/ubuntu/.pm2/logs/prasad-api-error.log',
      time: true,
    },
  ],
};
