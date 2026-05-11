import dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const adminPassword = await bcrypt.hash("admin123!", 12);
  const userPassword = await bcrypt.hash("user123!", 12);

  await prisma.user.upsert({
    where: { email: "admin@cloud-chat.app" },
    update: {},
    create: { email: "admin@cloud-chat.app", name: "Admin User", nickname: "admin", password: adminPassword, role: "ADMIN" },
  });

  await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { email: "alice@example.com", name: "Alice Johnson", nickname: "alice", password: userPassword },
  });

  await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { email: "bob@example.com", name: "Bob Smith", nickname: "bob", password: userPassword },
  });

  await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, registrationEnabled: true, maintenanceMode: false },
  });

  console.log("Seed complete!");
  console.log("Admin: admin@cloud-chat.app / admin123!");
  console.log("User 1: alice@example.com / user123!");
  console.log("User 2: bob@example.com / user123!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
