import {
    AuthTokenDetails,
    PostDetails,
    PostResponse,
    SocialProvider,
    GenerateAuthUrlResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

// Douyin-specific settings DTO
export interface DouyinDto {
    title?: string;
    tags?: string[];
    scheduled_time?: string;
    thumbnail_url?: string;
    product_link?: string;
    product_title?: string;
}

// API response types
interface DouyinApiResponse<T = any> {
    code: number;
    msg: string | null;
    data: T;
}

interface DouyinAccount {
    id: number;
    type: number;
    userName: string;
    filePath: string;
    status: number;
    platform: string;
}

interface DouyinLoginSession {
    session_id: string;
    platform: string;
    account_name: string;
}

interface DouyinLoginStatus {
    session_id: string;
    status: 'pending' | 'waiting_scan' | 'success' | 'failed';
    platform: string;
    messages: string[];
}

const CHINA_SOCIAL_SERVICE_URL = process.env.CHINA_SOCIAL_SERVICE_URL || 'http://localhost:5409';

@Rules(
    'Douyin (抖音) supports video content with title, tags, and optional product links. Maximum title length is 30 characters.'
)
export class DouyinProvider extends SocialAbstract implements SocialProvider {
    identifier = 'douyin';
    name = '抖音';
    isBetweenSteps = false;
    scopes: string[] = [];
    editor = 'normal' as const;

    // Douyin uses cookie-based auth, not OAuth
    oneTimeToken = true;

    maxLength() {
        return 2000; // Content description length
    }

    /**
     * Generate auth URL - for Douyin, we initiate a QR code login session
     */
    async generateAuthUrl(): Promise<GenerateAuthUrlResponse> {
        try {
            // Create a unique session ID
            const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);

            // Initialize login session with the social-auto-upload service
            const response = await fetch(`${CHINA_SOCIAL_SERVICE_URL}/api/v1/login/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    platform: 'douyin',
                    account_name: `douyin_${sessionId}`,
                }),
            });

            const result: DouyinApiResponse<DouyinLoginSession> = await response.json();

            if (result.code !== 200) {
                throw new Error(result.msg || 'Failed to initialize login');
            }

            // Return a URL that the frontend will handle to show QR code
            // The state contains the session_id for status polling
            return {
                url: `${process.env.FRONTEND_URL}/integrations/social/douyin?session=${result.data.session_id}`,
                codeVerifier: result.data.session_id,
                state: result.data.session_id,
            };
        } catch (error) {
            console.error('Douyin generateAuthUrl error:', error);
            throw error;
        }
    }

    /**
     * Authenticate - poll for login status and get account info
     */
    async authenticate(params: {
        code: string;
        codeVerifier: string;
        refresh?: string;
    }): Promise<AuthTokenDetails | string> {
        try {
            const sessionId = params.codeVerifier;

            // Poll for login status
            const statusResponse = await fetch(
                `${CHINA_SOCIAL_SERVICE_URL}/api/v1/login/status/${sessionId}`
            );

            const statusResult: DouyinApiResponse<DouyinLoginStatus> = await statusResponse.json();

            if (statusResult.code !== 200) {
                return 'Login session not found or expired';
            }

            if (statusResult.data.status !== 'success') {
                return `Login not complete. Status: ${statusResult.data.status}`;
            }

            // Get the newly created account
            const accountsResponse = await fetch(
                `${CHINA_SOCIAL_SERVICE_URL}/api/v1/accounts?platform=douyin`
            );

            const accountsResult: DouyinApiResponse<DouyinAccount[]> = await accountsResponse.json();

            if (accountsResult.code !== 200 || !accountsResult.data.length) {
                return 'Failed to get account information';
            }

            // Find the account that was just created (most recent)
            const account = accountsResult.data[accountsResult.data.length - 1];

            return {
                id: String(account.id),
                name: account.userName,
                accessToken: account.filePath, // Cookie file path as token
                refreshToken: account.filePath,
                expiresIn: 86400 * 7, // 7 days (cookie expiry estimated)
                picture: '', // Douyin doesn't provide picture through this API
                username: account.userName,
            };
        } catch (error) {
            console.error('Douyin authenticate error:', error);
            return 'Authentication failed: ' + (error as Error).message;
        }
    }

    /**
     * Refresh token - for Douyin, this means checking if cookie is still valid
     */
    async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
        try {
            // Extract account ID from the token (which is stored as "id:filepath")
            const accountId = refreshToken.split(':')[0];

            // Validate the account cookie
            const response = await fetch(
                `${CHINA_SOCIAL_SERVICE_URL}/api/v1/accounts/${accountId}/validate`,
                { method: 'POST' }
            );

            const result: DouyinApiResponse<{ id: number; valid: boolean }> = await response.json();

            if (result.code !== 200 || !result.data.valid) {
                throw new Error('Cookie expired, please re-login');
            }

            // Get account info
            const accountsResponse = await fetch(
                `${CHINA_SOCIAL_SERVICE_URL}/api/v1/accounts?platform=douyin`
            );

            const accountsResult: DouyinApiResponse<DouyinAccount[]> = await accountsResponse.json();
            const account = accountsResult.data.find(a => String(a.id) === accountId);

            if (!account) {
                throw new Error('Account not found');
            }

            return {
                id: String(account.id),
                name: account.userName,
                accessToken: `${account.id}:${account.filePath}`,
                refreshToken: `${account.id}:${account.filePath}`,
                expiresIn: 86400 * 7,
                picture: '',
                username: account.userName,
            };
        } catch (error) {
            console.error('Douyin refreshToken error:', error);
            throw error;
        }
    }

    /**
     * Post video to Douyin
     */
    async post(
        id: string,
        accessToken: string,
        postDetails: PostDetails<DouyinDto>[],
        integration: Integration
    ): Promise<PostResponse[]> {
        const [firstPost] = postDetails;

        // Extract account ID from access token
        const accountId = accessToken.split(':')[0] || id;

        // Get video from media
        const video = firstPost.media?.find(m => m.type === 'video');

        if (!video) {
            throw new Error('Douyin requires a video attachment');
        }

        try {
            const response = await fetch(`${CHINA_SOCIAL_SERVICE_URL}/api/v1/douyin/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    account_id: parseInt(accountId),
                    video_url: video.path,
                    title: firstPost.settings?.title || firstPost.message?.substring(0, 30) || '',
                    tags: firstPost.settings?.tags || [],
                    thumbnail_url: video.thumbnail || firstPost.settings?.thumbnail_url,
                    product_link: firstPost.settings?.product_link || '',
                    product_title: firstPost.settings?.product_title || '',
                    scheduled_time: firstPost.settings?.scheduled_time,
                }),
            });

            const result: DouyinApiResponse = await response.json();

            if (result.code !== 200) {
                throw new Error(result.msg || 'Failed to publish to Douyin');
            }

            return [
                {
                    id: firstPost.id,
                    postId: `douyin_${Date.now()}`,
                    releaseURL: 'https://creator.douyin.com/creator-micro/content/manage',
                    status: 'processing', // Douyin upload is async
                },
            ];
        } catch (error) {
            console.error('Douyin post error:', error);
            throw error;
        }
    }
}
