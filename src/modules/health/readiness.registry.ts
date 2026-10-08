import { Injectable } from '@nestjs/common';

export interface ReadinessCheck {
  readonly name: string;
  /**
   * critical = the process cannot do useful work without it (PostgreSQL).
   * non-critical = the system degrades gracefully (Redis, Kafka, RabbitMQ), so the
   * pod stays in rotation but readiness reports "degraded".
   */
  readonly critical: boolean;
  check(): Promise<void>;
}

/**
 * Infrastructure modules register their own check in onModuleInit (Phase 3), so the
 * health module never imports a database/broker driver.
 */
@Injectable()
export class ReadinessRegistry {
  private readonly checks = new Map<string, ReadinessCheck>();

  register(check: ReadinessCheck): void {
    this.checks.set(check.name, check);
  }

  all(): ReadinessCheck[] {
    return [...this.checks.values()];
  }
}
