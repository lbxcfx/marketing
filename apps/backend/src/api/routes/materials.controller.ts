import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Body,
  Sse,
  Res,
  Header,
  Param,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import {
  MediaCrawlerPlatform,
  MediaCrawlerService,
} from '@gitroom/nestjs-libraries/materials/materials.crawler.service';
import { MaterialsEventsService } from '@gitroom/nestjs-libraries/materials/materials.events.service';
import { MaterialsQueueService } from '@gitroom/nestjs-libraries/materials/materials.queue.service';
import {
  MaterialsService,
  MaterialsSearchQuery,
} from '@gitroom/nestjs-libraries/materials/materials.service';

interface MaterialsSearchRequest {
  platform: MediaCrawlerPlatform;
  keywords: string;
  startPage?: number;
  pageLimit?: number;
  forceCrawl?: boolean;
}

@ApiTags('Materials')
@Controller('/materials')
export class MaterialsController {
  constructor(
    private readonly queue: MaterialsQueueService,
    private readonly events: MaterialsEventsService,
    private readonly crawler: MediaCrawlerService,
    private readonly materials: MaterialsService
  ) { }

  @Post('/search')
  async search(
    @GetOrgFromRequest() org: Organization,
    @Body() body: MaterialsSearchRequest
  ) {
    if (!body?.platform) {
      throw new BadRequestException('platform is required');
    }
    if (!body?.keywords) {
      throw new BadRequestException('keywords is required');
    }

    const startPage = body.startPage ?? 1;
    const query: MaterialsSearchQuery = {
      orgId: org.id,
      platform: body.platform,
      keywords: body.keywords,
      startPage,
      pageLimit: body.pageLimit,
    };
    const queryHash = this.materials.buildQueryHash(query);

    if (!body.forceCrawl) {
      const cached = await this.materials.getCachedResult(query);
      if (cached?.resultPath) {
        if (!this.materials.isPreferredResultPath(cached.resultPath)) {
          await this.materials.clearCachedResult(queryHash);
        } else {
          try {
            const cachedResults = await this.crawler.readFile(
              cached.resultPath,
              true,
              this.materials.getResultsLimit()
            );
            if (this.isCommentPayload(cachedResults)) {
              await this.materials.clearCachedResult(queryHash);
            } else {
              return {
                jobId: null,
                state: 'succeeded',
                cachedResults: this.transformLocalPaths(cachedResults),
                cachedAt: cached.cachedAt,
                resultPath: cached.resultPath,
                count: cached.count,
                preview: this.transformLocalPaths(cached.preview),
                cacheHit: true,
              };
            }
          } catch (error) {
            // Fallback to enqueue when cache is no longer valid.
          }
        }
      }
    }

    const jobId = `job_${uuidv4()}`;
    await this.queue.enqueueJob(jobId, {
      orgId: org.id,
      platform: body.platform,
      keywords: body.keywords,
      startPage,
      pageLimit: body.pageLimit,
      queryHash,
    });

    return {
      jobId,
      state: 'queued',
      cachedResults: [],
      cachedAt: null,
      cacheHit: false,
    };
  }

  @Get('/job-status')
  async jobStatus(@Query('jobId') jobId: string) {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }
    const status = await this.queue.getJobStatus(jobId);
    if (!status) {
      throw new NotFoundException('Job not found');
    }
    return status;
  }

  @Get('/results')
  async results(@Query('jobId') jobId: string) {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    const status = await this.queue.getJobStatus(jobId);
    if (!status) {
      throw new NotFoundException('Job not found');
    }
    if (status.state !== 'succeeded') {
      return { jobId, state: status.state };
    }

    const result = await this.queue.getJobResult(jobId);
    if (!result?.resultPath) {
      return { jobId, state: status.state, data: null };
    }

    const data = await this.crawler.readFile(
      result.resultPath,
      true,
      this.materials.getResultsLimit()
    );
    return {
      jobId,
      state: status.state,
      resultPath: result.resultPath,
      count: result.count,
      preview: this.transformLocalPaths(result.preview),
      data: this.transformLocalPaths(data),
    };
  }

  @Get('/file/:jobId/:filename')
  @Header('Cache-Control', 'public, max-age=31536000')
  async getFile(
    @Param('jobId') jobId: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }
    const filePath = path.join(process.cwd(), 'uploads', 'materials', jobId, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    res.sendFile(filePath);
  }

  private transformLocalPaths(data: any) {
    if (!data) return data;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const baseUrl = `${backendUrl}/api/materials/file/`;

    const traverse = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(traverse);
      } else if (typeof obj === 'object') {
        for (const key in obj) {
          if (typeof obj[key] === 'string' && obj[key].startsWith('local:')) {
            const relative = obj[key].substring(6);
            obj[key] = baseUrl + relative;
          } else {
            traverse(obj[key]);
          }
        }
      }
    };

    const copy = JSON.parse(JSON.stringify(data));
    traverse(copy);
    return copy;
  }

  @Sse('/events')
  eventsStream(@Query('jobId') jobId: string) {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }
    return this.events.subscribe(jobId);
  }

  private isCommentPayload(payload: unknown) {
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown[] })?.data)
        ? (payload as { data?: unknown[] }).data
        : [];
    const sample = items.find(
      (item) => item && typeof item === 'object'
    ) as Record<string, unknown> | undefined;
    if (!sample) {
      return false;
    }
    return 'comment_id' in sample;
  }

  /**
   * Image proxy endpoint to bypass CDN anti-hotlinking protection.
   * Fetches images with proper Referer headers and streams them to frontend.
   */
  @Get('/image-proxy')
  @Header('Cache-Control', 'public, max-age=86400')
  async imageProxy(
    @Query('url') url: string,
    @Query('platform') platform: string = 'xhs',
    @Res() res: Response
  ) {
    if (!url) {
      throw new BadRequestException('url is required');
    }

    // Decode the URL (it should be encoded when passed as query param)
    const decodedUrl = decodeURIComponent(url);

    // Validate URL - only allow certain CDN domains for security
    const allowedDomains = [
      'xhscdn.com',
      'xiaohongshu.com',
      'sns-webpic-qc.xhscdn.com',
      'sns-img-qc.xhscdn.com',
      'sns-video-qc.xhscdn.com',
      'ci.xiaohongshu.com',
      'douyinpic.com',
      'douyinvod.com',
      'byteimg.com',
      'pstatp.com',
    ];

    try {
      const parsedUrl = new URL(decodedUrl);
      const isAllowed = allowedDomains.some(domain =>
        parsedUrl.hostname.endsWith(domain)
      );

      if (!isAllowed) {
        throw new BadRequestException('Domain not allowed');
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Invalid URL');
    }

    // Set Referer based on platform
    const refererMap: Record<string, string> = {
      xhs: 'https://www.xiaohongshu.com/',
      dy: 'https://www.douyin.com/',
      bili: 'https://www.bilibili.com/',
    };
    const referer = refererMap[platform] || refererMap.xhs;

    try {
      const response = await fetch(decodedUrl, {
        headers: {
          'Referer': referer,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'cross-site',
        },
      });

      if (!response.ok) {
        throw new NotFoundException(`Image not found: ${response.status}`);
      }

      // Get content type from response
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Stream the response
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Get the body as buffer and send
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) {
        throw e;
      }
      throw new NotFoundException('Failed to fetch image');
    }
  }
}
