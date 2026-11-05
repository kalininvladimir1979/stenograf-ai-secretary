import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: "../../.env" });

const db = new PrismaClient();

async function main() {
  // Seed intentionally contains no users, organizations, meetings, or tasks.
  // A new workspace is created through the registration flow.
  await db.devSetting.upsert({
    where: { key: "analysis_model" },
    update: {},
    create: { key: "analysis_model", value: "gpt-4.1-mini" },
  });
  await db.devSetting.upsert({
    where: { key: "whisper_model" },
    update: {},
    create: { key: "whisper_model", value: "whisper-1" },
  });
  console.log("База инициализирована без демонстрационных данных.");
}

main().finally(() => db.$disconnect());
