
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Function to create HMAC SHA256 signature
async function createSignature(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    
    if (!user?.email) throw new Error("User not authenticated");

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, streamId } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !streamId) {
      throw new Error("Missing required payment verification parameters");
    }

    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!razorpayKeySecret) {
      throw new Error("Razorpay key secret not configured");
    }

    // Verify payment signature
    const message = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = await createSignature(message, razorpayKeySecret);

    console.log('Verifying signature:', { message, expectedSignature, receivedSignature: razorpay_signature });

    if (expectedSignature !== razorpay_signature) {
      throw new Error("Payment verification failed - invalid signature");
    }

    console.log('Payment signature verified successfully');

    // Update subscription status to active
    const { data: updateData, error: updateError } = await supabaseClient
      .from('stream_subscriptions')
      .update({ 
        status: 'active',
        stripe_payment_intent_id: razorpay_payment_id // Store payment ID for reference
      })
      .eq('stream_id', streamId)
      .eq('subscriber_id', user.id)
      .eq('stripe_payment_intent_id', razorpay_order_id)
      .select();

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to update subscription: ${updateError.message}`);
    }

    console.log('Subscription updated successfully:', updateData);

    if (!updateData || updateData.length === 0) {
      throw new Error("No subscription found to update");
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: "Payment verified and subscription activated",
      subscription: updateData[0]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error('Error verifying payment:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
