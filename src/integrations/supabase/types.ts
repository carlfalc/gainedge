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
      auto_trade_executions: {
        Row: {
          created_at: string
          direction: string
          entry_price: number | null
          error_message: string | null
          id: string
          metaapi_position_id: string | null
          session: string | null
          signal_id: string | null
          sl: number | null
          status: string
          symbol: string
          tp: number | null
          user_id: string
          volume: number
        }
        Insert: {
          created_at?: string
          direction: string
          entry_price?: number | null
          error_message?: string | null
          id?: string
          metaapi_position_id?: string | null
          session?: string | null
          signal_id?: string | null
          sl?: number | null
          status?: string
          symbol: string
          tp?: number | null
          user_id: string
          volume: number
        }
        Update: {
          created_at?: string
          direction?: string
          entry_price?: number | null
          error_message?: string | null
          id?: string
          metaapi_position_id?: string | null
          session?: string | null
          signal_id?: string | null
          sl?: number | null
          status?: string
          symbol?: string
          tp?: number | null
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_trade_executions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
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
      broker_connections: {
        Row: {
          account_type: string
          balance: number | null
          broker_name: string
          created_at: string
          encrypted_password: string
          equity: number | null
          id: string
          is_default: boolean
          last_error: string | null
          last_health_check: string | null
          login_id: string
          metaapi_account_id: string | null
          server: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          balance?: number | null
          broker_name: string
          created_at?: string
          encrypted_password: string
          equity?: number | null
          id?: string
          is_default?: boolean
          last_error?: string | null
          last_health_check?: string | null
          login_id: string
          metaapi_account_id?: string | null
          server: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          balance?: number | null
          broker_name?: string
          created_at?: string
          encrypted_password?: string
          equity?: number | null
          id?: string
          is_default?: boolean
          last_error?: string | null
          last_health_check?: string | null
          login_id?: string
          metaapi_account_id?: string | null
          server?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_symbol_mappings: {
        Row: {
          broker: string
          broker_symbol: string
          canonical_symbol: string
          contract_size: number
          created_at: string
          id: string
          is_available: boolean
          last_verified: string | null
          min_lot_size: number
          pip_value: number
          updated_at: string
        }
        Insert: {
          broker: string
          broker_symbol: string
          canonical_symbol: string
          contract_size?: number
          created_at?: string
          id?: string
          is_available?: boolean
          last_verified?: string | null
          min_lot_size?: number
          pip_value?: number
          updated_at?: string
        }
        Update: {
          broker?: string
          broker_symbol?: string
          canonical_symbol?: string
          contract_size?: number
          created_at?: string
          id?: string
          is_available?: boolean
          last_verified?: string | null
          min_lot_size?: number
          pip_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      candle_history: {
        Row: {
          buy_volume: number | null
          close: number
          created_at: string
          cumulative_delta: number | null
          high: number
          id: string
          low: number
          open: number
          sell_volume: number | null
          symbol: string
          timeframe: string
          timestamp: string
          volume: number | null
        }
        Insert: {
          buy_volume?: number | null
          close: number
          created_at?: string
          cumulative_delta?: number | null
          high: number
          id?: string
          low: number
          open: number
          sell_volume?: number | null
          symbol: string
          timeframe: string
          timestamp: string
          volume?: number | null
        }
        Update: {
          buy_volume?: number | null
          close?: number
          created_at?: string
          cumulative_delta?: number | null
          high?: number
          id?: string
          low?: number
          open?: number
          sell_volume?: number | null
          symbol?: string
          timeframe?: string
          timestamp?: string
          volume?: number | null
        }
        Relationships: []
      }
      chart_drawings: {
        Row: {
          created_at: string
          drawing_data: Json
          drawing_type: string
          id: string
          symbol: string
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drawing_data?: Json
          drawing_type: string
          id?: string
          symbol: string
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drawing_data?: Json
          drawing_type?: string
          id?: string
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      falconer_knowledge: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          priority: number
          rule_name: string
          rule_text: string
          version: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          rule_name: string
          rule_text: string
          version?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          rule_name?: string
          rule_text?: string
          version?: string
        }
        Relationships: []
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
      instrument_library: {
        Row: {
          category: string
          created_at: string
          display_name: string
          eightcap_symbol: string | null
          icmarkets_symbol: string | null
          is_popular: boolean
          max_price: number
          min_price: number
          oanda_symbol: string | null
          pepperstone_symbol: string | null
          pip_size: number
          pip_value_per_lot: number
          symbol: string
        }
        Insert: {
          category: string
          created_at?: string
          display_name: string
          eightcap_symbol?: string | null
          icmarkets_symbol?: string | null
          is_popular?: boolean
          max_price?: number
          min_price?: number
          oanda_symbol?: string | null
          pepperstone_symbol?: string | null
          pip_size?: number
          pip_value_per_lot?: number
          symbol: string
        }
        Update: {
          category?: string
          created_at?: string
          display_name?: string
          eightcap_symbol?: string | null
          icmarkets_symbol?: string | null
          is_popular?: boolean
          max_price?: number
          min_price?: number
          oanda_symbol?: string | null
          pepperstone_symbol?: string | null
          pip_size?: number
          pip_value_per_lot?: number
          symbol?: string
        }
        Relationships: []
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
      liquidity_zones: {
        Row: {
          created_at: string
          created_at_candle: string
          id: string
          price_high: number
          price_low: number
          respected: boolean | null
          status: string
          symbol: string
          tested_count: number
          timeframe: string
          updated_at: string
          zone_type: string
        }
        Insert: {
          created_at?: string
          created_at_candle: string
          id?: string
          price_high: number
          price_low: number
          respected?: boolean | null
          status?: string
          symbol: string
          tested_count?: number
          timeframe?: string
          updated_at?: string
          zone_type: string
        }
        Update: {
          created_at?: string
          created_at_candle?: string
          id?: string
          price_high?: number
          price_low?: number
          respected?: boolean | null
          status?: string
          symbol?: string
          tested_count?: number
          timeframe?: string
          updated_at?: string
          zone_type?: string
        }
        Relationships: []
      }
      live_market_data: {
        Row: {
          adx: number | null
          ask: number | null
          bid: number | null
          id: string
          last_candle_time: string | null
          last_price: number | null
          last_spike_at: string | null
          macd_status: string | null
          market_open: boolean | null
          price_direction: string | null
          rsi: number | null
          session_bias: string | null
          sparkline_data: Json | null
          spike_magnitude: number | null
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
          last_spike_at?: string | null
          macd_status?: string | null
          market_open?: boolean | null
          price_direction?: string | null
          rsi?: number | null
          session_bias?: string | null
          sparkline_data?: Json | null
          spike_magnitude?: number | null
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
          last_spike_at?: string | null
          macd_status?: string | null
          market_open?: boolean | null
          price_direction?: string | null
          rsi?: number | null
          session_bias?: string | null
          sparkline_data?: Json | null
          spike_magnitude?: number | null
          stoch_rsi?: number | null
          symbol?: string
          updated_at?: string
          user_id?: string
          volume_today?: number | null
        }
        Relationships: []
      }
      news_impact_results: {
        Row: {
          created_at: string
          direction: string | null
          id: string
          magnitude_pips: number | null
          measured_at: string | null
          news_id: string
          price_after_15m: number | null
          price_after_1h: number | null
          price_after_30m: number | null
          price_at_news: number
          symbol: string
        }
        Insert: {
          created_at?: string
          direction?: string | null
          id?: string
          magnitude_pips?: number | null
          measured_at?: string | null
          news_id: string
          price_after_15m?: number | null
          price_after_1h?: number | null
          price_after_30m?: number | null
          price_at_news: number
          symbol: string
        }
        Update: {
          created_at?: string
          direction?: string | null
          id?: string
          magnitude_pips?: number | null
          measured_at?: string | null
          news_id?: string
          price_after_15m?: number | null
          price_after_1h?: number | null
          price_after_30m?: number | null
          price_at_news?: number
          symbol?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          ai_reason_short: string | null
          created_at: string
          headline: string
          id: string
          impact: string | null
          instruments_affected: string[] | null
          published_at: string
          sentiment_direction: string | null
          source: string | null
        }
        Insert: {
          ai_reason_short?: string | null
          created_at?: string
          headline: string
          id?: string
          impact?: string | null
          instruments_affected?: string[] | null
          published_at?: string
          sentiment_direction?: string | null
          source?: string | null
        }
        Update: {
          ai_reason_short?: string | null
          created_at?: string
          headline?: string
          id?: string
          impact?: string | null
          instruments_affected?: string[] | null
          published_at?: string
          sentiment_direction?: string | null
          source?: string | null
        }
        Relationships: []
      }
      pattern_weights: {
        Row: {
          avg_pips: number | null
          id: string
          pattern_name: string
          session: string | null
          symbol: string
          total: number
          updated_at: string
          weight_adjustment: number | null
          win_rate: number
          wins: number
        }
        Insert: {
          avg_pips?: number | null
          id?: string
          pattern_name: string
          session?: string | null
          symbol: string
          total?: number
          updated_at?: string
          weight_adjustment?: number | null
          win_rate?: number
          wins?: number
        }
        Update: {
          avg_pips?: number | null
          id?: string
          pattern_name?: string
          session?: string | null
          symbol?: string
          total?: number
          updated_at?: string
          weight_adjustment?: number | null
          win_rate?: number
          wins?: number
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
          country: string | null
          created_at: string
          default_candle_type: string
          default_timeframe: string
          ema_fast: number
          ema_slow: number
          email_alerts: boolean
          favourite_sessions: Json | null
          full_name: string | null
          id: string
          metaapi_account_id: string | null
          news_preferences: Json | null
          nickname: string | null
          push_notifications: boolean
          rr_ratio: number
          show_nickname: boolean | null
          signals_paused: boolean
          sms_alerts: boolean
          subscription_status: string
          subscription_tier: string
          trading_preferences: Json | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          broker?: string
          clock_timezones?: Json | null
          country?: string | null
          created_at?: string
          default_candle_type?: string
          default_timeframe?: string
          ema_fast?: number
          ema_slow?: number
          email_alerts?: boolean
          favourite_sessions?: Json | null
          full_name?: string | null
          id: string
          metaapi_account_id?: string | null
          news_preferences?: Json | null
          nickname?: string | null
          push_notifications?: boolean
          rr_ratio?: number
          show_nickname?: boolean | null
          signals_paused?: boolean
          sms_alerts?: boolean
          subscription_status?: string
          subscription_tier?: string
          trading_preferences?: Json | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          broker?: string
          clock_timezones?: Json | null
          country?: string | null
          created_at?: string
          default_candle_type?: string
          default_timeframe?: string
          ema_fast?: number
          ema_slow?: number
          email_alerts?: boolean
          favourite_sessions?: Json | null
          full_name?: string | null
          id?: string
          metaapi_account_id?: string | null
          news_preferences?: Json | null
          nickname?: string | null
          push_notifications?: boolean
          rr_ratio?: number
          show_nickname?: boolean | null
          signals_paused?: boolean
          sms_alerts?: boolean
          subscription_status?: string
          subscription_tier?: string
          trading_preferences?: Json | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ron_calibration: {
        Row: {
          calibrated_at: string
          confidence_level: number
          id: string
          notes: string | null
          recommended_action: string | null
          total_signals: number
          win_rate: number
          wins: number
        }
        Insert: {
          calibrated_at?: string
          confidence_level: number
          id?: string
          notes?: string | null
          recommended_action?: string | null
          total_signals?: number
          win_rate?: number
          wins?: number
        }
        Update: {
          calibrated_at?: string
          confidence_level?: number
          id?: string
          notes?: string | null
          recommended_action?: string | null
          total_signals?: number
          win_rate?: number
          wins?: number
        }
        Relationships: []
      }
      ron_platform_intelligence: {
        Row: {
          avg_pips_lost: number | null
          avg_pips_won: number | null
          best_day_of_week: number | null
          best_hour_utc: number | null
          calculated_at: string
          direction: string | null
          expired: number
          id: string
          losses: number
          metric_type: string
          pattern: string | null
          profit_factor: number | null
          sample_size_users: number
          session: string | null
          symbol: string
          timeframe: string
          total_signals: number
          win_rate: number
          wins: number
        }
        Insert: {
          avg_pips_lost?: number | null
          avg_pips_won?: number | null
          best_day_of_week?: number | null
          best_hour_utc?: number | null
          calculated_at?: string
          direction?: string | null
          expired?: number
          id?: string
          losses?: number
          metric_type?: string
          pattern?: string | null
          profit_factor?: number | null
          sample_size_users?: number
          session?: string | null
          symbol: string
          timeframe?: string
          total_signals?: number
          win_rate?: number
          wins?: number
        }
        Update: {
          avg_pips_lost?: number | null
          avg_pips_won?: number | null
          best_day_of_week?: number | null
          best_hour_utc?: number | null
          calculated_at?: string
          direction?: string | null
          expired?: number
          id?: string
          losses?: number
          metric_type?: string
          pattern?: string | null
          profit_factor?: number | null
          sample_size_users?: number
          session?: string | null
          symbol?: string
          timeframe?: string
          total_signals?: number
          win_rate?: number
          wins?: number
        }
        Relationships: []
      }
      ron_risk_metrics: {
        Row: {
          consecutive_losses: number
          current_drawdown_pips: number | null
          equity_current: number | null
          equity_peak: number | null
          id: string
          max_drawdown_pips: number | null
          recovery_time_hours: number | null
          risk_mode: string
          symbol: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consecutive_losses?: number
          current_drawdown_pips?: number | null
          equity_current?: number | null
          equity_peak?: number | null
          id?: string
          max_drawdown_pips?: number | null
          recovery_time_hours?: number | null
          risk_mode?: string
          symbol?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consecutive_losses?: number
          current_drawdown_pips?: number | null
          equity_current?: number | null
          equity_peak?: number | null
          id?: string
          max_drawdown_pips?: number | null
          recovery_time_hours?: number | null
          risk_mode?: string
          symbol?: string | null
          updated_at?: string
          user_id?: string
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
      signal_outcomes: {
        Row: {
          adx_at_entry: number | null
          confidence: number
          created_at: string
          day_of_week: number | null
          direction: string
          entry_price: number
          hour_utc: number | null
          id: string
          macd_status: string | null
          mtf_alignment: string | null
          pattern_active: string | null
          pnl_currency: number | null
          pnl_pips: number | null
          resolved_at: string | null
          result: string
          ron_version: string
          rsi_at_entry: number | null
          session: string | null
          signal_id: string | null
          sl_price: number
          stoch_rsi: number | null
          symbol: string
          timeframe: string
          tp_price: number
          user_id: string
        }
        Insert: {
          adx_at_entry?: number | null
          confidence?: number
          created_at?: string
          day_of_week?: number | null
          direction: string
          entry_price: number
          hour_utc?: number | null
          id?: string
          macd_status?: string | null
          mtf_alignment?: string | null
          pattern_active?: string | null
          pnl_currency?: number | null
          pnl_pips?: number | null
          resolved_at?: string | null
          result: string
          ron_version?: string
          rsi_at_entry?: number | null
          session?: string | null
          signal_id?: string | null
          sl_price: number
          stoch_rsi?: number | null
          symbol: string
          timeframe?: string
          tp_price: number
          user_id: string
        }
        Update: {
          adx_at_entry?: number | null
          confidence?: number
          created_at?: string
          day_of_week?: number | null
          direction?: string
          entry_price?: number
          hour_utc?: number | null
          id?: string
          macd_status?: string | null
          mtf_alignment?: string | null
          pattern_active?: string | null
          pnl_currency?: number | null
          pnl_pips?: number | null
          resolved_at?: string | null
          result?: string
          ron_version?: string
          rsi_at_entry?: number | null
          session?: string | null
          signal_id?: string | null
          sl_price?: number
          stoch_rsi?: number | null
          symbol?: string
          timeframe?: string
          tp_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_auto_trade_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          lot_size: number
          signal_direction: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          lot_size?: number
          signal_direction?: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          lot_size?: number
          signal_direction?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_indicator_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          indicator_id: string
          params: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          indicator_id: string
          params?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          indicator_id?: string
          params?: Json | null
          user_id?: string
        }
        Relationships: []
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
          enable_asian_session: boolean
          enable_london_session: boolean
          enable_ny_session: boolean
          id: string
          instrument_filters: Json
          lot_size: number
          min_confidence: number
          signal_direction: string
          signal_engine: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          enable_asian_session?: boolean
          enable_london_session?: boolean
          enable_ny_session?: boolean
          id?: string
          instrument_filters?: Json
          lot_size?: number
          min_confidence?: number
          signal_direction?: string
          signal_engine?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          enable_asian_session?: boolean
          enable_london_session?: boolean
          enable_ny_session?: boolean
          id?: string
          instrument_filters?: Json
          lot_size?: number
          min_confidence?: number
          signal_direction?: string
          signal_engine?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      volume_profile_daily: {
        Row: {
          created_at: string
          id: string
          poc_price: number | null
          price_levels: Json | null
          profile_date: string
          symbol: string
          total_volume: number | null
          value_area_high: number | null
          value_area_low: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          poc_price?: number | null
          price_levels?: Json | null
          profile_date?: string
          symbol: string
          total_volume?: number | null
          value_area_high?: number | null
          value_area_low?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          poc_price?: number | null
          price_levels?: Json | null
          profile_date?: string
          symbol?: string
          total_volume?: number | null
          value_area_high?: number | null
          value_area_low?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      ron_platform_stats: {
        Row: {
          avg_confidence: number | null
          avg_loss_pips: number | null
          avg_win_pips: number | null
          losses: number | null
          pattern_name: string | null
          session: string | null
          symbol: string | null
          total: number | null
          win_rate: number | null
          wins: number | null
        }
        Insert: {
          avg_confidence?: never
          avg_loss_pips?: number | null
          avg_win_pips?: number | null
          losses?: never
          pattern_name?: string | null
          session?: string | null
          symbol?: string | null
          total?: never
          win_rate?: number | null
          wins?: never
        }
        Update: {
          avg_confidence?: never
          avg_loss_pips?: number | null
          avg_win_pips?: number | null
          losses?: never
          pattern_name?: string | null
          session?: string | null
          symbol?: string | null
          total?: never
          win_rate?: number | null
          wins?: never
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_candles: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_ron_intelligence: { Args: never; Returns: Json }
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
