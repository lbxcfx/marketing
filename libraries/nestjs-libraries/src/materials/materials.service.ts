import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  MediaCrawlerFileItem,
  MediaCrawlerPlatform,
  MediaCrawlerService,
} from '@gitroom/nestjs-libraries/materials/materials.crawler.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

export interface ResolveMaterialJobInput {
  jobId: string;
  platform: MediaCrawlerPlatform;
  startedAt: Date;
  consumedPaths: string[];
}

export interface ResolveMaterialJobOutput {
  file: MediaCrawlerFileItem;
  data: unknown;
}

export interface MaterialsSearchQuery {
  orgId: string;
  platform: MediaCrawlerPlatform;
  keywords: string;
  startPage: number;
  pageLimit?: number;
}

export interface MaterialsCacheEntry {
  queryHash: string;
  resultPath: string;
  count?: number;
  preview?: unknown;
  cachedAt: string;
}

@Injectable()
export class MaterialsService {
  private readonly cachePrefix = 'materials:cache:';

  constructor(private readonly crawler: MediaCrawlerService) { }

  async resolveOutputForJob({
    jobId,
    platform,
    startedAt,
    consumedPaths,
  }: ResolveMaterialJobInput): Promise<ResolveMaterialJobOutput | null> {
    const files = await this.crawler.listFiles(platform);
    const preferredFiles = this.filterPreferredFiles(files);
    const file = this.crawler.selectResultFile(
      preferredFiles.length > 0 ? preferredFiles : files,
      jobId,
      startedAt,
      new Set(consumedPaths)
    );

    if (!file) {
      return null;
    }

    const data = await this.crawler.readFile(
      file.path,
      true,
      this.getResultsLimit()
    );
    return { file, data };
  }

  buildQueryHash(query: MaterialsSearchQuery) {
    const normalized = {
      orgId: query.orgId,
      platform: query.platform,
      keywords: query.keywords.trim().toLowerCase(),
    };
    return createHash('md5').update(JSON.stringify(normalized)).digest('hex');
  }

  async getCachedResult(
    query: MaterialsSearchQuery
  ): Promise<MaterialsCacheEntry | null> {
    const queryHash = this.buildQueryHash(query);
    const raw = await ioRedis.get(this.cachePrefix + queryHash);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as MaterialsCacheEntry;
      if (!parsed?.resultPath) {
        return null;
      }
      return { ...parsed, queryHash };
    } catch (error) {
      return null;
    }
  }

  async storeCachedResult(
    queryHash: string,
    entry: Omit<MaterialsCacheEntry, 'queryHash' | 'cachedAt'> & {
      cachedAt?: string;
    }
  ) {
    if (!queryHash) {
      return;
    }
    if (!this.isPreferredResultPath(entry.resultPath)) {
      return;
    }
    const payload: MaterialsCacheEntry = {
      queryHash,
      resultPath: entry.resultPath,
      count: entry.count,
      preview: entry.preview,
      cachedAt: entry.cachedAt ?? new Date().toISOString(),
    };
    const ttlSeconds = this.getCacheTtlSeconds();
    if (ttlSeconds > 0) {
      await ioRedis.set(
        this.cachePrefix + queryHash,
        JSON.stringify(payload),
        'EX',
        ttlSeconds
      );
      return;
    }
    await ioRedis.set(this.cachePrefix + queryHash, JSON.stringify(payload));
  }

  async clearCachedResult(queryHash: string) {
    if (!queryHash) {
      return;
    }
    await ioRedis.del(this.cachePrefix + queryHash);
  }

  isPreferredResultPath(resultPath?: string) {
    if (!resultPath) {
      return false;
    }
    const lowered = resultPath.toLowerCase();
    if (lowered.includes('comment') || lowered.includes('creator')) {
      return false;
    }
    return true;
  }

  private filterPreferredFiles(files: MediaCrawlerFileItem[]) {
    return files.filter((file) => this.isPreferredResultPath(file.path));
  }

  private getCacheTtlSeconds() {
    return 0; // Permanent cache
  }

  getResultsLimit() {
    const limit = this.parseNumber(process.env.MATERIALS_RESULT_LIMIT, 200);
    return limit > 0 ? limit : 200;
  }

  private parseNumber(value: string | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
