# Betrix

Betrix is a full-stack web application featuring a robust backend API and two distinct frontend portals: a client-facing application and an administrative dashboard. The platform incorporates AI-driven chat capabilities, real-time market data, news fetching, and comprehensive user management.

## Project Architecture

The repository is structured into four main packages:

### 1. Backend (`/Backend`)
A Node.js/Express server providing the core API services.
- **Key Features:**
  - Authentication & Authorization (Session-based)
  - AI Client integration (Chat & Streaming)
  - Real-time Market Data & News (MT5 Client, Finnhub)
  - Administrative endpoints (Audit logs, usage tracking, user management)
  - Database integrations (PostgreSQL with pooling, Redis for caching)

### 2. Frontend - Client (`/Frontend - Client`)
A React application built with Vite and Tailwind CSS for end-users.
- **Key Features:**
  - Interactive Dashboard & Economic Calendar
  - AI Chat interface (Streaming support)
  - Market Analysis tools & Real-time Ticker Prices
  - User Settings & Profile management

### 3. Frontend - Admin (`/Frontend - Admin`)
A React application built with Vite tailored for platform administrators.
- **Key Features:**
  - System Monitoring (User growth, token usage, system health)
  - User & Access Management (Audit logs, User details)
  - Broadcast messaging system

### 4. MT5 Websocket (`/MT5 Websocket`)
A MetaTrader 5 Expert Advisor (MQL5) that exposes the MT5 engine via local APIs.
- **Key Features:**
  - Local REST API for trading operations and account info
  - Real-time WebSocket streaming for price ticks, OHLC, and calendar

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL
- Redis
- MetaTrader 5 Terminal (for SocketBridge EA)
- API Keys for third-party services (AI models, Finnhub, etc.)

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/armanmaulid/Betrix.git
   cd Betrix
   ```

2. **MT5 Websocket Setup:**
   See `/MT5 Websocket/README.md` for compiling and running `SocketBridgeEA.mq5` in your MetaTrader 5 terminal.

3. **Backend Setup:**
   ```bash
   cd Backend
   npm install
   # Configure your .env file
   npm run start # or npm run dev
   ```

4. **Frontend Client Setup:**
   ```bash
   cd "Frontend - Client"
   npm install
   # Configure your .env file
   npm run dev
   ```

5. **Frontend Admin Setup:**
   ```bash
   cd "Frontend - Admin"
   npm install
   # Configure your .env file
   npm run dev
   ```

## Technologies Used
- **Backend:** Node.js, Express.js, PostgreSQL, Redis
- **Frontend:** React, Vite, Tailwind CSS, TypeScript
- **Integrations:** AI API Clients, Finnhub, MetaTrader 5 (MT5) Client
