 
import {
  PrismaClient,
  type AddressType,
  type OrganizationType,
  type ProductUnit,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '../src/common/permissions';
import { ROLES, type RoleName } from '../src/common/types';
import { SETTING_KEYS } from '../src/common/constants';
import { generateVendorCode } from '../src/utils/codes';
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
    { key: SETTING_KEYS.MIN_ORDER_VALUE, value: '0', valueType: 'NUMBER' as const, description: 'Minimum order value to checkout' },
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

async function getOrCreateProduct(input: {
  vendorId: string;
  categoryId: string;
  sku: string;
  name: string;
  unit: ProductUnit;
  price: string;
  stock: string;
  createdBy: string;
}): Promise<void> {
  const existing = await prisma.product.findFirst({
    where: { vendorId: input.vendorId, sku: input.sku, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        vendorId: input.vendorId,
        categoryId: input.categoryId,
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        status: 'ACTIVE',
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
      select: { id: true },
    });
    await tx.productPrice.create({
      data: {
        productId: product.id,
        price: input.price,
        currency: 'INR',
        effectiveFrom: new Date(),
        isCurrent: true,
        createdBy: input.createdBy,
      },
    });
    await tx.inventory.create({
      data: { productId: product.id, availableQuantity: input.stock, minimumQuantity: '10' },
    });
  });
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

  // --- Demo vendor ---------------------------------------------------------
  const vendorOrgId = await getOrCreateOrganization({
    name: 'Demo Fresh Foods',
    organizationType: 'VENDOR',
  });
  await ensureAddress(vendorOrgId, 'REGISTERED');
  let vendor = await prisma.vendor.findUnique({
    where: { organizationId: vendorOrgId },
    select: { id: true },
  });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        organizationId: vendorOrgId,
        vendorName: 'Demo Fresh Foods',
        vendorCode: generateVendorCode(),
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  }
  const vendorUserId = await getOrCreateUser({
    email: 'vendor@demo.local',
    firstName: 'Demo',
    lastName: 'Vendor',
    passwordHash,
  });
  await ensureMembership(vendorOrgId, vendorUserId);
  await assignRole(vendorUserId, roleIds.get(ROLES.VENDOR)!, vendorOrgId);

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

  // --- Catalog -------------------------------------------------------------
  const vegetablesId = await getOrCreateCategory('Vegetables');
  const dairyId = await getOrCreateCategory('Dairy');
  await getOrCreateProduct({
    vendorId: vendor.id,
    categoryId: vegetablesId,
    sku: 'VEG-TOMATO-1KG',
    name: 'Fresh Tomatoes (1kg)',
    unit: 'KG',
    price: '40.00',
    stock: '1000.000',
    createdBy: vendorUserId,
  });
  await getOrCreateProduct({
    vendorId: vendor.id,
    categoryId: vegetablesId,
    sku: 'VEG-ONION-1KG',
    name: 'Red Onions (1kg)',
    unit: 'KG',
    price: '32.50',
    stock: '800.000',
    createdBy: vendorUserId,
  });
  await getOrCreateProduct({
    vendorId: vendor.id,
    categoryId: dairyId,
    sku: 'DAIRY-MILK-1L',
    name: 'Full Cream Milk (1L)',
    unit: 'LITER',
    price: '60.00',
    stock: '500.000',
    createdBy: vendorUserId,
  });
  console.log('  ✓ demo categories & products');

  console.log('\nSeed complete. Demo credentials (password for all):');
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log('  admin@procurement.local      (ADMIN)');
  console.log('  ops@procurement.local        (OPERATIONS)');
  console.log('  vendor@demo.local            (VENDOR)');
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
