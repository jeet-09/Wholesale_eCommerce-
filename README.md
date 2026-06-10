# B2B Restaurant Procurement Platform

A production-grade B2B procurement platform that connects restaurants with vendors, enabling restaurants to discover products, place orders, and manage procurement while allowing vendors to manage inventory, pricing, and order fulfillment.

The platform is designed as a scalable foundation for future expansion into warehousing, logistics, farmer onboarding, quality inspection, procurement planning, and supply chain management.

---

# Vision

Build a modern procurement ecosystem similar to Hyperpure, starting with a focused MVP that solves the core problem:

**Restaurant → Vendor Ordering**

The initial version intentionally excludes:

* Supply Chain Tracking
* Farmer Portal
* Warehouse Management
* Logistics Tracking
* Procurement Forecasting

These modules will be added after validating product-market fit.

---

# Core User Roles

## Restaurant

Restaurant users can:

* Browse products
* Search and filter products
* Add products to cart
* Place orders
* Track order status
* Download invoices
* View order history
* Manage organization profile

---

## Vendor

Vendor users can:

* Manage product catalog
* Upload product images
* Manage inventory
* Manage pricing
* Accept or reject orders
* Update order statuses
* View sales analytics

---

## Operations Team

Operations users can:

* View all platform orders
* Monitor procurement activity
* Resolve disputes
* Contact restaurants and vendors
* Access operational dashboards

---

## Admin

Admin users can:

* Manage organizations
* Create and manage users
* Manage permissions
* Monitor platform health
* Access audit logs
* Manage master configurations

---

# Technology Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* ShadCN UI
* React Query (TanStack Query)
* Zustand

---

## Backend

* Node.js
* Fastify
* TypeScript
* Prisma ORM
* Zod Validation
* JWT Authentication
* Pino Logging

---

## Database

* PostgreSQL

---

## Infrastructure

* Docker
* Docker Compose
* AWS EC2
* AWS RDS
* AWS S3
* Redis (Future)

---

# High Level Architecture

```text
Next.js Frontend
        |
        v
Fastify Backend API
        |
        v
Prisma ORM
        |
        v
PostgreSQL
        |
        +------ AWS S3
        |
        +------ Redis (Future)
```

---

# Key Design Principles

* SOLID Principles
* Clean Architecture
* Domain Driven Design Concepts
* Thin Controllers
* Business Logic in Services
* Repository Pattern
* Type Safety
* Auditability
* Scalability
* Extensibility

---

# Core Modules

## Authentication Module

Features:

* Login
* Logout
* Refresh Token
* Password Reset
* Role-Based Authorization
* Session Management

---

## Organization Module

Supports:

* Restaurants
* Vendors
* Future Farmers
* Future Warehouses

Organizations are treated as first-class entities to support multiple users per organization.

---

## User Management Module

Features:

* User Creation
* User Invitations
* Role Assignment
* Profile Management
* Account Activation

---

## Product Module

Features:

* Product Creation
* Product Updates
* Product Images
* Product Categories
* Product Status Management

---

## Inventory Module

Features:

* Stock Management
* Stock Reservations
* Stock Tracking
* Inventory Auditing

---

## Pricing Module

Features:

* Price Management
* Historical Pricing
* Future Price Scheduling

---

## Cart Module

Features:

* Add to Cart
* Update Quantity
* Remove Items
* Cart Validation

---

## Order Module

Features:

* Order Creation
* Order Approval
* Order Status Updates
* Order History
* Order Tracking

---

## Notification Module

Features:

* In-App Notifications
* Email Notifications
* Future WhatsApp Integration

---

## Audit Module

Tracks:

* User Actions
* Order Changes
* Price Updates
* Inventory Changes
* Administrative Activities

---

# Database Architecture

The system follows a normalized relational database design using PostgreSQL.

Core entities:

```text
Organization
|
+-- OrganizationMember
|
+-- User

Vendor
|
+-- Product
      |
      +-- ProductPrice
      |
      +-- Inventory
      |
      +-- ProductImage

Restaurant
|
+-- Cart
|
+-- Order
      |
      +-- OrderItem
      |
      +-- OrderStatusHistory

Notification

AuditLog
```

---

# Project Structure

## Backend

```text
backend/
|
+-- src/
    |
    +-- modules/
    |   |
    |   +-- auth/
    |   +-- users/
    |   +-- organizations/
    |   +-- restaurants/
    |   +-- vendors/
    |   +-- products/
    |   +-- inventory/
    |   +-- pricing/
    |   +-- cart/
    |   +-- orders/
    |   +-- notifications/
    |   +-- audit/
    |
    +-- common/
    +-- config/
    +-- database/
    +-- plugins/
    +-- middleware/
    +-- utils/
```

---

## Frontend

```text
frontend/
|
+-- src/
    |
    +-- app/
    +-- components/
    +-- features/
    +-- hooks/
    +-- services/
    +-- store/
    +-- types/
    +-- utils/
```

---

# API Standards

## RESTful APIs

Examples:

```http
GET    /products
GET    /products/:id
POST   /products
PATCH  /products/:id
DELETE /products/:id
```

---

## Standard Response Format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Error message",
  "errorCode": "ERROR_CODE"
}
```

---

# Security Standards

## Authentication

* JWT Access Tokens
* Refresh Tokens
* Token Rotation

Access Token:

```text
15 Minutes
```

Refresh Token:

```text
30 Days
```

---

## Password Security

* bcrypt hashing
* Never store plaintext passwords
* Password strength validation

---

## Authorization

Supported roles:

```text
ADMIN
OPERATIONS
VENDOR
RESTAURANT
```

Role-Based Access Control is mandatory.

---

# Performance Standards

## Pagination

Required on all list APIs.

Default:

```text
20 records
```

Maximum:

```text
100 records
```

---

## Database Indexing

Indexes required for:

* Email
* Phone
* Organization ID
* Vendor ID
* Restaurant ID
* Order ID
* Status
* Created At

---

# Logging

Uses Pino logger.

Every request should log:

* Request ID
* User ID
* Endpoint
* Duration
* Status Code

No console.log statements in production.

---

# Testing Strategy

Required test layers:

* Unit Tests
* Service Tests
* Repository Tests
* Critical API Integration Tests

Target:

```text
80%+ Coverage
```

for business-critical modules.

---

# Development Workflow

## Branch Naming

```text
feature/product-module
feature/order-module
bugfix/order-status
hotfix/payment-issue
```

---

## Commit Convention

```text
feat:
fix:
refactor:
docs:
test:
chore:
```

Examples:

```text
feat: add product creation endpoint

fix: resolve inventory deduction issue

refactor: optimize order service
```

---

# Future Roadmap

Phase 1

* Authentication
* Organizations
* Products
* Inventory
* Pricing
* Cart
* Orders

---

Phase 2

* Analytics
* Notifications
* Invoice Generation
* Advanced Search

---

Phase 3

* Online Payments
* Credit Ledger
* Procurement Reports
* Vendor Performance Tracking

---

Phase 4

* Farmer Portal
* Warehouse Management
* Logistics Tracking
* Quality Inspection
* Supply Chain Visibility

---

# Engineering Philosophy

This platform prioritizes:

* Scalability over shortcuts
* Maintainability over quick fixes
* Consistency over complexity
* Simplicity over premature optimization

Every feature should be built with future expansion in mind while keeping the current implementation clean, understandable, and production-ready.
