# SmartExpense – Full-Stack Expense Sharing & Settlement Platform

SmartExpense is a full-stack expense sharing and settlement platform designed for groups, roommates, trips, and teams.

Unlike traditional expense trackers that only record expenses and balances, SmartExpense helps users identify the most effective settlement actions through debt optimization, cross-group balance analysis, and intelligent financial insights.

## Dashboard Preview

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/e5e873e3-faac-4123-b10c-ef8ba6ad02f1" />

---
## Key Features

### Expense Management
- Group creation and member management
- Shared expense tracking
- Custom expense splitting
- Settlement recording
- Real-time balance calculations

### Smart Financial Intelligence
- Debt simplification engine
- Smart settlement recommendations
- Global balance aggregation
- Multi-currency support
- Cross-group debt analysis

### Analytics & Insights
- Trust score analysis
- Group health metrics
- Fairness analysis
- Settlement behavior tracking
- Social contribution insights

---

## Tech Stack

### Frontend
- React 19
- TypeScript
- Tailwind CSS
- React Router 7
- Vite

### Backend
- Node.js
- Express.js
- TypeScript
- Prisma ORM
- PostgreSQL

### Authentication
- JWT
- Bcrypt

---

## Architecture

```text
React + TypeScript
        │
        ▼
Express REST API
        │
        ▼
Prisma ORM
        │
        ▼
PostgreSQL
```

The platform uses an event-driven analytics layer to generate trust scores, group health metrics, behavioral insights, and smart settlement recommendations without impacting financial transactions.

---

## What Makes SmartExpense Different?

Most expense-sharing applications act as ledgers that record transactions and balances.

SmartExpense goes beyond tracking by helping users determine:

- Who to pay next
- Who to collect from
- Which settlement has the greatest impact
- How to simplify complex debt networks
- How financial behavior affects group health

This transforms SmartExpense from a simple tracker into a decision-support platform for shared finances.

---

## Technical Highlights

- Optimized debt settlement planning
- Multi-currency transaction support
- Cross-group balance aggregation
- Event-driven analytics engine
- Transaction-safe financial operations
- Behavioral and trust-based insights
- Real-time balance reconciliation

---

## Project Structure

```text
SmartExpense
│
├── Smart Backend
│   ├── src
│   ├── prisma
│   └── API Services
│
├── Smart Frontend
│   ├── React Application
│   ├── Dashboard
│   └── Smart Recommendation Engine
│
└── Documentation
```

---

## Future Enhancements

- Mobile application
- Payment gateway integration
- Advanced financial analytics
- Automated settlement forecasting
- Group budgeting tools
- Smart financial planning features

---

## Status

**Current Status:** MVP Complete

SmartExpense is actively evolving into an intelligent financial coordination platform for groups and shared spending environments.

---
