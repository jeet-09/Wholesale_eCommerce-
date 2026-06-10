# Database Architecture Specification

## B2B Restaurant Procurement Platform

Version: 1.0

Purpose:

This document defines the complete database architecture for the platform.

The database must support:

* Restaurant Portal
* Vendor Portal
* Operations Portal
* Admin Portal

while remaining extensible for:

* Farmers
* Warehouses
* Logistics
* Supply Chain
* Credit Systems
* Procurement Planning

The architecture follows:

* PostgreSQL
* Prisma ORM
* UUID Primary Keys
* Soft Deletes
* Auditability
* Normalization
* Future Scalability

---

# DATABASE DESIGN PRINCIPLES

## Rule 1

Every table must contain:

```sql
id UUID PRIMARY KEY

created_at TIMESTAMP

updated_at TIMESTAMP

deleted_at TIMESTAMP NULL
```

Except pure mapping tables.

---

## Rule 2

Use UUIDs for all primary keys.

Never use auto increment integers.

---

## Rule 3

Use Foreign Keys everywhere.

Database must enforce relationships.

---

## Rule 4

Never store business critical data inside JSON columns.

Use normalized tables.

---

## Rule 5

Order history must never change.

Order snapshots are immutable.

---

# USER AND AUTHENTICATION DOMAIN

Users are humans.

Organizations are businesses.

A user belongs to an organization.

A user can change.

An organization remains.

Therefore:

Never attach business data directly to users.

---

# TABLE: users

Purpose:

Authentication and identity.

Columns:

id

first_name

last_name

email

phone

password_hash

is_email_verified

is_phone_verified

status

last_login_at

created_at

updated_at

deleted_at

Indexes:

email UNIQUE

phone UNIQUE

status

---

# TABLE: roles

Purpose:

System roles.

Records:

ADMIN

OPERATIONS

VENDOR

RESTAURANT

---

# TABLE: permissions

Purpose:

Future RBAC permissions.

Examples:

product:create

product:update

order:view

order:update

user:create

---

# TABLE: role_permissions

Relationship:

roles -> permissions

Many To Many

---

# TABLE: user_roles

Relationship:

users -> roles

Many To Many

Allows future multiple roles.

---

# ORGANIZATION DOMAIN

An organization is a company.

Examples:

Restaurant

Vendor

Farmer

Warehouse

---

# TABLE: organizations

Columns:

id

name

organization_type

gst_number

pan_number

email

phone

website

status

created_at

updated_at

deleted_at

organization_type ENUM:

RESTAURANT

VENDOR

FARMER

WAREHOUSE

---

# TABLE: organization_addresses

Purpose:

Multiple addresses.

Columns:

id

organization_id

address_line_1

address_line_2

city

state

country

pincode

latitude

longitude

is_primary

---

# TABLE: organization_members

Purpose:

Users inside organization.

Examples:

Restaurant Manager

Vendor Sales Executive

Vendor Owner

Columns:

id

organization_id

user_id

designation

status

joined_at

---

# RELATIONSHIP

Organization

1 -> Many Organization Members

User

1 -> Many Organization Memberships

---

# RESTAURANT DOMAIN

Restaurant-specific information.

---

# TABLE: restaurants

Columns:

id

organization_id

restaurant_name

license_number

cuisine_type

average_monthly_procurement

status

---

# VENDOR DOMAIN

Vendor-specific information.

---

# TABLE: vendors

Columns:

id

organization_id

vendor_name

vendor_code

business_category

status

---

# PRODUCT DOMAIN

Most important module.

---

# TABLE: categories

Columns:

id

name

description

parent_category_id

status

Examples:

Vegetables

Fruits

Dairy

Poultry

Seafood

Groceries

---

# TABLE: products

Columns:

id

vendor_id

category_id

sku

name

description

unit

brand

status

is_featured

Units:

KG

GRAM

LITER

ML

PIECE

BOX

PACKET

---

# TABLE: product_images

Columns:

id

product_id

image_url

display_order

---

# TABLE: product_prices

Purpose:

Price History

Columns:

id

product_id

price

effective_from

effective_to

is_current

Rule:

Never overwrite prices.

Insert new row.

---

# INVENTORY DOMAIN

Inventory separated from products.

---

# TABLE: inventories

Columns:

id

product_id

available_quantity

reserved_quantity

minimum_quantity

maximum_quantity

updated_at

Available Quantity:

Actual stock

Reserved Quantity:

Items already committed to orders

---

# INVENTORY FORMULA

Available Stock

=

available_quantity

*

reserved_quantity

---

# CART DOMAIN

Restaurant shopping cart.

---

# TABLE: carts

Columns:

id

restaurant_id

status

ACTIVE

CHECKED_OUT

ABANDONED

---

# TABLE: cart_items

Columns:

id

cart_id

product_id

quantity

unit_price_snapshot

subtotal

---

# ORDER DOMAIN

Core business process.

---

# TABLE: orders

Columns:

id

order_number

restaurant_id

vendor_id

status

subtotal

discount_amount

gst_amount

delivery_charges

total_amount

placed_at

accepted_at

delivered_at

cancelled_at

Status ENUM:

PENDING

ACCEPTED

PROCESSING

READY_FOR_DISPATCH

DELIVERED

CANCELLED

REJECTED

---

# TABLE: order_items

Purpose:

Order Snapshot

Columns:

id

order_id

product_id

product_name

sku

unit

unit_price

quantity

subtotal

Important:

Never read historical product data from products table.

Always read order snapshot.

---

# TABLE: order_status_history

Columns:

id

order_id

old_status

new_status

changed_by

remarks

created_at

Purpose:

Full timeline.

---

# TABLE: order_notes

Columns:

id

order_id

created_by

note

created_at

Internal communication.

---

# PROCUREMENT DOMAIN

Future-ready.

Not active in MVP.

---

# TABLE: purchase_requests

Future procurement requests.

---

# TABLE: supplier_quotes

Future quotation management.

---

# PAYMENT DOMAIN

Phase 3

Design now.

Implement later.

---

# TABLE: payment_methods

Columns:

id

name

status

Examples:

UPI

Bank Transfer

Credit

Cash

---

# TABLE: payments

Columns:

id

order_id

payment_method_id

amount

status

transaction_reference

paid_at

Status:

PENDING

SUCCESS

FAILED

REFUNDED

---

# CREDIT DOMAIN

Future feature.

Very important.

---

# TABLE: ledgers

Columns:

id

organization_id

current_balance

credit_limit

---

# TABLE: ledger_entries

Columns:

id

ledger_id

amount

entry_type

description

created_at

Entry Types:

DEBIT

CREDIT

---

# DOCUMENT DOMAIN

Invoices and files.

---

# TABLE: documents

Columns:

id

organization_id

document_type

file_url

uploaded_by

created_at

Document Types:

GST

PAN

INVOICE

LICENSE

AGREEMENT

---

# NOTIFICATION DOMAIN

---

# TABLE: notifications

Columns:

id

user_id

title

message

type

is_read

created_at

Types:

SYSTEM

ORDER

PAYMENT

INVENTORY

---

# AUDIT DOMAIN

Mandatory.

---

# TABLE: audit_logs

Columns:

id

user_id

entity_type

entity_id

action

old_value

new_value

ip_address

created_at

Examples:

PRODUCT_UPDATED

PRICE_CHANGED

ORDER_ACCEPTED

---

# SYSTEM CONFIGURATION DOMAIN

---

# TABLE: settings

Columns:

id

key

value

description

Examples:

GST_PERCENTAGE

DEFAULT_CURRENCY

MAX_ORDER_VALUE

---

# FUTURE SUPPLY CHAIN TABLES

DO NOT IMPLEMENT YET

Database should support:

warehouses

warehouse_inventory

farmers

procurement_orders

deliveries

delivery_tracking

quality_checks

vehicles

drivers

supply_chain_events

without changing existing order architecture.

---

# INDEXING STRATEGY

Create indexes on:

email

phone

organization_id

vendor_id

restaurant_id

product_id

order_id

status

created_at

order_number

sku

---

# CASCADE RULES

Soft delete preferred.

Never cascade delete business data.

Allowed:

UPDATE CASCADE

Avoid:

DELETE CASCADE

---

# TRANSACTION RULES

Mandatory Transactions:

Order Creation

Inventory Reservation

Order Cancellation

Payment Processing

Future Procurement

---

# ORDER CREATION FLOW

1. Validate User

2. Validate Restaurant

3. Validate Product

4. Validate Inventory

5. Reserve Inventory

6. Create Order

7. Create Order Items

8. Create Status History

9. Create Notification

10. Commit Transaction

Failure anywhere:

Rollback entire transaction.

---

# GOLDEN RULE

Database must be designed so that adding:

Farmer

Warehouse

Logistics

Payments

Credit

Procurement

Quality Inspection

requires ONLY new tables and relationships, not redesigning existing tables.
