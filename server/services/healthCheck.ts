import { db } from "../db";
import { users } from "../../drizzle/schema";
import { logger } from "./logger";

/**
 * Health Check Service
 * Monitors system health and reports on critical components
 */

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMemoryMb: number;
  };
  database: {
    status: "healthy" | "unhealthy";
    responseTime: number;
    error?: string;
  };
  whatsapp: {
    status: "healthy" | "unknown";
    connectedTenants: number;
    error?: string;
  };
  api: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
  };
}

class HealthCheckService {
  private requestMetrics = {
    count: 0,
    errors: 0,
    totalTime: 0,
  };

  private tenantConnections = new Map<number, boolean>();

  /**
   * Get current memory usage
   */
  private getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      rssMemoryMb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
    };
  }

  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<{
    status: "healthy" | "unhealthy";
    responseTime: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      // Run a simple query to check connectivity
      await db.query.users.findFirst();
      const responseTime = Date.now() - start;

      return {
        status: "healthy",
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - start;
      logger.error("HEALTH_CHECK", "Database health check failed", error as Error);

      return {
        status: "unhealthy",
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(responseTime: number, isError: boolean = false) {
    this.requestMetrics.count++;
    this.requestMetrics.totalTime += responseTime;
    if (isError) {
      this.requestMetrics.errors++;
    }
  }

  /**
   * Register WhatsApp tenant connection
   */
  registerTenantConnection(tenantId: number, connected: boolean) {
    this.tenantConnections.set(tenantId, connected);
  }

  /**
   * Get WhatsApp status
   */
  getWhatsAppStatus(): {
    status: "healthy" | "unknown";
    connectedTenants: number;
  } {
    const connectedCount = Array.from(this.tenantConnections.values()).filter(
      (c) => c
    ).length;

    return {
      status: connectedCount > 0 ? "healthy" : "unknown",
      connectedTenants: connectedCount,
    };
  }

  /**
   * Get API metrics
   */
  getApiMetrics() {
    return {
      requestCount: this.requestMetrics.count,
      errorCount: this.requestMetrics.errors,
      averageResponseTime:
        this.requestMetrics.count > 0
          ? Math.round(this.requestMetrics.totalTime / this.requestMetrics.count)
          : 0,
    };
  }

  /**
   * Reset metrics (usually called periodically)
   */
  resetMetrics() {
    this.requestMetrics = {
      count: 0,
      errors: 0,
      totalTime: 0,
    };
  }

  /**
   * Perform full health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const memory = this.getMemoryUsage();
    const database = await this.checkDatabase();
    const whatsapp = this.getWhatsAppStatus();
    const api = this.getApiMetrics();

    // Determine overall status
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (database.status === "unhealthy") {
      status = "unhealthy";
    } else if (
      memory.heapUsedMb > memory.heapTotalMb * 0.9 ||
      api.errorCount > 100
    ) {
      status = "degraded";
    }

    const health: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory,
      database,
      whatsapp,
      api,
    };

    // Log health check
    logger.logHealthCheck(health as any);

    return health;
  }

  /**
   * Check if system is healthy
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.performHealthCheck();
    return health.status !== "unhealthy";
  }

  /**
   * Get alerts if there are issues
   */
  getAlerts(): string[] {
    const alerts: string[] = [];
    const memory = this.getMemoryUsage();
    const api = this.getApiMetrics();

    if (memory.heapUsedMb > memory.heapTotalMb * 0.9) {
      alerts.push(
        `High memory usage: ${memory.heapUsedMb}MB / ${memory.heapTotalMb}MB`
      );
    }

    if (api.errorCount > 100) {
      alerts.push(`High error rate: ${api.errorCount} errors in last period`);
    }

    if (api.averageResponseTime > 5000) {
      alerts.push(
        `Slow responses: Average ${api.averageResponseTime}ms per request`
      );
    }

    return alerts;
  }
}

export const healthCheck = new HealthCheckService();

/**
 * Start periodic health checks
 */
export function startHealthCheckScheduler(intervalMs: number = 60000) {
  setInterval(async () => {
    const health = await healthCheck.performHealthCheck();

    if (health.status !== "healthy") {
      logger.warn(
        "HEALTH_CHECK",
        `System health degraded: ${health.status}`,
        health
      );
    }

    const alerts = healthCheck.getAlerts();
    if (alerts.length > 0) {
      logger.warn("HEALTH_ALERTS", alerts.join("; "));
    }

    // Reset metrics for next period
    healthCheck.resetMetrics();
  }, intervalMs);

  logger.info("HEALTH_CHECK", `Health check scheduler started (${intervalMs}ms interval)`);
}

/**
 * Health check endpoint handler
 */
export async function handleHealthCheck(req: any, res: any) {
  try {
    const health = await healthCheck.performHealthCheck();

    // Return 503 if unhealthy, 200 if healthy
    const statusCode = health.status === "unhealthy" ? 503 : 200;

    res.status(statusCode).json(health);
  } catch (error) {
    logger.error("HEALTH_CHECK", "Failed to perform health check", error as Error);
    res.status(500).json({
      status: "unhealthy",
      error: "Failed to perform health check",
    });
  }
}
