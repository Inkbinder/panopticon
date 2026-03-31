import cron from 'node-cron';
import { logger } from './logger';

let inProgress = false;

const task = async (): Promise<void> => {
  logger.info('running a task every minute');
};

const runTask = async (): Promise<void> => {
  if (inProgress) return;
  inProgress = true;

  try {
    await task();
  } catch (err) {
    logger.error('task failed', err);
  } finally {
    inProgress = false;
  }
};

void runTask();

cron.schedule('* * * * *', () => {
  void runTask();
});