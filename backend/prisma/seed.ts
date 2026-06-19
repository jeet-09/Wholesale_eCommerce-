 
import {
  Prisma,
  PrismaClient,
  type AddressType,
  type OrganizationType,
  type ProductUnit,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '../src/common/permissions';
import { ROLES, type RoleName } from '../src/common/types';
import {
  DEFAULT_ADVANCE_PERCENT,
  DEFAULT_SAME_DAY_SURCHARGE,
  DEFAULT_TRANSPORT_PERCENT,
  SETTING_KEYS,
} from '../src/common/constants';
import { generateVendorCode } from '../src/utils/codes';
import { applyTransportMarkup, averageMoney } from '../src/utils/decimal';
import { slugify } from '../src/utils/slug';

const prisma = new PrismaClient();

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Password123!';

function describePermission(key: string): string {
  const [resource, action] = key.split(':');
  return `Allows ${action ?? 'access'} on ${resource ?? key}`;
}

async function seedPermissions(): Promise<Map<string, string>> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description: describePermission(key) },
      create: { key, description: describePermission(key) },
    });
  }
  const all = await prisma.permission.findMany({ select: { id: true, key: true } });
  return new Map(all.map((permission) => [permission.key, permission.id]));
}

async function seedRoles(): Promise<Map<RoleName, string>> {
  const roles: Array<{ name: RoleName; description: string }> = [
    { name: ROLES.ADMIN, description: 'Full platform administration' },
    { name: ROLES.OPERATIONS, description: 'Internal operations & support staff' },
    { name: ROLES.VENDOR, description: 'Vendor (supplier) staff' },
    { name: ROLES.RESTAURANT, description: 'Restaurant (buyer) staff' },
  ];
  const map = new Map<RoleName, string>();
  for (const role of roles) {
    const created = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });
    map.set(role.name, created.id);
  }
  return map;
}

async function seedRolePermissions(
  roleIds: Map<RoleName, string>,
  permissionIds: Map<string, string>,
): Promise<void> {
  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS) as Array<[RoleName, string[]]>) {
    const roleId = roleIds.get(roleName);
    if (!roleId) {
      continue;
    }
    for (const key of keys) {
      const permissionId = permissionIds.get(key);
      if (!permissionId) {
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }
}

async function seedPaymentMethods(): Promise<void> {
  const methods = [
    { name: 'Cash on Delivery', code: 'CASH' },
    { name: 'Credit (Net Terms)', code: 'CREDIT' },
    { name: 'UPI', code: 'UPI' },
    { name: 'Bank Transfer', code: 'BANK_TRANSFER' },
  ];
  for (const method of methods) {
    await prisma.paymentMethod.upsert({
      where: { code: method.code },
      update: { name: method.name },
      create: { name: method.name, code: method.code },
    });
  }
}

async function seedSettings(): Promise<void> {
  const settings = [
    { key: SETTING_KEYS.GST_PERCENTAGE, value: '5', valueType: 'NUMBER' as const, description: 'Default GST percentage applied to orders' },
    { key: SETTING_KEYS.DELIVERY_CHARGES, value: '0', valueType: 'NUMBER' as const, description: 'Flat delivery charge per order' },
    { key: SETTING_KEYS.SAME_DAY_DELIVERY_SURCHARGE, value: String(DEFAULT_SAME_DAY_SURCHARGE), valueType: 'NUMBER' as const, description: 'Extra charge added when the restaurant requests same-day (today) delivery' },
    { key: SETTING_KEYS.MIN_ORDER_VALUE, value: '0', valueType: 'NUMBER' as const, description: 'Minimum order value to checkout' },
    { key: SETTING_KEYS.ADVANCE_PERCENTAGE, value: String(DEFAULT_ADVANCE_PERCENT), valueType: 'NUMBER' as const, description: 'Advance percentage collected up front at checkout' },
    { key: SETTING_KEYS.TRANSPORT_PERCENTAGE, value: String(DEFAULT_TRANSPORT_PERCENT), valueType: 'NUMBER' as const, description: 'Transportation markup added on top of the average vendor price' },
    { key: SETTING_KEYS.PAYMENT_UPI_ID, value: 'procurement@upi', valueType: 'STRING' as const, description: 'PhonePe/UPI handle shown on the checkout QR' },
    { key: SETTING_KEYS.PAYMENT_QR_URL, value: 'https://example.com/qr/procurement.png', valueType: 'STRING' as const, description: 'Image URL of the PhonePe QR shown at checkout' },
    { key: 'PLATFORM_NAME', value: 'B2B Procurement', valueType: 'STRING' as const, description: 'Display name of the platform' },
  ];
  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, valueType: setting.valueType, description: setting.description },
      create: setting,
    });
  }
}

async function getOrCreateUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      isEmailVerified: true,
    },
    select: { id: true },
  });
  return created.id;
}

async function assignRole(userId: string, roleId: string, organizationId: string | null): Promise<void> {
  const existing = await prisma.userRole.findFirst({
    where: { userId, roleId, organizationId },
    select: { id: true },
  });
  if (!existing) {
    await prisma.userRole.create({ data: { userId, roleId, organizationId } });
  }
}

async function getOrCreateOrganization(input: {
  name: string;
  organizationType: OrganizationType;
}): Promise<string> {
  const existing = await prisma.organization.findFirst({
    where: { name: input.name, organizationType: input.organizationType, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.organization.create({
    data: { name: input.name, organizationType: input.organizationType, status: 'ACTIVE' },
    select: { id: true },
  });
  return created.id;
}

async function ensureMembership(organizationId: string, userId: string): Promise<void> {
  const existing = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await prisma.organizationMember.create({
      data: { organizationId, userId, status: 'ACTIVE', joinedAt: new Date(), designation: 'Owner' },
    });
  }
}

async function ensureAddress(organizationId: string, addressType: AddressType): Promise<void> {
  const existing = await prisma.organizationAddress.findFirst({
    where: { organizationId, addressType, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await prisma.organizationAddress.create({
      data: {
        organizationId,
        addressLine1: '1 Market Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'IN',
        pincode: '400001',
        addressType,
        isPrimary: true,
      },
    });
  }
}

async function getOrCreateCategory(name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.category.create({
    data: { name, slug, status: 'ACTIVE' },
    select: { id: true },
  });
  return created.id;
}

interface SeedOffer {
  vendorId: string;
  vendorPrice: string;
  availableQuantity: string;
}

/**
 * Master-catalog product (Admin-owned). Vendors attach APPROVED price/stock
 * offers; the current selling price = average(vendor offers) + transport markup
 * (project-working.md PRODUCT PRICING FLOW).
 */
async function createMasterProduct(input: {
  categoryId: string;
  sku: string;
  name: string;
  unit: ProductUnit;
  transportPercent: number;
  adminId: string;
  offers: SeedOffer[];
}): Promise<void> {
  const existing = await prisma.product.findFirst({
    where: { sku: input.sku, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        categoryId: input.categoryId,
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        status: 'APPROVED',
        transportPercent: new Prisma.Decimal(input.transportPercent),
        createdBy: input.adminId,
        updatedBy: input.adminId,
      },
      select: { id: true },
    });
    for (const offer of input.offers) {
      await tx.vendorProductOffer.create({
        data: {
          vendorId: offer.vendorId,
          productId: product.id,
          vendorPrice: new Prisma.Decimal(offer.vendorPrice),
          availableQuantity: new Prisma.Decimal(offer.availableQuantity),
          status: 'APPROVED',
          createdBy: input.adminId,
          updatedBy: input.adminId,
        },
      });
    }
    const averageVendorPrice = averageMoney(input.offers.map((offer) => offer.vendorPrice));
    const sellingPrice = applyTransportMarkup(averageVendorPrice, input.transportPercent);
    await tx.productPrice.create({
      data: {
        productId: product.id,
        price: sellingPrice,
        currency: 'INR',
        effectiveFrom: new Date(),
        isCurrent: true,
        averageVendorPrice,
        transportPercent: new Prisma.Decimal(input.transportPercent),
        isOverride: false,
        createdBy: input.adminId,
      },
    });
  });
}

async function ensureVendor(input: {
  orgName: string;
  vendorName: string;
  email: string;
  firstName: string;
  passwordHash: string;
  roleId: string;
}): Promise<string> {
  const orgId = await getOrCreateOrganization({ name: input.orgName, organizationType: 'VENDOR' });
  await ensureAddress(orgId, 'REGISTERED');
  let vendor = await prisma.vendor.findUnique({
    where: { organizationId: orgId },
    select: { id: true },
  });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        organizationId: orgId,
        vendorName: input.vendorName,
        vendorCode: generateVendorCode(),
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  }
  await prisma.vendorPerformance.upsert({
    where: { vendorId: vendor.id },
    update: {},
    create: { vendorId: vendor.id },
  });
  const userId = await getOrCreateUser({
    email: input.email,
    firstName: input.firstName,
    lastName: 'Vendor',
    passwordHash: input.passwordHash,
  });
  await ensureMembership(orgId, userId);
  await assignRole(userId, input.roleId, orgId);
  return vendor.id;
}

async function main(): Promise<void> {
  console.log('Seeding database...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  const permissionIds = await seedPermissions();
  const roleIds = await seedRoles();
  await seedRolePermissions(roleIds, permissionIds);
  await seedPaymentMethods();
  await seedSettings();
  console.log('  ✓ roles, permissions, payment methods, settings');

  // --- Platform staff ------------------------------------------------------
  const adminId = await getOrCreateUser({
    email: 'admin@procurement.local',
    firstName: 'Platform',
    lastName: 'Admin',
    passwordHash,
  });
  await assignRole(adminId, roleIds.get(ROLES.ADMIN)!, null);

  const opsId = await getOrCreateUser({
    email: 'ops@procurement.local',
    firstName: 'Operations',
    lastName: 'Staff',
    passwordHash,
  });
  await assignRole(opsId, roleIds.get(ROLES.OPERATIONS)!, null);

  // --- Demo vendors (two, so products have multi-vendor offers) ------------
  const vendorRoleId = roleIds.get(ROLES.VENDOR)!;
  const vendorAId = await ensureVendor({
    orgName: 'Demo Fresh Foods',
    vendorName: 'Demo Fresh Foods',
    email: 'vendor@demo.local',
    firstName: 'Demo',
    passwordHash,
    roleId: vendorRoleId,
  });
  const vendorBId = await ensureVendor({
    orgName: 'Green Valley Supplies',
    vendorName: 'Green Valley Supplies',
    email: 'vendor2@demo.local',
    firstName: 'Green',
    passwordHash,
    roleId: vendorRoleId,
  });

  // --- Demo restaurant -----------------------------------------------------
  const restaurantOrgId = await getOrCreateOrganization({
    name: 'Demo Bistro',
    organizationType: 'RESTAURANT',
  });
  await ensureAddress(restaurantOrgId, 'SHIPPING');
  const restaurant = await prisma.restaurant.findUnique({
    where: { organizationId: restaurantOrgId },
    select: { id: true },
  });
  if (!restaurant) {
    await prisma.restaurant.create({
      data: {
        organizationId: restaurantOrgId,
        restaurantName: 'Demo Bistro',
        cuisineType: 'Continental',
        status: 'ACTIVE',
      },
    });
  }
  const restaurantUserId = await getOrCreateUser({
    email: 'restaurant@demo.local',
    firstName: 'Demo',
    lastName: 'Restaurant',
    passwordHash,
  });
  await ensureMembership(restaurantOrgId, restaurantUserId);
  await assignRole(restaurantUserId, roleIds.get(ROLES.RESTAURANT)!, restaurantOrgId);
  console.log('  ✓ demo admin, ops, vendor, restaurant accounts');

  // --- Master catalog (Admin-owned) with multi-vendor offers ---------------
  const vegetablesId = await getOrCreateCategory('Vegetables');
  const dairyId = await getOrCreateCategory('Dairy');
  await createMasterProduct({
    categoryId: vegetablesId,
    sku: 'VEG-TOMATO-1KG',
    name: 'Fresh Tomatoes (1kg)',
    unit: 'KG',
    transportPercent: DEFAULT_TRANSPORT_PERCENT,
    adminId,
    offers: [
      { vendorId: vendorAId, vendorPrice: '40.00', availableQuantity: '1000.000' },
      { vendorId: vendorBId, vendorPrice: '44.00', availableQuantity: '600.000' },
    ],
  });
  await createMasterProduct({
    categoryId: vegetablesId,
    sku: 'VEG-ONION-1KG',
    name: 'Red Onions (1kg)',
    unit: 'KG',
    transportPercent: DEFAULT_TRANSPORT_PERCENT,
    adminId,
    offers: [
      { vendorId: vendorAId, vendorPrice: '32.50', availableQuantity: '800.000' },
      { vendorId: vendorBId, vendorPrice: '30.00', availableQuantity: '900.000' },
    ],
  });
  await createMasterProduct({
    categoryId: dairyId,
    sku: 'DAIRY-MILK-1L',
    name: 'Full Cream Milk (1L)',
    unit: 'LITER',
    transportPercent: DEFAULT_TRANSPORT_PERCENT,
    adminId,
    offers: [
      { vendorId: vendorAId, vendorPrice: '60.00', availableQuantity: '500.000' },
      { vendorId: vendorBId, vendorPrice: '58.00', availableQuantity: '400.000' },
    ],
  });
  console.log('  ✓ master catalog with multi-vendor offers & computed prices');

  console.log('\nSeed complete. Demo credentials (password for all):');
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log('  admin@procurement.local      (ADMIN)');
  console.log('  ops@procurement.local        (OPERATIONS / Administration)');
  console.log('  vendor@demo.local            (VENDOR — Demo Fresh Foods)');
  console.log('  vendor2@demo.local           (VENDOR — Green Valley Supplies)');
  console.log('  restaurant@demo.local        (RESTAURANT)');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
