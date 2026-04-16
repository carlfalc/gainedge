---
name: Broker Symbol Mappings Architecture
description: Database-driven broker-instrument mapping system with availability checks, execution symbol resolution, and admin management
type: feature
---

## Table: broker_symbol_mappings

Maps GAINEDGE canonical symbols to broker-specific symbols with execution parameters.

Columns: broker, canonical_symbol, broker_symbol, contract_size, pip_value, min_lot_size, is_available, last_verified.
Unique constraint on (broker, canonical_symbol).
RLS: authenticated can read, service_role can manage.

Pre-seeded with 100 mappings (20 instruments × 5 brokers: eightcap, icmarkets, pepperstone, oanda, fxcm).

## Hook: useBrokerMappings

`src/hooks/use-broker-mappings.ts` — fetches all mappings and user's default broker connection.
Provides: isAvailable(), getBrokerSymbol(), getMapping(), getAvailabilityStatus(), getAvailabilitySummary().

## UI Components

- `BrokerAvailabilityDot` — green/red/yellow/grey dot with tooltip for instrument availability
- `BrokerMappingsAdmin` — admin-only table for viewing/adding/toggling/deleting mappings
- Settings page instruments show availability dots
- TradingView chart page shows amber banner when instrument unavailable on selected broker

## Signal Display Policy

All UI displays canonical GAINEDGE symbols. Only the execution layer converts to broker symbols.
