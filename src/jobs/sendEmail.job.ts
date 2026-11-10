import { z } from "zod";
import type { JobHandler } from "../shared/jobs/job-runner.ts";
import type { NotificationsService } from "../modules/notifications/index.ts";

const payload = z.object({ deliveryId: z.uuid() });

export const sendEmailJob =
  (notifications: NotificationsService): JobHandler =>
  (raw, ctx) =>
    notifications.deliver(payload.parse(raw).deliveryId, ctx);
