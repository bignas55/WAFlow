/**
 * PM2 Ecosystem Config — WAFlow
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload waflow --update-env
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name:        "waflow",
      script:      "server/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      cwd:         "/var/www/waflow/source",

      // Instances & clustering
      instances:   1,           // set to "max" for multi-core (requires sticky sessions)
      exec_mode:   "fork",

      // Env
      env_production: {
        NODE_ENV:    "production",
        PORT:        3000,
      },

      // Logs
      out_file:    "/var/log/waflow/out.log",
      error_file:  "/var/log/waflow/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs:  true,

      // Auto-restart on crash
      autorestart:    true,
      restart_delay:  3000,
      max_restarts:   10,
      min_uptime:     "10s",

      // Memory limit (restart if exceeded)
      max_memory_restart: "1G",

      // Watch (disabled in production — use deploy.sh to restart)
      watch:       false,
    },
  ],
};
