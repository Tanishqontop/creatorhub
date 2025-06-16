import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/auth/AuthModal";
import SubscriptionPaymentModal from "@/components/SubscriptionPaymentModal";
import PaidDMModal from "@/components/PaidDMModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Heart, UserPlus, UserCheck, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Creator {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  subscription_price: number;
  is_verified: boolean;
  subscriber_count?: number;
  is_subscribed?: boolean;
  chat_rate?: number;
}

const Discover = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showPaidDMModal, setShowPaidDMModal] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCreators();
  }, [user]);

  const fetchCreators = async () => {
    try {
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, subscription_price, is_verified, chat_rate')
        .not('subscription_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(12);

      if (error) throw error;

      if (!profilesData) {
        setCreators([]);
        return;
      }

      // For each creator, check if current user is subscribed and get subscriber count
      const creatorsWithDetails = await Promise.all(
        profilesData.map(async (creator) => {
          // Get subscriber count
          const { count: subscriberCount } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('creator_id', creator.id)
            .eq('status', 'active');

          // Check if current user is subscribed
          let isSubscribed = false;
          if (user) {
            const { data: subscription } = await supabase
              .from('subscriptions')
              .select('id')
              .eq('creator_id', creator.id)
              .eq('subscriber_id', user.id)
              .eq('status', 'active')
              .single();
            
            isSubscribed = !!subscription;
          }

          return {
            ...creator,
            subscriber_count: subscriberCount || 0,
            is_subscribed: isSubscribed
          };
        })
      );

      setCreators(creatorsWithDetails);
    } catch (error) {
      console.error('Error fetching creators:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = (creator: Creator) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setSelectedCreator(creator);
    setShowSubscriptionModal(true);
  };

  const handlePaidDM = (creator: Creator) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setSelectedCreator(creator);
    setShowPaidDMModal(true);
  };

  const handleUnsubscribe = async (creatorId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('creator_id', creatorId)
        .eq('subscriber_id', user.id)
        .eq('status', 'active');

      if (error) throw error;

      toast({
        title: "Unsubscribed successfully",
        description: "You have unsubscribed from this creator.",
      });

      // Refresh creators data
      await fetchCreators();
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast({
        title: "Unsubscribe failed",
        description: "There was an error processing your request.",
        variant: "destructive",
      });
    }
  };

  const handleSubscriptionSuccess = () => {
    setShowSubscriptionModal(false);
    setSelectedCreator(null);
    fetchCreators(); // Refresh data
    toast({
      title: "Subscription Successful!",
      description: "You are now subscribed to this creator.",
    });
  };

  const handlePaidDMSuccess = () => {
    setShowPaidDMModal(false);
    setSelectedCreator(null);
    toast({
      title: "Payment Successful!",
      description: "You can now send a paid message to this creator.",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Navbar onAuthClick={() => setShowAuthModal(true)} />
        <main className="flex-1 ml-64">
          <div className="w-full min-h-screen px-4 py-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm sm:text-base">Loading...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Navbar onAuthClick={() => setShowAuthModal(true)} />
      <main className="flex-1 ml-64">
        <div className="w-full min-h-screen px-4 py-6">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Discover Creators</h1>
            <p className="text-sm sm:text-base text-gray-600">Find amazing creators and content</p>
          </div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((creator) => (
              <Card 
                key={creator.id} 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/creator/${creator.id}`)}
              >
                <CardHeader className="text-center pb-4">
                  <div className="flex flex-col items-center gap-3 sm:gap-4">
                    <Avatar className="w-16 h-16 sm:w-20 sm:h-20">
                      <AvatarImage src={creator.avatar_url} />
                      <AvatarFallback>
                        {creator.display_name?.[0] || creator.username?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2 justify-center">
                        <CardTitle className="text-base sm:text-lg">{creator.display_name || creator.username}</CardTitle>
                        {creator.is_verified && (
                          <Badge variant="secondary" className="text-xs">
                            <Heart className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600">@{creator.username}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <CardDescription className="mb-3 sm:mb-4 line-clamp-3 text-center text-xs sm:text-sm">
                    {creator.bio || "No bio available"}
                  </CardDescription>
                  
                  <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3 sm:mb-4 text-xs sm:text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>{creator.subscriber_count} subs</span>
                    </div>
                    <div className="text-primary font-semibold">
                      ${creator.subscription_price}/mo
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {creator.is_subscribed ? (
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsubscribe(creator.id);
                        }}
                        className="flex-1 text-xs sm:text-sm"
                        variant="outline"
                        size="sm"
                      >
                        <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Subscribed</span>
                        <span className="sm:hidden">Sub'd</span>
                      </Button>
                    ) : (
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubscribe(creator);
                        }}
                        className="flex-1 text-xs sm:text-sm"
                        size="sm"
                      >
                        <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Subscribe</span>
                        <span className="sm:hidden">Sub</span>
                      </Button>
                    )}
                    {creator.chat_rate && (
                      <Button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePaidDM(creator);
                        }}
                        variant="outline"
                        size="sm"
                        className="p-2"
                        title={`Paid DM - $${creator.chat_rate}/hour`}
                      >
                        <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {creators.length === 0 && (
            <div className="text-center py-12 sm:py-16">
              <h3 className="text-lg sm:text-xl font-semibold mb-2">No creators found</h3>
              <p className="text-sm sm:text-base text-gray-600">Be the first to become a creator!</p>
            </div>
          )}
        </div>
      </main>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {selectedCreator && (
        <>
          <SubscriptionPaymentModal
            isOpen={showSubscriptionModal}
            onClose={() => {
              setShowSubscriptionModal(false);
              setSelectedCreator(null);
            }}
            creatorId={selectedCreator.id}
            creatorName={selectedCreator.display_name || selectedCreator.username}
            subscriptionPrice={selectedCreator.subscription_price}
            onSubscriptionSuccess={handleSubscriptionSuccess}
          />

          <PaidDMModal
            open={showPaidDMModal}
            onClose={() => {
              setShowPaidDMModal(false);
              setSelectedCreator(null);
            }}
            creatorId={selectedCreator.id}
            creatorName={selectedCreator.display_name || selectedCreator.username}
            chatRate={selectedCreator.chat_rate || 0}
            subscriberId={user?.id || ''}
            onSessionCreated={(sessionId) => {
              console.log('Chat session created:', sessionId);
              handlePaidDMSuccess();
            }}
          />
        </>
      )}
    </div>
  );
};

export default Discover;
