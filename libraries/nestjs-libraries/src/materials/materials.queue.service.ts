import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobsOptions, Queue, QueueEvents, Worker } from 'bullmq';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import {
  MediaCrawlerPlatform,
  MediaCrawlerService,
} from '@gitroom/nestjs-libraries/materials/materials.crawler.service';
import { MaterialsService } from '@gitroom/nestjs-libraries/materials/materials.service';
import {
  MaterialsEventPayload,
  MaterialsEventsService,
} from '@gitroom/nestjs-libraries/materials/materials.events.service';

const DEFAULT_QUEUE_NAME = 'materials';
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 5000;
const DEFAULT_STALLED_INTERVAL_MS = 30000;
const DEFAULT_MAX_STALLED_COUNT = 2;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_JOB_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_PAGE_LIMIT = 1;
const DEFAULT_PAGE_SIZE = 20;

export interface MaterialsJobData {
  orgId: string;
  platform: MediaCrawlerPlatform;
  keywords: string;
  startPage: number;
  pageLimit?: number;
  queryHash?: string;
  startedAt?: string;
  consumedPaths?: string[];
}

export interface MaterialsJobResult {
  resultPath?: string;
  count?: number;
  preview?: unknown;
}

export interface MaterialsJobStatus {
  jobId: string;
  state: string;
  progress: number;
  message?: string;
  error?: string | null;
}

@Injectable()
export class MaterialsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaterialsQueueService.name);
  private queue: Queue<MaterialsJobData, MaterialsJobResult> | null = null;
  private worker: Worker<MaterialsJobData, MaterialsJobResult> | null = null;
  private events: QueueEvents | null = null;
  private dlq: Queue<MaterialsJobData, MaterialsJobResult> | null = null;
  private readonly enabled = Boolean(process.env.REDIS_URL);
  private readonly queueName: string;
  private readonly dlqName: string;
  private readonly logsForwardingEnabled: boolean;

  constructor(
    private readonly crawler: MediaCrawlerService,
    private readonly materials: MaterialsService,
    private readonly eventsService: MaterialsEventsService
  ) {
    this.queueName = process.env.MATERIALS_QUEUE_NAME || DEFAULT_QUEUE_NAME;
    this.dlqName =
      process.env.MATERIALS_DLQ_NAME || `${this.queueName}-dlq`;
    this.logsForwardingEnabled =
      process.env.ENABLE_CRAWLER_LOGS_FORWARDING !== 'false';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('REDIS_URL is not set; materials queue is disabled.');
      return;
    }

    const connection = ioRedis;
    const attempts = this.parseNumber(
      process.env.MATERIALS_JOB_ATTEMPTS,
      DEFAULT_ATTEMPTS
    );
    const backoffMs = this.parseNumber(
      process.env.MATERIALS_JOB_BACKOFF_MS,
      DEFAULT_BACKOFF_MS
    );
    const stalledIntervalMs = this.parseNumber(
      process.env.MATERIALS_JOB_STALLED_INTERVAL_MS,
      DEFAULT_STALLED_INTERVAL_MS
    );
    const maxStalledCount = this.parseNumber(
      process.env.MATERIALS_JOB_MAX_STALLED_COUNT,
      DEFAULT_MAX_STALLED_COUNT
    );

    const jobOptions: JobsOptions = {
      attempts,
      backoff: { type: 'exponential', delay: backoffMs },
      removeOnComplete: { age: 60 * 60 * 24 * 7 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    };

    this.queue = new Queue(this.queueName, {
      connection,
      defaultJobOptions: jobOptions,
    });
    this.dlq = new Queue(this.dlqName, { connection });
    this.events = new QueueEvents(this.queueName, { connection });
    this.worker = new Worker(
      this.queueName,
      (job) => this.handleJob(job),
      {
        connection,
        concurrency: 1,
        stalledInterval: stalledIntervalMs,
        maxStalledCount,
      }
    );

    this.worker.on('failed', async (job, error) => {
      if (!job) {
        return;
      }
      const jobId = this.getJobId(job);
      const payload: MaterialsEventPayload = {
        type: 'error',
        state: 'failed',
        message: error?.message || 'Crawler failed',
      };
      this.emitEvent(jobId, payload);
      await this.dlq?.add('dead', { ...job.data }, jobOptions);
    });

    await this.cleanupZombieCrawler();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.events?.close();
    await this.queue?.close();
    await this.dlq?.close();
  }

  async enqueueJob(jobId: string, data: MaterialsJobData) {
    this.ensureEnabled();
    if (!this.queue) {
      throw new Error('Materials queue is not initialized.');
    }
    const job = await this.queue.add('crawl', data, { jobId });
    this.emitEvent(job.id ?? jobId, {
      type: 'status',
      state: 'queued',
      progress: 0,
      message: 'Queued for crawling',
    });
    return job;
  }

  async addSearchJob(orgId: string, params: Omit<MaterialsJobData, 'orgId'>) {
    const jobId = uuidv4();
    const data: MaterialsJobData = {
      ...params,
      orgId,
    };
    return this.enqueueJob(jobId, data);
  }

  async getJobStatus(jobId: string): Promise<MaterialsJobStatus | null> {
    this.ensureEnabled();
    if (!this.queue) {
      throw new Error('Materials queue is not initialized.');
    }
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }
    const state = await job.getState();
    const { progress, message } = this.extractProgress(job.progress);
    const error = job.failedReason || null;
    return {
      jobId,
      state: this.mapQueueState(state, progress),
      progress,
      message,
      error,
    };
  }

  async getJobResult(jobId: string): Promise<MaterialsJobResult | null> {
    this.ensureEnabled();
    if (!this.queue) {
      throw new Error('Materials queue is not initialized.');
    }
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }
    const state = await job.getState();
    if (state !== 'completed') {
      return null;
    }
    return (job.returnvalue as MaterialsJobResult) ?? null;
  }

  async getJobData(jobId: string): Promise<MaterialsJobData | null> {
    this.ensureEnabled();
    if (!this.queue) {
      throw new Error('Materials queue is not initialized.');
    }
    const job = await this.queue.getJob(jobId);
    return job?.data ?? null;
  }

  async getJob(jobId: string) {
    this.ensureEnabled();
    if (!this.queue) {
      throw new Error('Materials queue is not initialized.');
    }
    return this.queue.getJob(jobId);
  }

  private async handleJob(job: Job<MaterialsJobData, MaterialsJobResult>) {
    const startedAt = new Date();
    await job.updateData({
      ...job.data,
      startedAt: startedAt.toISOString(),
      consumedPaths: job.data.consumedPaths ?? [],
    });

    await job.updateProgress({
      state: 'running',
      progress: 0.05,
      message: 'Checking login status...',
    });
    const jobId = this.getJobId(job);
    this.emitEvent(jobId, {
      type: 'status',
      state: 'running',
      progress: 0.05,
      message: 'Checking login status...',
    });

    // Check login status to determine headless mode
    const loginStatus = await this.crawler.checkLoginStatus(job.data.platform);
    const useHeadless = loginStatus.has_valid_login;

    this.logger.log(
      `[handleJob] Platform: ${job.data.platform}, ` +
      `hasValidLogin: ${loginStatus.has_valid_login}, ` +
      `recommendation: ${loginStatus.recommendation}, ` +
      `message: ${loginStatus.message}`
    );

    this.emitEvent(jobId, {
      type: 'status',
      state: 'running',
      progress: 0.1,
      message: useHeadless
        ? 'Valid login found, using headless mode'
        : 'No valid login, browser window will open for QR code login',
    });

    await this.crawler.startCrawl({
      platform: job.data.platform,
      crawler_type: 'search',
      keywords: job.data.keywords,
      client_job_id: jobId || undefined,
      login_type: 'qrcode',
      save_option: 'json',
      start_page: job.data.startPage,
      crawl_count: this.getCrawlCount(job.data),
      headless: useHeadless,  // Intelligent headless mode switching
    });

    const result = await this.monitorCrawler(job, startedAt);
    return result;
  }

  private async monitorCrawler(
    job: Job<MaterialsJobData, MaterialsJobResult>,
    startedAt: Date
  ): Promise<MaterialsJobResult> {
    const timeoutMs = this.getTimeoutMs();
    const pollIntervalMs = this.getPollIntervalMs();
    let lastLogId = 0;
    let sawRunning = false;
    const startedAtMs = Date.now();

    while (true) {
      if (Date.now() - startedAtMs > timeoutMs) {
        throw new Error('Crawler timed out');
      }

      const status = await this.crawler.getStatus();
      if (status.status === 'running') {
        sawRunning = true;
      }
      const normalizedState = this.mapCrawlerState(status.status);
      const progressValue =
        normalizedState === 'running'
          ? 0.5
          : normalizedState === 'succeeded'
            ? 1
            : 0.9;
      await job.updateProgress({
        state: normalizedState,
        progress: progressValue,
        message: status.error_message || undefined,
      });

      const jobId = this.getJobId(job);
      this.emitEvent(jobId, {
        type: 'status',
        state: normalizedState,
        progress: progressValue,
        message: status.error_message || undefined,
      });

      lastLogId = await this.emitLogs(jobId, lastLogId, job.data.platform);

      if (status.status === 'idle') {
        if (!sawRunning) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          continue;
        }
        break;
      }
      if (status.status === 'error') {
        throw new Error(status.error_message || 'Crawler failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    let consumedPaths = job.data.consumedPaths ?? [];
    let resolved = await this.materials.resolveOutputForJob({
      jobId: this.getJobId(job),
      platform: job.data.platform,
      startedAt,
      consumedPaths,
    });

    if (!resolved) {
      throw new Error('No output file found for job');
    }

    if (this.isNonContentPayload(resolved.data, job.data.platform)) {
      consumedPaths = [...consumedPaths, resolved.file.path];
      await job.updateData({ ...job.data, consumedPaths });
      resolved = await this.materials.resolveOutputForJob({
        jobId: this.getJobId(job),
        platform: job.data.platform,
        startedAt,
        consumedPaths,
      });
      if (!resolved) {
        throw new Error('No content output file found for job');
      }
      if (this.isNonContentPayload(resolved.data, job.data.platform)) {
        throw new Error('Non-content output file found for job');
      }
    }

    const { count, preview } = this.extractResultSummary(resolved.data);
    const updatedConsumed = [...consumedPaths, resolved.file.path];
    await job.updateData({ ...job.data, consumedPaths: updatedConsumed });

    this.emitEvent(this.getJobId(job), {
      type: 'result',
      count,
      preview,
    });

    await this.cacheResult(job, {
      resultPath: resolved.file.path,
      count,
      preview,
    });

    return {
      resultPath: resolved.file.path,
      count,
      preview,
    };
  }

  private async emitLogs(
    jobId: string,
    lastLogId: number,
    platform: MediaCrawlerPlatform
  ) {
    if (!this.logsForwardingEnabled) {
      return lastLogId;
    }
    if (!jobId) {
      return lastLogId;
    }
    const logs = await this.crawler.getLogs();
    const newLogs = logs.filter((log) => log.id > lastLogId);
    for (const log of newLogs) {
      if (log.client_job_id && log.client_job_id !== jobId) {
        continue;
      }
      const qrCode = this.extractQrCode(log.message);
      if (qrCode) {
        this.emitEvent(jobId, {
          type: 'login_qrcode',
          platform,
          base64_image: qrCode,
          message: 'Scan the QR code to continue',
        });
        this.emitEvent(jobId, {
          type: 'status',
          state: 'login_required',
          progress: 0.2,
          message: 'Login required',
        });
        continue;
      }
      if (this.isLoginSuccessMessage(log.message)) {
        this.emitEvent(jobId, { type: 'login_success', platform });
      }
      this.emitEvent(jobId, {
        type: 'log',
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
      });
    }
    if (newLogs.length > 0) {
      return newLogs[newLogs.length - 1].id;
    }
    return lastLogId;
  }

  private async cleanupZombieCrawler() {
    try {
      const status = await this.crawler.getStatus();
      if (status.status === 'running' || status.status === 'stopping') {
        this.logger.warn('Detected running crawler on startup. Sending stop...');
        await this.crawler.stopCrawl();
      }
    } catch (error) {
      this.logger.warn('Unable to check MediaCrawler status on startup.');
    }
  }

  private mapCrawlerState(status: string) {
    switch (status) {
      case 'running':
      case 'stopping':
        return status;
      case 'idle':
        return 'succeeded';
      case 'error':
        return 'failed';
      default:
        return status;
    }
  }

  private mapQueueState(state: string, progress: number) {
    if (state === 'waiting' || state === 'delayed') {
      return 'queued';
    }
    if (state === 'active') {
      return progress >= 1 ? 'succeeded' : 'running';
    }
    if (state === 'completed') {
      return 'succeeded';
    }
    if (state === 'failed') {
      return 'failed';
    }
    return state;
  }

  private extractProgress(progress: unknown) {
    if (typeof progress === 'number') {
      return { progress, message: undefined as string | undefined };
    }
    if (
      typeof progress === 'object' &&
      progress !== null &&
      'progress' in progress
    ) {
      const value = progress as { progress?: number; message?: string };
      return {
        progress: value.progress ?? 0,
        message: value.message,
      };
    }
    return { progress: 0, message: undefined as string | undefined };
  }

  private extractResultSummary(data: unknown) {
    if (data && typeof data === 'object' && 'data' in data) {
      const payload = data as { data?: unknown[]; total?: number };
      const list = Array.isArray(payload.data) ? payload.data : [];
      return {
        count: payload.total ?? list.length,
        preview: list.slice(0, 5),
      };
    }
    if (Array.isArray(data)) {
      return { count: data.length, preview: data.slice(0, 5) };
    }
    return { count: 0, preview: null };
  }

  private getCrawlCount(data: MaterialsJobData) {
    const pages =
      typeof data.pageLimit === 'number' && data.pageLimit > 0
        ? Math.floor(data.pageLimit)
        : DEFAULT_PAGE_LIMIT;
    const pageSize = this.getPageSize(data.platform);
    return pages * pageSize;
  }

  private getPageSize(platform: MediaCrawlerPlatform) {
    if (platform === 'xhs') {
      return this.parseNumber(
        process.env.MATERIALS_PAGE_SIZE_XHS,
        DEFAULT_PAGE_SIZE
      );
    }
    if (platform === 'dy') {
      return this.parseNumber(
        process.env.MATERIALS_PAGE_SIZE_DY,
        DEFAULT_PAGE_SIZE
      );
    }
    return this.parseNumber(
      process.env.MATERIALS_PAGE_SIZE_DEFAULT,
      DEFAULT_PAGE_SIZE
    );
  }

  private extractQrCode(message: string) {
    const marker = 'QRCODE_BASE64:';
    const index = message.indexOf(marker);
    if (index < 0) {
      return null;
    }
    return message.slice(index + marker.length).trim();
  }

  private isLoginSuccessMessage(message: string) {
    return (
      /login .*successful/i.test(message) ||
      message.includes('登录成功') ||
      message.includes('Login successful')
    );
  }

  private isNonContentPayload(
    payload: unknown,
    platform: MediaCrawlerPlatform
  ) {
    const items = this.extractPayloadItems(payload);
    if (items.length === 0) {
      return false;
    }
    const sample = items.find(
      (item) => item && typeof item === 'object'
    ) as Record<string, unknown> | undefined;
    if (!sample) {
      return false;
    }
    if ('comment_id' in sample) {
      return true;
    }
    if (platform === 'xhs') {
      return !('note_id' in sample);
    }
    if (platform === 'dy') {
      return !('aweme_id' in sample);
    }
    return false;
  }

  private extractPayloadItems(payload: unknown) {
    if (Array.isArray(payload)) {
      return payload as unknown[];
    }
    if (
      payload &&
      typeof payload === 'object' &&
      'data' in payload &&
      Array.isArray((payload as { data?: unknown[] }).data)
    ) {
      return (payload as { data?: unknown[] }).data ?? [];
    }
    return [];
  }

  private emitEvent(
    jobId: string | number | null | undefined,
    payload: MaterialsEventPayload
  ) {
    const normalized =
      jobId === undefined || jobId === null ? '' : String(jobId);
    const target = normalized || 'unknown';
    this.eventsService.emit(target, {
      ...payload,
      jobId: normalized || undefined,
    });
  }

  private async cacheResult(
    job: Job<MaterialsJobData, MaterialsJobResult>,
    result: MaterialsJobResult
  ) {
    if (!result.resultPath) {
      return;
    }
    const queryHash =
      job.data.queryHash ||
      this.materials.buildQueryHash({
        orgId: job.data.orgId,
        platform: job.data.platform,
        keywords: job.data.keywords,
        startPage: job.data.startPage,
        pageLimit: job.data.pageLimit,
      });
    try {
      await this.materials.storeCachedResult(queryHash, {
        resultPath: result.resultPath,
        count: result.count,
        preview: result.preview,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown cache error';
      this.logger.warn(`Failed to store materials cache entry: ${message}`);
    }
  }

  private getTimeoutMs() {
    const maxRuntimeSeconds = this.parseNumber(
      process.env.MATERIALS_MAX_RUNTIME_SECONDS,
      0
    );
    if (maxRuntimeSeconds > 0) {
      return maxRuntimeSeconds * 1000;
    }
    return this.parseNumber(
      process.env.MATERIALS_JOB_TIMEOUT_MS,
      DEFAULT_JOB_TIMEOUT_MS
    );
  }

  private getPollIntervalMs() {
    const pollValue =
      process.env.MATERIALS_JOB_POLL_INTERVAL_MS ||
      process.env.MATERIALS_POLL_INTERVAL_MS;
    return this.parseNumber(pollValue, DEFAULT_POLL_INTERVAL_MS);
  }

  private parseNumber(value: string | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private ensureEnabled() {
    if (!this.enabled) {
      throw new Error('Materials queue requires REDIS_URL to be set.');
    }
  }

  private getJobId(job: Job) {
    if (job.id === undefined || job.id === null) {
      return '';
    }
    return String(job.id);
  }
}
