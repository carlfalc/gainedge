import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  subscription_tier: string;
  subscription_status: string;
  trial_ends_at: string | null;
  broker: string;
  default_timeframe: string;
  default_candle_type: string;
  ema_fast: number;
  ema_slow: number;
  email_alerts: boolean;
  push_notifications: boolean;
  sms_alerts: boolean;
  country: string | null;
  trading_preferences: string[];
  favourite_sessions: string[];
  show_nickname: boolean;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchProfile = async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();
    if (data) {
      setProfile({
        ...data,
        trading_preferences: (data.trading_preferences as string[] | null) ?? [],
        favourite_sessions: (data.favourite_sessions as string[] | null) ?? [],
        show_nickname: data.show_nickname ?? false,
      } as Profile);
    }
    setLoading(false);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!userId) return;
    await supabase.from("profiles").update(updates as any).eq("id", userId);
    setProfile(prev => prev ? { ...prev, ...updates } : null);
  };

  return { profile, loading, userId, updateProfile, refetch: () => userId && fetchProfile(userId) };
}
