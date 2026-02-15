import { Context } from 'hono';
import { SQL } from 'bun';

export interface HealthCheckDependencies {
  db: SQL;
}

interface ServiceStatus {
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    api: ServiceStatus;
    database: ServiceStatus;
  };
}

async function checkDatabase(db: SQL): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await db`SELECT 1`;
    return {
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

export function createHealthCheckHandler(deps: HealthCheckDependencies) {
  return async (c: Context) => {
    const startTime = Date.now();

    const databaseStatus = await checkDatabase(deps.db);

    const apiStatus: ServiceStatus = {
      status: 'healthy',
      latency: Date.now() - startTime,
    };

    const overallStatus = databaseStatus.status === 'healthy' ? 'healthy' : 'unhealthy';

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        api: apiStatus,
        database: databaseStatus,
      },
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;

    return c.json(response, statusCode);
  };
}

export function createLivenessHandler() {
  return (c: Context) => {
    return c.json({ 
      status: 'alive', 
      timestamp: new Date().toISOString() 
    }, 200);
  };
}

export function createReadinessHandler(deps: { db: SQL }) {
  return async (c: Context) => {
    const databaseStatus = await checkDatabase(deps.db);
    const isReady = databaseStatus.status === 'healthy';

    return c.json(
      {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseStatus,
        },
      },
      isReady ? 200 : 503
    );
  };
}
