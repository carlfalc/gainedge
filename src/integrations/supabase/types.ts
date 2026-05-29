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
      falconer_backtest_runs: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string
          equity_curve: Json | null
          error_message: string | null
          id: string
          losses: number | null
          max_drawdown_pct: number | null
          net_pnl_pct: number | null
          net_pnl_usd: number | null
          period_end: string
          period_start: string
          profit_factor: number | null
          status: string
          symbol: string
          timeframe: string
          total_trades: number | null
          user_id: string
          win_rate: number | null
          wins: number | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          equity_curve?: Json | null
          error_message?: string | null
          id?: string
          losses?: number | null
          max_drawdown_pct?: number | null
          net_pnl_pct?: number | null
          net_pnl_usd?: number | null
          period_end: string
          period_start: string
          profit_factor?: number | null
          status?: string
          symbol: string
          timeframe?: string
          total_trades?: number | null
          user_id: string
          win_rate?: number | null
          wins?: number | null
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          equity_curve?: Json | null
          error_message?: string | null
          id?: string
          losses?: number | null
          max_drawdown_pct?: number | null
          net_pnl_pct?: number | null
          net_pnl_usd?: number | null
          period_end?: string
          period_start?: string
          profit_factor?: number | null
          status?: string
          symbol?: string
          timeframe?: string
          total_trades?: number | null
          user_id?: string
          win_rate?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      falconer_settings: {
        Row: {
          be_r: number
          created_at: string
          enabled: boolean
          execution_path: string
          id: string
          max_atr_pct: number
          min_atr_pct: number
          pct1: number
          pct2: number
          pineconnector_license: string | null
          pineconnector_risk: number
          pineconnector_symbol_override: Json
          pineconnector_webhook_url: string | null
          pullback_tol: number
          risk_usd: number
          rr_tp1: number
          rr_tp2: number
          rr_tp3: number
          symbols: string[]
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          be_r?: number
          created_at?: string
          enabled?: boolean
          execution_path?: string
          id?: string
          max_atr_pct?: number
          min_atr_pct?: number
          pct1?: number
          pct2?: number
          pineconnector_license?: string | null
          pineconnector_risk?: number
          pineconnector_symbol_override?: Json
          pineconnector_webhook_url?: string | null
          pullback_tol?: number
          risk_usd?: number
          rr_tp1?: number
          rr_tp2?: number
          rr_tp3?: number
          symbols?: string[]
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          be_r?: number
          created_at?: string
          enabled?: boolean
          execution_path?: string
          id?: string
          max_atr_pct?: number
          min_atr_pct?: number
          pct1?: number
          pct2?: number
          pineconnector_license?: string | null
          pineconnector_risk?: number
          pineconnector_symbol_override?: Json
          pineconnector_webhook_url?: string | null
          pullback_tol?: number
          risk_usd?: number
          rr_tp1?: number
          rr_tp2?: number
          rr_tp3?: number
          symbols?: string[]
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      falconer_trades: {
        Row: {
          backtest_run_id: string | null
          be_done: boolean
          be_level: number
          closed_at: string | null
          direction: string
          entry_price: number
          execution_path: string
          id: string
          metaapi_position_ids: Json | null
          mode: string
          opened_at: string
          pnl_usd: number | null
          qty: number
          qty1: number
          qty2: number
          qty3: number
          raw_alert_payload: Json | null
          sl_price: number
          status: string
          symbol: string
          timeframe: string
          tp1_price: number
          tp2_price: number
          tp3_price: number
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backtest_run_id?: string | null
          be_done?: boolean
          be_level: number
          closed_at?: string | null
          direction?: string
          entry_price: number
          execution_path?: string
          id?: string
          metaapi_position_ids?: Json | null
          mode?: string
          opened_at?: string
          pnl_usd?: number | null
          qty: number
          qty1: number
          qty2: number
          qty3: number
          raw_alert_payload?: Json | null
          sl_price: number
          status?: string
          symbol: string
          timeframe?: string
          tp1_price: number
          tp2_price: number
          tp3_price: number
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backtest_run_id?: string | null
          be_done?: boolean
          be_level?: number
          closed_at?: string | null
          direction?: string
          entry_price?: number
          execution_path?: string
          id?: string
          metaapi_position_ids?: Json | null
          mode?: string
          opened_at?: string
          pnl_usd?: number | null
          qty?: number
          qty1?: number
          qty2?: number
          qty3?: number
          raw_alert_payload?: Json | null
          sl_price?: number
          status?: string
          symbol?: string
          timeframe?: string
          tp1_price?: number
          tp2_price?: number
          tp3_price?: number
          trigger_type?: string
          updated_at?: string
          user_id?: string
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
      [_ in never]: never
    }
    Functions: {
      bulk_insert_candles: { Args: { candles: Json }; Returns: number }
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
