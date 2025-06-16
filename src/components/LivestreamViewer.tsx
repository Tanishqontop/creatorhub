import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, Lock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import StreamSubscriptionModal from "./StreamSubscriptionModal";
import StreamChat from "./StreamChat";
import StreamTipping from "./StreamTipping";
import Hls from "hls.js";

interface LivestreamViewerProps {
  streamId: string;
  creatorId: string;
}

const LivestreamViewer = ({ streamId }: LivestreamViewerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [streamData, setStreamData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    fetchStreamData();
  }, [streamId, user]);

  useEffect(() => {
    if (streamData && hasAccess && streamData.status === 'live' && videoRef.current) {
      initializeVideoPlayer();
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [streamData, hasAccess]);

  const initializeVideoPlayer = () => {
    const video = videoRef.current;
    // -- Updated: use playback_id, fallback to stream_key for max compatibility --
    const playKey = streamData.playback_id || streamData.stream_key;
    if (!video || !playKey) return;

    // Use playback_id for playback URLs (Livepeer documentation)
    const hlsUrls = [
      `https://livepeercdn.studio/hls/${playKey}/index.m3u8`,
      `https://lp-playback.studio/hls/${playKey}/index.m3u8`,
      `https://livepeer.studio/api/asset/hls/${playKey}/index.m3u8`
    ];

    console.log('Attempting to load stream with key:', playKey);
    console.log('Trying URLs:', hlsUrls);

    let currentUrlIndex = 0;
    const tryNextUrl = () => {
      if (currentUrlIndex >= hlsUrls.length) {
        setVideoError('All stream URLs failed to load. The stream may not be properly configured.');
        return;
      }
      const hlsUrl = hlsUrls[currentUrlIndex];
      console.log(`Trying URL ${currentUrlIndex + 1}:`, hlsUrl);

      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxLoadingDelay: 4
        });
        hlsRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(err => {
            setVideoError('Click play to start the stream');
          });
          setVideoError(null);
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                currentUrlIndex++;
                setTimeout(tryNextUrl, 1000);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                currentUrlIndex++;
                setTimeout(tryNextUrl, 1000);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(err => {
            setVideoError('Click play to start the stream');
          });
          setVideoError(null);
        });
        video.addEventListener('error', () => {
          currentUrlIndex++;
          setTimeout(tryNextUrl, 1000);
        });
      } else {
        setVideoError('Your browser does not support HLS streaming');
      }
    };
    tryNextUrl();
  };

  const fetchStreamData = async () => {
    try {
      // Fetch stream details
      const { data: stream, error: streamError } = await supabase
        .from('live_streams')
        .select('*')
        .eq('id', streamId)
        .single();

      if (streamError) throw streamError;
      setStreamData(stream);

      console.log('Stream data:', stream);

      // Check if user has access to paid streams
      if (stream.is_paid && user) {
        const { data: subscription } = await supabase
          .from('stream_subscriptions')
          .select('*')
          .eq('stream_id', streamId)
          .eq('subscriber_id', user.id)
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString())
          .maybeSingle();

        console.log('Subscription data:', subscription);
        setHasAccess(!!subscription);
      } else if (!stream.is_paid) {
        setHasAccess(true);
      }
    } catch (error: any) {
      console.error('Error fetching stream data:', error);
      toast({
        title: "Error",
        description: "Failed to load stream data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionSuccess = () => {
    setHasAccess(true);
    setShowSubscriptionModal(false);
    fetchStreamData();
  };

  const retryVideo = () => {
    setVideoError(null);
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }
    setTimeout(() => {
      initializeVideoPlayer();
    }, 1000);
  };

  if (loading) {
    return (
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p>Loading stream...</p>
      </div>
    );
  }

  if (!streamData) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Stream Not Found</h1>
        <p className="text-gray-600">The requested stream could not be found.</p>
      </div>
    );
  }

  // Show subscription requirement for paid streams
  if (streamData.is_paid && !hasAccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Lock className="w-8 h-8 text-orange-500" />
              <Badge variant="secondary" className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                ${streamData.price}
              </Badge>
            </div>
            <CardTitle>{streamData.title}</CardTitle>
            <CardDescription>This is a paid livestream</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              Subscribe to access this exclusive livestream content
            </p>
            <Button 
              onClick={() => setShowSubscriptionModal(true)}
              className="w-full"
              disabled={!user}
            >
              {user ? "Subscribe to Watch" : "Sign in to Subscribe"}
            </Button>
            {!user && (
              <p className="text-sm text-gray-500">
                Please sign in to subscribe to this stream
              </p>
            )}
          </CardContent>
        </Card>

        <StreamSubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
          streamId={streamId}
          onSubscriptionSuccess={handleSubscriptionSuccess}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{streamData.title}</h1>
          {streamData.description && (
            <p className="text-gray-600 mt-2">{streamData.description}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {streamData.is_paid && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              ${streamData.price}
            </Badge>
          )}
          <Badge variant={streamData.status === 'live' ? "default" : "secondary"}>
            {streamData.status === 'live' ? "LIVE" : "OFFLINE"}
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Video Player */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0">
              <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                {streamData.status === 'live' ? (
                  <>
                    <video
                      ref={videoRef}
                      className="w-full h-full"
                      controls
                      muted
                      playsInline
                      poster="/placeholder.svg"
                    />
                    {videoError && (
                      <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                        <div className="text-center text-white p-4">
                          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                          <p className="mb-4">{videoError}</p>
                          <Button onClick={retryVideo} variant="outline" size="sm">
                            Retry
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <div className="text-center">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg opacity-75">Stream is offline</p>
                      <p className="text-sm opacity-50">Check back later when the creator goes live</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat/Info Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Viewers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{streamData.viewer_count || 0}</div>
              <p className="text-sm text-gray-600">Watching now</p>
            </CardContent>
          </Card>

          <StreamTipping streamId={streamId} creatorId={streamData.creator_id} />

          <StreamChat streamId={streamId} />

          <Card>
            <CardHeader>
              <CardTitle>Stream Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <Badge variant={streamData.status === 'live' ? "default" : "secondary"}>
                  {streamData.status}
                </Badge>
              </div>
              {streamData.is_paid && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Price:</span>
                  <span className="text-sm font-medium">${streamData.price}</span>
                </div>
              )}
              {streamData.started_at && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Started:</span>
                  <span className="text-sm">{new Date(streamData.started_at).toLocaleTimeString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LivestreamViewer;
