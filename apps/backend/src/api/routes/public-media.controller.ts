import {
    BadRequestException,
    Controller,
    Get,
    Header,
    NotFoundException,
    Query,
    Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

/**
 * Public image proxy controller for bypassing CDN anti-hotlinking protection.
 * This controller is NOT authenticated so <img> tags can access it directly.
 */
@ApiTags('Public')
@Controller('/public/media')
export class PublicMediaController {
    /**
     * Image proxy endpoint to bypass CDN anti-hotlinking protection.
     * Fetches images with proper Referer headers and streams them to frontend.
     * 
     * Example: /public/media/proxy?url=<encoded_url>&platform=xhs
     */
    @Get('/proxy')
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
                throw new BadRequestException(`Domain not allowed: ${parsedUrl.hostname}`);
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
            console.error('Image proxy error:', e);
            throw new NotFoundException('Failed to fetch image');
        }
    }
}
