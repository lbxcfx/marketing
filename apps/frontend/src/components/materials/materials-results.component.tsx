
"use client";

import { useVariables } from "@gitroom/react/helpers/variable.context";

export interface MaterialItem {
    id: string;
    platform: string;
    externalId: string;
    title?: string;
    desc?: string;
    coverUrl?: string;
    contentUrl?: string;
    authorName?: string;
    createdAt: string;
}

/**
 * Check if a URL needs to be proxied (e.g., Xiaohongshu CDN with anti-hotlinking)
 */
const needsProxy = (url: string): boolean => {
    if (!url) return false;
    const proxyDomains = [
        'xhscdn.com',
        'xiaohongshu.com',
        'douyinpic.com',
        'douyinvod.com',
        'byteimg.com',
        'pstatp.com',
    ];
    try {
        const parsed = new URL(url);
        return proxyDomains.some(domain => parsed.hostname.includes(domain));
    } catch {
        return false;
    }
};

/**
 * Get the proxied URL for images that need anti-hotlinking bypass
 * Using public endpoint that doesn't require authentication
 */
const getProxiedUrl = (url: string, platform: string, backendUrl: string): string => {
    if (!url || !needsProxy(url)) return url;
    const encodedUrl = encodeURIComponent(url);
    return `${backendUrl}/public/media/proxy?url=${encodedUrl}&platform=${platform}`;
};

export const MaterialsResults = ({ items }: { items: MaterialItem[] }) => {
    const { backendUrl } = useVariables();

    if (!items || items.length === 0) {
        return <div className="text-center text-gray-500 py-10">No results found</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
            {items.map((item) => {
                // Use proxy for cover images from XHS/Douyin CDN
                const displayCoverUrl = item.coverUrl
                    ? getProxiedUrl(item.coverUrl, item.platform, backendUrl)
                    : undefined;

                // For "View Original", use proxy for media URLs that need it
                const displayContentUrl = item.contentUrl && needsProxy(item.contentUrl)
                    ? getProxiedUrl(item.contentUrl, item.platform, backendUrl)
                    : item.contentUrl;

                return (
                    <div key={item.id} className="bg-sixth border border-fifth rounded-lg overflow-hidden flex flex-col">
                        <div className="relative aspect-[3/4] bg-gray-800">
                            {displayCoverUrl ? (
                                <img
                                    src={displayCoverUrl}
                                    alt={item.title || "Material cover"}
                                    className="object-cover w-full h-full"
                                    loading="lazy"
                                    onError={(e) => {
                                        // Fallback: show placeholder on error
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                            parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-500 text-xs">Image unavailable</div>';
                                        }
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                                    No Cover
                                </div>
                            )}
                            <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white uppercase font-bold z-10">
                                {item.platform}
                            </div>
                        </div>
                        <div className="p-3 flex flex-col gap-2 flex-1">
                            <div className="text-sm font-semibold line-clamp-2 min-h-[40px] text-white">
                                {item.title || "No Title"}
                            </div>
                            <div className="flex justify-between w-full text-xs text-gray-400 mt-auto">
                                <span>@{item.authorName || "Unknown"}</span>
                                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>
                            {item.contentUrl && (
                                <a
                                    href={displayContentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    View Original &rarr;
                                </a>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
