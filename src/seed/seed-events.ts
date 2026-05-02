/**
 * Seed realistic event data for funnel query demo.
 *
 * Generates ~50 000+ events across 3 000 simulated users with natural
 * drop-off at every step.  Covers both preset funnels:
 *   • Purchase Funnel:  page_view → view_product → add_to_cart → begin_checkout → purchase
 *   • Search to Buy:    page_view → search → view_product → add_to_cart → purchase
 *
 * Also sprinkles in extra event types (sign_up, identify, wishlist, review,
 * apply_coupon, remove_from_cart) so the event-name picker and param-key
 * pickers have variety.
 *
 * Usage:
 *   npx ts-node -r dotenv/config src/seed/seed-events.ts
 */

import mongoose from "mongoose";
import connectDatabase from "../utils/connectDB";
import EventModel from "../models/event-model.mongo";
import crypto from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const TOTAL_USERS = 10_000;
const DATE_RANGE_DAYS = 60; // events spread over last 60 days
const BATCH_INSERT = 5_000; // insertMany batch size

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uuid = () => crypto.randomUUID();

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const maybe = (pct: number) => Math.random() * 100 < pct;

const now = Date.now();
const msPerDay = 86_400_000;

const randomTimestamp = (daysAgo: number, spreadMs = msPerDay) =>
    new Date(now - daysAgo * msPerDay + Math.random() * spreadMs);

// ─── Catalog data (realistic params) ─────────────────────────────────────────

const CATEGORIES = [
    "Laptop",
    "Phone",
    "Tablet",
    "Headphone",
    "Smartwatch",
    "Gaming",
    "Camera",
    "Accessory",
];

const BRANDS = [
    "Apple",
    "Samsung",
    "Sony",
    "Dell",
    "Asus",
    "Lenovo",
    "Xiaomi",
    "HP",
    "LG",
    "Razer",
];

const PRODUCT_NAMES = [
    "MacBook Pro 14",
    "Galaxy S24 Ultra",
    "iPad Air M2",
    "WH-1000XM5",
    "Apple Watch Ultra 2",
    "ROG Strix G16",
    "Sony A7 IV",
    "AirPods Pro 2",
    "Galaxy Tab S9",
    "ThinkPad X1 Carbon",
    "Redmi Note 13",
    "HP Spectre x360",
    "LG Gram 17",
    "Razer Blade 16",
    "Galaxy Buds FE",
    "Dell XPS 15",
    "iPhone 15 Pro Max",
    "Pixel Watch 2",
    "Surface Pro 10",
    "Bose QC45",
];

const PAGES = [
    "/",
    "/products",
    "/products/laptop",
    "/products/phone",
    "/products/tablet",
    "/products/headphone",
    "/cart",
    "/checkout",
    "/account",
    "/search",
];

const SEARCH_TERMS = [
    "laptop gaming",
    "tai nghe bluetooth",
    "iphone 15",
    "macbook pro",
    "samsung galaxy",
    "máy tính bảng",
    "smartwatch",
    "camera sony",
    "phụ kiện",
    "bàn phím cơ",
];

const SOURCES = ["google", "facebook", "direct", "tiktok", "email", "zalo"];
const DEVICES = ["desktop", "mobile", "tablet"];
const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge", "Samsung Internet"];
const OS_LIST = ["Windows", "macOS", "iOS", "Android", "Linux"];
const COUPONS = ["SALE10", "WELCOME20", "FREESHIP", "VIP30", "FLASH50"];
const PAYMENT_METHODS = ["cod", "momo", "vnpay", "zalopay", "credit_card"];

function makeProduct() {
    const name = pick(PRODUCT_NAMES);
    const category = pick(CATEGORIES);
    const brand = pick(BRANDS);
    const price = rand(200_000, 50_000_000);
    return { productName: name, category, brand, price };
}

// ─── User Agent pool ─────────────────────────────────────────────────────────

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) Chrome/120",
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1",
];

// ─── Generate events for one user journey ────────────────────────────────────

interface RawEvent {
    anonymousId: string;
    sessionId: string;
    userId: string | null;
    eventName: string;
    params: Record<string, any>;
    page: string;
    referrer: string;
    userAgent: string;
    ip: string;
    timestamp: Date;
}

function generateUserJourney(userIndex: number): RawEvent[] {
    const events: RawEvent[] = [];
    const anonymousId = uuid();
    const sessionId = uuid();
    const dayStart = rand(1, DATE_RANGE_DAYS);
    let ts = randomTimestamp(dayStart).getTime();
    const step = () => {
        ts += rand(2_000, 120_000); // 2s – 2min between actions
        return new Date(ts);
    };

    const device = pick(DEVICES);
    const browser = pick(BROWSERS);
    const os = pick(OS_LIST);
    const source = pick(SOURCES);
    const ua = pick(USER_AGENTS);
    const ip = `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`;

    const isLoggedIn = maybe(55);
    const userId = isLoggedIn ? uuid() : null;

    const baseParams = { device, browser, os, source };

    const ev = (
        eventName: string,
        params: Record<string, any>,
        page: string
    ): RawEvent => ({
        anonymousId,
        sessionId,
        userId,
        eventName,
        params: { ...baseParams, ...params },
        page,
        referrer: source === "direct" ? "" : `https://www.${source}.com`,
        userAgent: ua,
        ip,
        timestamp: step(),
    });

    // ── Step 1: page_view (everyone) ──
    events.push(ev("page_view", {}, pick(PAGES)));

    // If logged in, also fire identify
    if (isLoggedIn) {
        events.push(ev("identify", { userId }, "/"));
    }

    // Sign up (small %)
    if (!isLoggedIn && maybe(12)) {
        events.push(
            ev(
                "sign_up",
                { method: pick(["email", "google", "facebook"]) },
                "/account"
            )
        );
    }

    // ── Two funnel paths ──
    const isSearchPath = maybe(40); // 40% go through search

    if (isSearchPath) {
        // search
        const term = pick(SEARCH_TERMS);
        events.push(
            ev("search", { query: term, resultsCount: rand(2, 80) }, "/search")
        );
    }

    // ── Step 2: view_product (85% proceed) ──
    if (!maybe(85)) return events;
    const product = makeProduct();
    events.push(
        ev(
            "view_product",
            { ...product },
            `/products/${product.category.toLowerCase()}`
        )
    );

    // Maybe view more products
    if (maybe(40)) {
        const p2 = makeProduct();
        events.push(
            ev(
                "view_product",
                { ...p2 },
                `/products/${p2.category.toLowerCase()}`
            )
        );
    }

    // Wishlist (small %)
    if (maybe(15)) {
        events.push(
            ev(
                "wishlist",
                { ...product, action: "add" },
                `/products/${product.category.toLowerCase()}`
            )
        );
    }

    // ── Step 3: add_to_cart (50% of viewers) ──
    if (!maybe(50)) return events;
    const quantity = rand(1, 3);
    events.push(ev("add_to_cart", { ...product, quantity }, "/cart"));

    // Some users add a second product
    if (maybe(25)) {
        const p2 = makeProduct();
        events.push(ev("add_to_cart", { ...p2, quantity: 1 }, "/cart"));
    }

    // Remove from cart (small %)
    if (maybe(10)) {
        events.push(ev("remove_from_cart", { ...product }, "/cart"));
        // If they removed, lower chance of continuing
        if (!maybe(40)) return events;
    }

    // ── Step 4: begin_checkout (60% of cart users) ──
    if (!maybe(60)) return events;
    const cartTotal = product.price * quantity + rand(0, 5_000_000);
    events.push(
        ev("begin_checkout", { itemCount: quantity, cartTotal }, "/checkout")
    );

    // Apply coupon (some %)
    if (maybe(30)) {
        const coupon = pick(COUPONS);
        events.push(
            ev("apply_coupon", { coupon, discount: rand(5, 50) }, "/checkout")
        );
    }

    // ── Step 5: purchase (70% of checkout users) ──
    if (!maybe(70)) return events;
    const paymentMethod = pick(PAYMENT_METHODS);
    events.push(
        ev(
            "purchase",
            {
                ...product,
                quantity,
                cartTotal,
                paymentMethod,
                orderId: `ORD-${rand(100000, 999999)}`,
            },
            "/checkout"
        )
    );

    // Review after purchase (rare)
    if (maybe(8)) {
        events.push(
            ev(
                "review",
                { ...product, rating: rand(3, 5), hasText: maybe(60) },
                `/products/${product.category.toLowerCase()}`
            )
        );
    }

    return events;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    await connectDatabase();

    // Clear existing events
    const deleted = await EventModel.deleteMany({});
    console.log(`🗑️  Cleared ${deleted.deletedCount} existing events`);

    let totalInserted = 0;
    let buffer: RawEvent[] = [];

    const flushBuffer = async () => {
        if (buffer.length === 0) return;
        await EventModel.insertMany(buffer, { ordered: false });
        totalInserted += buffer.length;
        buffer = [];
    };

    console.log(`🚀 Generating events for ${TOTAL_USERS} users...`);

    for (let i = 0; i < TOTAL_USERS; i++) {
        const events = generateUserJourney(i);
        buffer.push(...events);

        if (buffer.length >= BATCH_INSERT) {
            await flushBuffer();
            if ((i + 1) % 500 === 0) {
                console.log(
                    `   ... ${i + 1}/${TOTAL_USERS} users, ${totalInserted} events so far`
                );
            }
        }
    }

    // Final flush
    await flushBuffer();

    // Print stats
    console.log(`\n✅ Seeded ${totalInserted.toLocaleString()} events total\n`);

    const stats = await EventModel.aggregate([
        { $group: { _id: "$eventName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);

    console.log("📊 Event breakdown:");
    for (const s of stats) {
        console.log(`   ${s._id.padEnd(20)} ${s.count.toLocaleString()}`);
    }

    const uniqueUsers = await EventModel.distinct("anonymousId");
    console.log(
        `\n👤 Unique users (anonymousId): ${uniqueUsers.length.toLocaleString()}`
    );

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
