
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MaterialsSearch } from "./materials-search.component";
import { MaterialsResults, MaterialItem } from "./materials-results.component";
import { MaterialsLoginModalContent } from "./materials-login-modal.component";
import { useFetch } from "@gitroom/helpers/utils/custom.fetch";
import { useModals } from "@gitroom/frontend/components/layout/new-modal";
import { useVariables } from "@gitroom/react/helpers/variable.context";

const resolveFirstUrl = (value: any): string | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object") {
      return first.url || first.cover || first.cover_url || first.image;
    }
    return undefined;
  }
  if (typeof value === "string") {
    // Handle comma-separated URL strings (e.g., "url1,url2,url3")
    // MediaCrawler stores XHS image_list as comma-separated string
    if (value.includes(',') && value.startsWith('http')) {
      const urls = value.split(',');
      return urls[0]?.trim();
    }
    return value;
  }
  return undefined;
};

const normalizeXhsCoverUrl = (value?: string) => {
  if (!value) return value;
  let url = value;
  url = url.replace(
    /!nd_dft_wgth_(webp|jpg)_\d+/i,
    "!nd_dft_wgth_$1_1"
  );
  return url;
};

const toIsoDate = (value: any) => {
  if (!value) return new Date().toISOString();
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num === "number" && Number.isFinite(num)) {
    const millis = num < 1e12 ? num * 1000 : num;
    return new Date(millis).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? new Date().toISOString()
    : parsed.toISOString();
};

const extractResultsItems = (payload: any) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
};

const mapToMaterialItems = (items: any[], platform: string): MaterialItem[] => {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    // XHS Mapping
    if (platform === 'xhs') {
      const noteId = item.note_id || item.id || String(index);
      const cover =
        resolveFirstUrl(item.image_list) ||
        resolveFirstUrl(item.images) ||
        resolveFirstUrl(item.image_urls) ||
        resolveFirstUrl(item.cover) ||
        resolveFirstUrl(item.cover_url);
      const normalizedCover = normalizeXhsCoverUrl(cover);
      const mediaUrl = item.video_url || normalizedCover;
      return {
        id: noteId,
        platform,
        externalId: noteId,
        title:
          item.title ||
          item.note_title ||
          item.desc?.slice(0, 30) ||
          item.content?.slice(0, 30) ||
          item.text?.slice(0, 30) ||
          "No Title",
        desc: item.desc,
        coverUrl: normalizedCover || item.video_cover || item.avatar,
        contentUrl: mediaUrl,
        authorName:
          item.nickname ||
          item.author?.nickname ||
          item.user?.nickname ||
          "Unknown",
        createdAt: toIsoDate(item.last_update_time || item.time)
      };
    }
    // Bilibili Mapping
    if (platform === 'bili' || platform === 'bilibili') {
      return {
        id: item.bvid || item.id || String(index),
        platform: 'bili',
        externalId: item.bvid,
        title: item.title,
        desc: item.desc,
        coverUrl: item.pic,
        contentUrl: `https://www.bilibili.com/video/${item.bvid}`,
        authorName: item.owner?.name,
        createdAt: toIsoDate(item.pubdate)
      };
    }
    // Douyin Mapping
    if (platform === 'dy' || platform === 'douyin') {
      return {
        id: item.aweme_id || String(index),
        platform: 'dy',
        externalId: item.aweme_id,
        title: item.desc || "No Title",
        desc: item.desc,
        coverUrl: item.video?.cover?.url_list?.[0], // specific field for dy
        contentUrl: `https://www.douyin.com/video/${item.aweme_id}`,
        authorName: item.author?.nickname,
        createdAt: toIsoDate(item.create_time)
      };
    }

    return {
      id: item.id || String(index),
      platform,
      externalId: item.id || String(index),
      title: item.title || "No Title",
      desc: item.desc,
      coverUrl: item.coverUrl || item.cover,
      contentUrl: item.contentUrl || item.url,
      authorName: item.authorName || item.author || "Unknown",
      createdAt: toIsoDate(item.createdAt)
    };
  });
};

export const MaterialsComponent = () => {
  const fetch = useFetch();
  const modals = useModals();
  const { backendUrl } = useVariables();
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<MaterialItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // We keep track of modal ID to close it later
  const loginModalIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const currentPlatformRef = useRef<string>('xhs');

  const closeEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const closeLoginModal = () => {
    if (loginModalIdRef.current) {
      modals.closeAll();
      loginModalIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      closeEventSource();
      stopPolling();
      closeLoginModal();
    };
  }, []);

  // Polling function to check job status
  const pollJobStatus = useCallback(async (currentJobId: string) => {
    try {
      const resp = await fetch(`/materials/job-status?jobId=${currentJobId}`);
      const status = await resp.json();

      if (status.state === 'succeeded') {
        setProgress(100);
        setStatusMessage("Completed!");
        stopPolling();

        // Fetch results
        const resultsResp = await fetch(`/materials/results?jobId=${currentJobId}`);
        const resultsData = await resultsResp.json();
        const fullItems = extractResultsItems(resultsData.data);
        if (fullItems.length > 0) {
          setResults(mapToMaterialItems(fullItems, currentPlatformRef.current));
        } else if (resultsData.preview) {
          setResults(mapToMaterialItems(resultsData.preview, currentPlatformRef.current));
        }
        setLoading(false);
        closeLoginModal();
      } else if (status.state === 'failed') {
        setProgress(0);
        setStatusMessage(`Failed: ${status.error || 'Unknown error'}`);
        stopPolling();
        setLoading(false);
      } else if (status.state === 'running' || status.state === 'active') {
        setProgress(50); // Jump to 50% immediately as requested
        setStatusMessage(status.message || "Processing...");
      } else if (status.state === 'queued' || status.state === 'waiting') {
        setProgress(10);
        setStatusMessage("Queued, waiting to start...");
      }
    } catch (error) {
      console.error('Polling error:', error);
      setLogs((prev) => [...prev.slice(-4), `[ERROR] Polling failed: ${error}`]);
    }
  }, [fetch]);

  const handleSearch = async (params: { platform: string; keywords: string; limit: number }) => {
    setLoading(true);
    setResults([]);
    setLogs([]);
    setProgress(0);
    setStatusMessage("Starting...");
    closeLoginModal();
    closeEventSource();
    stopPolling();
    currentPlatformRef.current = params.platform;

    try {
      const resp = await fetch("/materials/search", {
        method: 'POST',
        body: JSON.stringify({
          platform: params.platform,
          keywords: params.keywords,
          pageLimit: params.limit
        })
      });
      const data = await resp.json();

      console.log('Search response:', data);
      setLogs((prev) => [...prev, `[INFO] Search initiated: jobId=${data.jobId}, state=${data.state}`]);

      if (data.cacheHit && data.cachedResults) {
        const cachedItems = extractResultsItems(data.cachedResults);
        setResults(mapToMaterialItems(data.preview || cachedItems || [], params.platform));
        setLoading(false);
        setStatusMessage("Loaded from cache");
        return;
      }

      if (data.jobId) {
        setJobId(data.jobId);
        setStatusMessage(`Job started: ${data.state}`);
        setProgress(10); // Start at 10%

        // Start polling for job status every 3 seconds
        pollingRef.current = setInterval(() => {
          pollJobStatus(data.jobId);
        }, 3000);

        // Also start first poll immediately
        pollJobStatus(data.jobId);

        // Try SSE as well if available
        startSSE(data.jobId, params.platform);
      } else {
        setLoading(false);
        setStatusMessage("No job created");
      }
    } catch (error) {
      console.error(error);
      setLoading(false);
      setStatusMessage("Failed to start search");
    }
  };

  const startSSE = (id: string, platform: string) => {
    // Use backend URL for SSE connection
    const sseUrl = `${backendUrl}/materials/events?jobId=${id}`;
    console.log('Starting SSE at:', sseUrl);

    try {
      const es = new EventSource(sseUrl, { withCredentials: true });
      eventSourceRef.current = es;

      const handlePayload = async (payload: any, eventType?: string) => {
        const type = eventType || payload.type;
        switch (type) {
          case 'status':
            // Override backend progress with our 50% logic
            if (payload.state === 'running') {
              setProgress(50);
            } else if (payload.state === 'succeeded') {
              setProgress(100);
            } else {
              setProgress(payload.progress ? payload.progress * 100 : 0);
            }

            setStatusMessage(payload.message || payload.state);
            if (payload.state === 'succeeded' || payload.state === 'failed') {
              setLoading(false);
              if (payload.state === 'succeeded') {
                closeEventSource();
                closeLoginModal();
              }
            }
            if ((payload.progress > 0.1 || payload.state === 'running') && payload.state !== 'succeeded') {
              // Ensure we close modal if we are running (headless or logged in)
              closeLoginModal();
            }
            break;
          case 'log':
            setLogs(prev => [...prev.slice(-4), `[${payload.level}] ${payload.message}`]);
            break;
          case 'result':
            try {
              const resultsResp = await fetch(
                `/materials/results?jobId=${id}`
              );
              const resultsData = await resultsResp.json();
              const fullItems = extractResultsItems(resultsData.data);
              if (fullItems.length > 0) {
                setResults(
                  mapToMaterialItems(fullItems, platform)
                );
              } else if (resultsData.preview) {
                setResults(
                  mapToMaterialItems(resultsData.preview, platform)
                );
              }
              stopPolling();
            } catch (error) {
              if (payload.preview) {
                setResults(mapToMaterialItems(payload.preview, platform));
                stopPolling();
              }
            }
            break;
          case 'error':
            setStatusMessage(`Error: ${payload.message}`);
            setLoading(false);
            closeEventSource();
            stopPolling();
            closeLoginModal();
            break;
          case 'login_qrcode':
            if (payload.base64_image && !loginModalIdRef.current) {
              loginModalIdRef.current = 'open';
              modals.openModal({
                title: `Log in to ${platform}`,
                children: <MaterialsLoginModalContent qrCodeBase64={payload.base64_image} platform={platform} />,
                withCloseButton: true,
                classNames: { modal: 'bg-sixth text-white' }
              });
            }
            break;
          case 'login_success':
            closeLoginModal();
            break;
        }
      };

      es.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          await handlePayload(payload, event.type);
        } catch (e) {
          console.error('SSE Parse Error', e);
        }
      };

      ['status', 'log', 'result', 'error', 'login_qrcode', 'login_success'].forEach(
        (type) => {
          es.addEventListener(type, async (event) => {
            try {
              const payload = JSON.parse((event as MessageEvent).data);
              await handlePayload(payload, type);
            } catch (e) {
              console.error('SSE Parse Error', e);
            }
          });
        }
      );

      es.onerror = (e) => {
        console.error('SSE Error', e);
        // Don't close on error, polling will continue
      };
    } catch (error) {
      console.error('Failed to start SSE:', error);
      // Polling will continue as fallback
    }
  };

  return (
    <div className="flex flex-col gap-6 text-white">
      <div className="text-2xl font-bold">Content Discovery</div>

      <MaterialsSearch onSearch={handleSearch} isLoading={loading} />

      {/* Progress & Logs Area */}
      {(loading || jobId) && (
        <div className="bg-sixth border border-fifth rounded-lg p-4 flex flex-col gap-2">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Status: {statusMessage}</span>
            <span>{Math.round(progress)}%</span>
          </div>

          {/* Simple CSS Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-2.5 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          {logs.length > 0 && (
            <div className="mt-2 text-xs font-mono text-gray-500 bg-black/30 p-2 rounded max-h-[100px] overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results Grid */}
      <MaterialsResults items={results} />
    </div>
  );
};
