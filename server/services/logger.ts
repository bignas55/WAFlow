import fs from "fs";
import path from "path";

/**
 * Structured Logging Service
 * Comprehensive logging for all application events
 */

interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  metadata?: Record<string, any>;
  stack?: string;
  userId?: number;
  tenantId?: number;
  requestId?: string;
}

interface HealthCheck {
  timestamp: string;
  database: "healthy" | "unhealthy";
  whatsapp: "healthy" | "unhealthy" | "unknown";
  memoryUsageMb: number;
  uptime: number;
  socketConnections: number;
}

class Logger {
  private logDir = process.env.LOG_DIR || "./logs";
  private isDev = process.env.NODE_ENV === "development";

  constructor() {
    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Format log entry as JSON
   */
  private formatLog(entry: LogEntry): string {
    return JSON.stringify({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString(),
    });
  }

  /**
   * Write log to file
   */
  private writeToFile(level: string, formatted: string) {
    try {
      const logFile = path.join(this.logDir, `${level}.log`);
      const allFile = path.join(this.logDir, "all.log");

      // Append to level-specific log
      fs.appendFileSync(logFile, formatted + "\n", "utf-8");

      // Append to all.log
      fs.appendFileSync(allFile, formatted + "\n", "utf-8");

      // Rotate logs if they get too large (>100MB)
      if (fs.statSync(logFile).size > 100 * 1024 * 1024) {
        this.rotateLog(logFile);
      }
    } catch (e) {
      console.error("Failed to write log:", e);
    }
  }

  /**
   * Rotate log file when it gets too large
   */
  private rotateLog(logFile: string) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedFile = logFile.replace(/.log$/, `.${timestamp}.log`);
      fs.renameSync(logFile, rotatedFile);

      // Compress old logs (optional - requires zlib)
      // fs.createReadStream(rotatedFile)
      //   .pipe(zlib.createGzip())
      //   .pipe(fs.createWriteStream(rotatedFile + ".gz"));
    } catch (e) {
      console.error("Failed to rotate log:", e);
    }
  }

  /**
   * Log debug message
   */
  debug(
    category: string,
    message: string,
    metadata?: Record<string, any>
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "debug",
      category,
      message,
      metadata,
    };

    const formatted = this.formatLog(entry);

    if (this.isDev) {
      console.log(`[DEBUG] ${category}: ${message}`, metadata || "");
    }

    this.writeToFile("debug", formatted);
  }

  /**
   * Log info message
   */
  info(
    category: string,
    message: string,
    metadata?: Record<string, any>
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      category,
      message,
      metadata,
    };

    const formatted = this.formatLog(entry);

    console.log(`[INFO] ${category}: ${message}`, metadata || "");
    this.writeToFile("info", formatted);
  }

  /**
   * Log warning message
   */
  warn(
    category: string,
    message: string,
    metadata?: Record<string, any>
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      category,
      message,
      metadata,
    };

    const formatted = this.formatLog(entry);

    console.warn(`[WARN] ${category}: ${message}`, metadata || "");
    this.writeToFile("warn", formatted);
  }

  /**
   * Log error message with stack trace
   */
  error(
    category: string,
    message: string,
    error?: Error | string,
    metadata?: Record<string, any>
  ) {
    const isError = error instanceof Error;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      category,
      message,
      metadata,
      stack: isError ? error.stack : undefined,
    };

    const formatted = this.formatLog(entry);

    console.error(
      `[ERROR] ${category}: ${message}`,
      isError ? error : error || "",
      metadata || ""
    );

    this.writeToFile("error", formatted);
  }

  /**
   * Log with user context
   */
  withUser(
    userId: number,
    category: string,
    message: string,
    metadata?: Record<string, any>
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      category,
      message,
      metadata,
      userId,
    };

    const formatted = this.formatLog(entry);
    console.log(`[INFO] ${category} (User: ${userId}): ${message}`);
    this.writeToFile("info", formatted);
  }

  /**
   * Log with tenant context
   */
  withTenant(
    tenantId: number,
    category: string,
    message: string,
    metadata?: Record<string, any>
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      category,
      message,
      metadata,
      tenantId,
    };

    const formatted = this.formatLog(entry);
    console.log(`[INFO] ${category} (Tenant: ${tenantId}): ${message}`);
    this.writeToFile("info", formatted);
  }

  /**
   * Log API request
   */
  logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    userId?: number
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 400 ? "warn" : "info",
      category: "API",
      message: `${method} ${path} - ${statusCode}`,
      metadata: { duration: `${duration}ms`, statusCode },
      userId,
    };

    const formatted = this.formatLog(entry);
    this.writeToFile("info", formatted);
  }

  /**
   * Log database query
   */
  logQuery(query: string, duration: number, tenantId?: number) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "debug",
      category: "DATABASE",
      message: "Query executed",
      metadata: { duration: `${duration}ms`, query: query.slice(0, 100) },
      tenantId,
    };

    const formatted = this.formatLog(entry);

    if (duration > 1000) {
      // Log slow queries as warnings
      console.warn(`[SLOW QUERY] ${duration}ms: ${query.slice(0, 50)}`);
      this.writeToFile("warn", formatted);
    } else if (this.isDev) {
      this.writeToFile("debug", formatted);
    }
  }

  /**
   * Log health check status
   */
  logHealthCheck(health: HealthCheck) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      category: "HEALTH",
      message: "Health check",
      metadata: health,
    };

    const formatted = this.formatLog(entry);
    this.writeToFile("info", formatted);
  }

  /**
   * Get logs from file
   */
  async getLogs(
    level: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<LogEntry[]> {
    try {
      const logFile = path.join(this.logDir, `${level}.log`);

      if (!fs.existsSync(logFile)) {
        return [];
      }

      const lines = fs
        .readFileSync(logFile, "utf-8")
        .split("\n")
        .filter((l) => l.trim());

      // Get last N lines (most recent)
      const recent = lines.slice(-limit - offset, -offset || undefined);

      return recent.map((line) => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch (e) {
          return null;
        }
      }).filter(Boolean) as LogEntry[];
    } catch (e) {
      console.error("Failed to read logs:", e);
      return [];
    }
  }

  /**
   * Clean up old logs (older than days)
   */
  async cleanupOldLogs(olderThanDays: number = 30) {
    try {
      const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

      const files = fs.readdirSync(this.logDir);

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoff && file.includes(".")) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old log: ${file}`);
        }
      }
    } catch (e) {
      console.error("Failed to cleanup old logs:", e);
    }
  }
}

export const logger = new Logger();
