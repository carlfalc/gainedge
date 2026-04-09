
-- Create instrument_library table
CREATE TABLE public.instrument_library (
  symbol TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  display_name TEXT NOT NULL,
  eightcap_symbol TEXT,
  pepperstone_symbol TEXT,
  icmarkets_symbol TEXT,
  oanda_symbol TEXT,
  pip_size NUMERIC NOT NULL DEFAULT 0.0001,
  pip_value_per_lot NUMERIC NOT NULL DEFAULT 10,
  min_price NUMERIC NOT NULL DEFAULT 0,
  max_price NUMERIC NOT NULL DEFAULT 999999,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instrument_library ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read instrument library"
  ON public.instrument_library FOR SELECT
  TO authenticated
  USING (true);

-- Seed FOREX MAJORS
INSERT INTO public.instrument_library (symbol, category, display_name, eightcap_symbol, pepperstone_symbol, icmarkets_symbol, oanda_symbol, pip_size, pip_value_per_lot, min_price, max_price, is_popular) VALUES
('EURUSD', 'forex_major', 'Euro / US Dollar', 'EURUSD.i', 'EURUSD', 'EURUSD', 'EUR_USD', 0.0001, 10, 0.80, 1.30, true),
('GBPUSD', 'forex_major', 'British Pound / US Dollar', 'GBPUSD.i', 'GBPUSD', 'GBPUSD', 'GBP_USD', 0.0001, 10, 1.00, 1.60, true),
('USDJPY', 'forex_major', 'US Dollar / Japanese Yen', 'USDJPY.i', 'USDJPY', 'USDJPY', 'USD_JPY', 0.01, 7, 100, 200, true),
('USDCHF', 'forex_major', 'US Dollar / Swiss Franc', 'USDCHF.i', 'USDCHF', 'USDCHF', 'USD_CHF', 0.0001, 10, 0.70, 1.10, true),
('AUDUSD', 'forex_major', 'Australian Dollar / US Dollar', 'AUDUSD.i', 'AUDUSD', 'AUDUSD', 'AUD_USD', 0.0001, 10, 0.40, 0.90, true),
('NZDUSD', 'forex_major', 'New Zealand Dollar / US Dollar', 'NZDUSD.i', 'NZDUSD', 'NZDUSD', 'NZD_USD', 0.0001, 10, 0.40, 0.80, true),
('USDCAD', 'forex_major', 'US Dollar / Canadian Dollar', 'USDCAD.i', 'USDCAD', 'USDCAD', 'USD_CAD', 0.0001, 10, 1.10, 1.50, true);

-- Seed FOREX MINORS
INSERT INTO public.instrument_library (symbol, category, display_name, eightcap_symbol, pepperstone_symbol, icmarkets_symbol, oanda_symbol, pip_size, pip_value_per_lot, min_price, max_price, is_popular) VALUES
('EURGBP', 'forex_minor', 'Euro / British Pound', 'EURGBP.i', 'EURGBP', 'EURGBP', 'EUR_GBP', 0.0001, 10, 0.70, 1.00, false),
('EURJPY', 'forex_minor', 'Euro / Japanese Yen', 'EURJPY.i', 'EURJPY', 'EURJPY', 'EUR_JPY', 0.01, 7, 100, 200, false),
('GBPJPY', 'forex_minor', 'British Pound / Japanese Yen', 'GBPJPY.i', 'GBPJPY', 'GBPJPY', 'GBP_JPY', 0.01, 7, 130, 220, false),
('AUDJPY', 'forex_minor', 'Australian Dollar / Japanese Yen', 'AUDJPY.i', 'AUDJPY', 'AUDJPY', 'AUD_JPY', 0.01, 7, 70, 120, false),
('NZDJPY', 'forex_minor', 'New Zealand Dollar / Japanese Yen', 'NZDJPY.i', 'NZDJPY', 'NZDJPY', 'NZD_JPY', 0.01, 7, 60, 110, false),
('EURAUD', 'forex_minor', 'Euro / Australian Dollar', 'EURAUD.i', 'EURAUD', 'EURAUD', 'EUR_AUD', 0.0001, 10, 1.30, 2.00, false),
('GBPAUD', 'forex_minor', 'British Pound / Australian Dollar', 'GBPAUD.i', 'GBPAUD', 'GBPAUD', 'GBP_AUD', 0.0001, 10, 1.60, 2.20, false),
('EURNZD', 'forex_minor', 'Euro / New Zealand Dollar', 'EURNZD.i', 'EURNZD', 'EURNZD', 'EUR_NZD', 0.0001, 10, 1.50, 2.10, false),
('GBPNZD', 'forex_minor', 'British Pound / New Zealand Dollar', 'GBPNZD.i', 'GBPNZD', 'GBPNZD', 'GBP_NZD', 0.0001, 10, 1.80, 2.40, false),
('AUDNZD', 'forex_minor', 'Australian Dollar / New Zealand Dollar', 'AUDNZD.i', 'AUDNZD', 'AUDNZD', 'AUD_NZD', 0.0001, 10, 1.00, 1.20, false),
('AUDCAD', 'forex_minor', 'Australian Dollar / Canadian Dollar', 'AUDCAD.i', 'AUDCAD', 'AUDCAD', 'AUD_CAD', 0.0001, 10, 0.80, 1.00, false),
('EURCAD', 'forex_minor', 'Euro / Canadian Dollar', 'EURCAD.i', 'EURCAD', 'EURCAD', 'EUR_CAD', 0.0001, 10, 1.30, 1.60, false),
('GBPCAD', 'forex_minor', 'British Pound / Canadian Dollar', 'GBPCAD.i', 'GBPCAD', 'GBPCAD', 'GBP_CAD', 0.0001, 10, 1.50, 1.90, false),
('EURCHF', 'forex_minor', 'Euro / Swiss Franc', 'EURCHF.i', 'EURCHF', 'EURCHF', 'EUR_CHF', 0.0001, 10, 0.90, 1.20, false),
('GBPCHF', 'forex_minor', 'British Pound / Swiss Franc', 'GBPCHF.i', 'GBPCHF', 'GBPCHF', 'GBP_CHF', 0.0001, 10, 1.05, 1.40, false),
('CADJPY', 'forex_minor', 'Canadian Dollar / Japanese Yen', 'CADJPY.i', 'CADJPY', 'CADJPY', 'CAD_JPY', 0.01, 7, 80, 130, false),
('CHFJPY', 'forex_minor', 'Swiss Franc / Japanese Yen', 'CHFJPY.i', 'CHFJPY', 'CHFJPY', 'CHF_JPY', 0.01, 7, 120, 190, false),
('CADCHF', 'forex_minor', 'Canadian Dollar / Swiss Franc', 'CADCHF.i', 'CADCHF', 'CADCHF', 'CAD_CHF', 0.0001, 10, 0.60, 0.80, false),
('NZDCAD', 'forex_minor', 'New Zealand Dollar / Canadian Dollar', 'NZDCAD.i', 'NZDCAD', 'NZDCAD', 'NZD_CAD', 0.0001, 10, 0.75, 0.95, false),
('NZDCHF', 'forex_minor', 'New Zealand Dollar / Swiss Franc', 'NZDCHF.i', 'NZDCHF', 'NZDCHF', 'NZD_CHF', 0.0001, 10, 0.50, 0.70, false);

-- Seed COMMODITIES
INSERT INTO public.instrument_library (symbol, category, display_name, eightcap_symbol, pepperstone_symbol, icmarkets_symbol, oanda_symbol, pip_size, pip_value_per_lot, min_price, max_price, is_popular) VALUES
('XAUUSD', 'commodity', 'Gold / US Dollar', 'XAUUSD', 'XAUUSD', 'XAUUSD', 'XAU_USD', 0.01, 1, 1000, 10000, true),
('XAGUSD', 'commodity', 'Silver / US Dollar', 'XAGUSD', 'XAGUSD', 'XAGUSD', 'XAG_USD', 0.001, 50, 10, 100, true);

-- Seed INDICES
INSERT INTO public.instrument_library (symbol, category, display_name, eightcap_symbol, pepperstone_symbol, icmarkets_symbol, oanda_symbol, pip_size, pip_value_per_lot, min_price, max_price, is_popular) VALUES
('US30', 'index', 'Dow Jones 30', 'US30', 'US30', 'US30', 'US30_USD', 1, 1, 20000, 60000, true),
('NAS100', 'index', 'Nasdaq 100', 'NDX100', 'NAS100', 'NAS100', 'NAS100_USD', 1, 1, 10000, 30000, true),
('SPX500', 'index', 'S&P 500', 'SPX500', 'SPX500', 'SPX500', 'SPX500_USD', 0.1, 10, 3000, 8000, true),
('UK100', 'index', 'FTSE 100', 'UK100', 'UK100', 'UK100', 'UK100_GBP', 1, 1, 5000, 12000, false),
('GER40', 'index', 'DAX 40', 'GER40', 'GER40', 'GER40', 'DE30_EUR', 1, 1, 10000, 25000, false),
('JPN225', 'index', 'Nikkei 225', 'JPN225', 'JPN225', 'JPN225', 'JP225_USD', 1, 1, 20000, 50000, false),
('AUS200', 'index', 'ASX 200', 'AUS200', 'AUS200', 'AUS200', 'AU200_AUD', 1, 1, 5000, 10000, false);
