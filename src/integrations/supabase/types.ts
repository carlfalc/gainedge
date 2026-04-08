export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          last_used_at?: string | null
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_results: {
        Row: {
          avg_rr: number
          candle_type: string
          created_at: string
          ema_fast: number
          ema_slow: number
          equity_curve: Json | null
          expectancy: number
          id: string
          max_drawdown: number
          net_pnl: number
          period_months: number
          profit_factor: number
          sharpe_ratio: number | null
          symbol: string
          timeframe: string
          total_trades: number
          user_id: string
          win_rate: number
        }
        Insert: {
          avg_rr: number
          candle_type: string
          created_at?: string
          ema_fast: number
          ema_slow: number
          equity_curve?: Json | null
          expectancy: number
          id?: string
          max_drawdown: number
          net_pnl: number
          period_months: number
          profit_factor: number
          sharpe_ratio?: number | null
          symbol: string
          timeframe: string
          total_trades: number
          user_id: string
          win_rate: number
        }
        Update: {
          avg_rr?: number
          candle_type?: string
          created_at?: string
          ema_fast?: number
          ema_slow?: number
          equity_curve?: Json | null
          expectancy?: number
          id?: string
          max_drawdown?: number
          net_pnl?: number
          period_months?: number
          profit_factor?: number
          sharpe_ratio?: number | null
          symbol?: string
          timeframe?: string
          total_trades?: number
          user_id?: string
          win_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "backtest_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          created_at: string
          data: Json | null
          description: string
          estimated_impact: number | null
          id: string
          insight_type: string
          severity: string | null
          symbol: string | null
          title: string
          user_id: string
          week_start: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          description: string
          estimated_impact?: number | null
          id?: string
          insight_type: string
          severity?: string | null
          symbol?: string | null
          title: string
          user_id: string
          week_start?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          description?: string
          estimated_impact?: number | null
          id?: string
          insight_type?: string
          severity?: string | null
          symbol?: string | null
          title?: string
          user_id?: string
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          mood: string | null
          notes: string | null
          session_summary: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          mood?: string | null
          notes?: string | null
          session_summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string | null
          notes?: string | null
          session_summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_market_data: {
        Row: {
          adx: number | null
          ask: number | null
          bid: number | null
          id: string
          last_candle_time: string | null
          last_price: number | null
          macd_status: string | null
          market_open: boolean | null
          price_direction: string | null
          rsi: number | null
          sparkline_data: Json | null
          stoch_rsi: number | null
          symbol: string
          updated_at: string
          user_id: string
          volume_today: number | null
        }
        Insert: {
          adx?: number | null
          ask?: number | null
          bid?: number | null
          id?: string
          last_candle_time?: string | null
          last_price?: number | null
          macd_status?: string | null
          market_open?: boolean | null
          price_direction?: string | null
          rsi?: number | null
          sparkline_data?: Json | null
          stoch_rsi?: number | null
          symbol: string
          updated_at?: string
          user_id: string
          volume_today?: number | null
        }
        Update: {
          adx?: number | null
          ask?: number | null
          bid?: number | null
          id?: string
          last_candle_time?: string | null
          last_price?: number | null
          macd_status?: string | null
          market_open?: boolean | null
          price_direction?: string | null
          rsi?: number | null
          sparkline_data?: Json | null
          stoch_rsi?: number | null
          symbol?: string
          updated_at?: string
          user_id?: string
          volume_today?: number | null
        }
        Relationships: []
      }
      news_items: {
        Row: {
          created_at: string
          headline: string
          id: string
          impact: string | null
          instruments_affected: string[] | null
          published_at: string
          source: string | null
        }
        Insert: {
          created_at?: string
          headline: string
          id?: string
          impact?: string | null
          instruments_affected?: string[] | null
          published_at?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          headline?: string
          id?: string
          impact?: string | null
          instruments_affected?: string[] | null
          published_at?: string
          source?: string | null
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          created_at: string
          id: string
          service_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_key: string
        }
        Update: {
          created_at?: string
          id?: string
          service_key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          broker: string
          clock_timezones: Json | null
          created_at: string
          default_candle_type: string
          default_timeframe: string
          ema_fast: number
          ema_slow: number
          email_alerts: boolean
          full_name: string | null
          id: string
          metaapi_account_id: string | null
          news_preferences: Json | null
          push_notifications: boolean
          sms_alerts: boolean
          subscription_status: string
          subscription_tier: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          broker?: string
          clock_timezones?: Json | null
          created_at?: string
          default_candle_type?: string
          default_timeframe?: string
          ema_fast?: number
          ema_slow?: number
          email_alerts?: boolean
          full_name?: string | null
          id: string
          metaapi_account_id?: string | null
          news_preferences?: Json | null
          push_notifications?: boolean
          sms_alerts?: boolean
          subscription_status?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          broker?: string
          clock_timezones?: Json | null
          created_at?: string
          default_candle_type?: string
          default_timeframe?: string
          ema_fast?: number
          ema_slow?: number
          email_alerts?: boolean
          full_name?: string | null
          id?: string
          metaapi_account_id?: string | null
          news_preferences?: Json | null
          push_notifications?: boolean
          sms_alerts?: boolean
          subscription_status?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          adx: number | null
          candle_type: string
          confidence: number
          direction: string
          ema_crossover_direction: string | null
          ema_crossover_status: string
          ema_fast_value: number | null
          ema_slow_value: number | null
          entry_price: number | null
          id: string
          macd_status: string | null
          reasoning: string
          risk_reward: string | null
          rsi: number | null
          scanned_at: string
          session: string
          stoch_rsi: number | null
          stop_loss: number | null
          supertrend_status: string | null
          symbol: string
          take_profit: number | null
          timeframe: string
          user_id: string
          verdict: string
          volume: number | null
        }
        Insert: {
          adx?: number | null
          candle_type: string
          confidence: number
          direction: string
          ema_crossover_direction?: string | null
          ema_crossover_status?: string
          ema_fast_value?: number | null
          ema_slow_value?: number | null
          entry_price?: number | null
          id?: string
          macd_status?: string | null
          reasoning: string
          risk_reward?: string | null
          rsi?: number | null
          scanned_at?: string
          session: string
          stoch_rsi?: number | null
          stop_loss?: number | null
          supertrend_status?: string | null
          symbol: string
          take_profit?: number | null
          timeframe: string
          user_id: string
          verdict: string
          volume?: number | null
        }
        Update: {
          adx?: number | null
          candle_type?: string
          confidence?: number
          direction?: string
          ema_crossover_direction?: string | null
          ema_crossover_status?: string
          ema_fast_value?: number | null
          ema_slow_value?: number | null
          entry_price?: number | null
          id?: string
          macd_status?: string | null
          reasoning?: string
          risk_reward?: string | null
          rsi?: number | null
          scanned_at?: string
          session?: string
          stoch_rsi?: number | null
          stop_loss?: number | null
          supertrend_status?: string | null
          symbol?: string
          take_profit?: number | null
          timeframe?: string
          user_id?: string
          verdict?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_volume_summary: {
        Row: {
          buyer_volume: number | null
          created_at: string
          date: string
          id: string
          peak_hour_start: string | null
          seller_volume: number | null
          session: string
          symbol: string
          total_volume: number | null
        }
        Insert: {
          buyer_volume?: number | null
          created_at?: string
          date?: string
          id?: string
          peak_hour_start?: string | null
          seller_volume?: number | null
          session: string
          symbol: string
          total_volume?: number | null
        }
        Update: {
          buyer_volume?: number | null
          created_at?: string
          date?: string
          id?: string
          peak_hour_start?: string | null
          seller_volume?: number | null
          session?: string
          symbol?: string
          total_volume?: number | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          closed_at: string | null
          confidence: number
          created_at: string
          direction: string
          entry_price: number
          id: string
          notes: string | null
          pnl: number | null
          pnl_pips: number | null
          resolved_at: string | null
          result: string
          risk_reward: string
          scan_result_id: string | null
          stop_loss: number
          symbol: string
          take_profit: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          confidence: number
          created_at?: string
          direction: string
          entry_price: number
          id?: string
          notes?: string | null
          pnl?: number | null
          pnl_pips?: number | null
          resolved_at?: string | null
          result?: string
          risk_reward: string
          scan_result_id?: string | null
          stop_loss: number
          symbol: string
          take_profit: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          confidence?: number
          created_at?: string
          direction?: string
          entry_price?: number
          id?: string
          notes?: string | null
          pnl?: number | null
          pnl_pips?: number | null
          resolved_at?: string | null
          result?: string
          risk_reward?: string
          scan_result_id?: string | null
          stop_loss?: number
          symbol?: string
          take_profit?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_scan_result_id_fkey"
            columns: ["scan_result_id"]
            isOneToOne: false
            referencedRelation: "scan_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_instruments: {
        Row: {
          added_at: string
          broker_symbol: string | null
          id: string
          symbol: string
          timeframe: string
          user_id: string
        }
        Insert: {
          added_at?: string
          broker_symbol?: string | null
          id?: string
          symbol: string
          timeframe?: string
          user_id: string
        }
        Update: {
          added_at?: string
          broker_symbol?: string | null
          id?: string
          symbol?: string
          timeframe?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_instruments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_signal_preferences: {
        Row: {
          created_at: string
          currency: string
          id: string
          instrument_filters: Json
          lot_size: number
          min_confidence: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          instrument_filters?: Json
          lot_size?: number
          min_confidence?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          instrument_filters?: Json
          lot_size?: number
          min_confidence?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
