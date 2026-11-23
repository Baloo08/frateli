import { Queue } from "bullmq";
import { getQueueRedis } from "./redis";

const globalForQueues = globalThis as unknown as {
  __emailQueue?: Queue;
  __videoQueue?: Queue;
  __driveImportQueue?: Queue;
};

export function getEmailQueue(): Queue {
  if (!globalForQueues.__emailQueue) {
    globalForQueues.__emailQueue = new Queue("email-send", {
      connection: getQueueRedis(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueues.__emailQueue;
}

export function getVideoQueue(): Queue {
  if (!globalForQueues.__videoQueue) {
    globalForQueues.__videoQueue = new Queue("video-process", {
      connection: getQueueRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return globalForQueues.__videoQueue;
}

export function getDriveImportQueue(): Queue {
  if (!globalForQueues.__driveImportQueue) {
    globalForQueues.__driveImportQueue = new Queue("drive-import", {
      connection: getQueueRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return globalForQueues.__driveImportQueue;
}
