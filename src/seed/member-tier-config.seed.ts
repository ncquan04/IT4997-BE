/**
 * Seed dữ liệu mặc định cho MemberTierConfig.
 * Chạy một lần: npx ts-node src/seed/member-tier-config.seed.ts
 *
 * Nếu document đã tồn tại thì upsert (không tạo trùng).
 */
import connectDatabase from "../utils/connectDB";
import MemberTierConfigModel from "../models/member-tier-config-model.mongo";
import { MemberTier } from "../shared/models/member-tier-config-model";
import mongoose from "mongoose";

const DEFAULT_TIERS = [
    {
        tier: MemberTier.S_NEW,
        minSpent: 0,
        discountPercent: 0,
        isActive: true,
    },
    {
        tier: MemberTier.S_MEM,
        minSpent: 5_000_000,
        discountPercent: 2,
        isActive: true,
    },
    {
        tier: MemberTier.S_CLASS,
        minSpent: 20_000_000,
        discountPercent: 5,
        isActive: true,
    },
];

async function main() {
    try {
        await connectDatabase();

        for (const config of DEFAULT_TIERS) {
            await MemberTierConfigModel.findOneAndUpdate(
                { tier: config.tier },
                { $setOnInsert: config },
                { upsert: true, new: true }
            );
        }

        console.log("✅ MemberTierConfig seeded successfully");
    } catch (error) {
        console.error("❌ Error seeding MemberTierConfig:", error);
    } finally {
        await mongoose.disconnect();
    }
}

main();
