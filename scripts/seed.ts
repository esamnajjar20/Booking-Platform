// scripts/seed.ts
import "dotenv/config";
import prisma from "../src/config/database";   // تأكد من المسار الصحيح
import bcrypt from "bcrypt";
import { addDays } from "date-fns";

async function main() {
  console.log("🌱 Starting database seeding...");

  const hashedPassword = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      password: hashedPassword,
      name: "Admin User",
      role: "ADMIN",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      email: "user@example.com",
      password: hashedPassword,
      name: "Regular User",
      role: "USER",
    },
  });

  await prisma.service.createMany({
    data: [
      { name: "Consultation", description: "One-hour consultation", price: 100, duration: 60, isAvailable: true },
      { name: "Deep Cleaning", description: "90 min deep cleaning", price: 200, duration: 90, isAvailable: true },
      { name: "Follow-up", description: "30 min follow-up", price: 50, duration: 30, isAvailable: true },
    ],
    skipDuplicates: true,
  });

  const service = await prisma.service.findFirst({ where: { isAvailable: true } });

  if (service && user) {
    const startTime = addDays(new Date(), 1);
    await prisma.booking.create({
      data: {
        userId: user.id,
        serviceId: service.id,
        startTime,
        endTime: addDays(new Date(), 1),
        totalPrice: service.price,
        status: "CONFIRMED",
      },
    });
  }

  console.log("✅ Database seeded successfully!");
  console.log(`👤 Admin: ${admin.email}`);
  console.log(`👤 User: ${user.email}`);
  console.log("🔑 Password for both: password123");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    // لا نطبع أي شيء هنا، فقط disconnect
    await prisma.$disconnect();
  });