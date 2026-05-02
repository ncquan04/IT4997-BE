/**
 * Seed highly realistic event data for analytics & funnel demo.
 *
 * Key improvements over the previous version:
 *   • Users visit across MULTIPLE days (returning visitors with same anonymousId)
 *   • Each visit is a separate session with realistic time gaps between actions
 *   • Browsing patterns match the actual app flow (page_view → category → search → product → cart → checkout)
 *   • All event names/params match exactly what the frontend fires
 *   • Realistic distributions: most users browse, few buy; some users buy repeatedly
 *   • Includes: login/signup flows, failed logins, wishlist management, variant selection,
 *     coupon usage, quantity updates, filter changes, load_more pagination
 *
 * Generates ~150k–200k events across 15,000 users over 90 days.
 *
 * Usage:
 *   npx ts-node -r dotenv/config src/seed/seed-events.ts
 */

import mongoose from "mongoose";
import connectDatabase from "../utils/connectDB";
import EventModel from "../models/event-model.mongo";
import crypto from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const TOTAL_USERS = 15_000;
const DATE_RANGE_DAYS = 90;
const BATCH_INSERT = 5_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uuid = () => crypto.randomUUID();
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
};
const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
const maybe = (pct: number) => Math.random() * 100 < pct;
const weightedPick = <T>(items: T[], weights: number[]): T => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
};

const now = Date.now();
const msPerDay = 86_400_000;
const msPerHour = 3_600_000;

// ─── Realistic catalog data ──────────────────────────────────────────────────

const CATEGORIES = [
    { id: "cat_laptop", name: "Laptop" },
    { id: "cat_phone", name: "Điện thoại" },
    { id: "cat_tablet", name: "Máy tính bảng" },
    { id: "cat_headphone", name: "Tai nghe" },
    { id: "cat_smartwatch", name: "Đồng hồ thông minh" },
    { id: "cat_gaming", name: "Gaming" },
    { id: "cat_camera", name: "Camera" },
    { id: "cat_accessory", name: "Phụ kiện" },
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
    "Logitech",
    "JBL",
    "Huawei",
    "Oppo",
    "MSI",
    "Acer",
];

const PRODUCTS = [
    {
        id: "p001",
        title: "MacBook Pro 14 M3",
        categoryId: "cat_laptop",
        brand: "Apple",
        variants: [
            { id: "v001a", name: "16GB/512GB", price: 49_990_000 },
            { id: "v001b", name: "32GB/1TB", price: 62_990_000 },
        ],
    },
    {
        id: "p002",
        title: "Galaxy S24 Ultra",
        categoryId: "cat_phone",
        brand: "Samsung",
        variants: [
            { id: "v002a", name: "256GB Titan Black", price: 31_990_000 },
            { id: "v002b", name: "512GB Titan Gray", price: 35_990_000 },
        ],
    },
    {
        id: "p003",
        title: "iPad Air M2",
        categoryId: "cat_tablet",
        brand: "Apple",
        variants: [
            { id: "v003a", name: "64GB WiFi", price: 16_990_000 },
            { id: "v003b", name: "256GB WiFi+Cell", price: 22_990_000 },
        ],
    },
    {
        id: "p004",
        title: "Sony WH-1000XM5",
        categoryId: "cat_headphone",
        brand: "Sony",
        variants: [
            { id: "v004a", name: "Black", price: 7_490_000 },
            { id: "v004b", name: "Silver", price: 7_490_000 },
        ],
    },
    {
        id: "p005",
        title: "Apple Watch Ultra 2",
        categoryId: "cat_smartwatch",
        brand: "Apple",
        variants: [{ id: "v005a", name: "49mm GPS+Cell", price: 21_990_000 }],
    },
    {
        id: "p006",
        title: "ROG Strix G16 2024",
        categoryId: "cat_gaming",
        brand: "Asus",
        variants: [
            { id: "v006a", name: "RTX 4060 16GB", price: 32_990_000 },
            { id: "v006b", name: "RTX 4070 32GB", price: 42_990_000 },
        ],
    },
    {
        id: "p007",
        title: "Sony A7 IV",
        categoryId: "cat_camera",
        brand: "Sony",
        variants: [{ id: "v007a", name: "Body Only", price: 46_990_000 }],
    },
    {
        id: "p008",
        title: "AirPods Pro 2 USB-C",
        categoryId: "cat_headphone",
        brand: "Apple",
        variants: [{ id: "v008a", name: "Standard", price: 5_990_000 }],
    },
    {
        id: "p009",
        title: "Galaxy Tab S9 FE",
        categoryId: "cat_tablet",
        brand: "Samsung",
        variants: [
            { id: "v009a", name: "128GB WiFi", price: 9_490_000 },
            { id: "v009b", name: "256GB WiFi", price: 11_490_000 },
        ],
    },
    {
        id: "p010",
        title: "ThinkPad X1 Carbon Gen 12",
        categoryId: "cat_laptop",
        brand: "Lenovo",
        variants: [{ id: "v010a", name: "i7/16GB/512GB", price: 38_990_000 }],
    },
    {
        id: "p011",
        title: "Redmi Note 13 Pro+",
        categoryId: "cat_phone",
        brand: "Xiaomi",
        variants: [
            { id: "v011a", name: "8/256GB", price: 8_990_000 },
            { id: "v011b", name: "12/512GB", price: 10_990_000 },
        ],
    },
    {
        id: "p012",
        title: "HP Spectre x360 14",
        categoryId: "cat_laptop",
        brand: "HP",
        variants: [{ id: "v012a", name: "i7/16GB/1TB", price: 41_990_000 }],
    },
    {
        id: "p013",
        title: "Dell XPS 15 9530",
        categoryId: "cat_laptop",
        brand: "Dell",
        variants: [
            { id: "v013a", name: "i7/16GB/512GB", price: 39_990_000 },
            { id: "v013b", name: "i9/32GB/1TB", price: 54_990_000 },
        ],
    },
    {
        id: "p014",
        title: "iPhone 15 Pro Max",
        categoryId: "cat_phone",
        brand: "Apple",
        variants: [
            { id: "v014a", name: "256GB Natural", price: 34_990_000 },
            { id: "v014b", name: "512GB Blue", price: 41_990_000 },
            { id: "v014c", name: "1TB Black", price: 46_990_000 },
        ],
    },
    {
        id: "p015",
        title: "Galaxy Buds FE",
        categoryId: "cat_headphone",
        brand: "Samsung",
        variants: [
            { id: "v015a", name: "Graphite", price: 1_990_000 },
            { id: "v015b", name: "White", price: 1_990_000 },
        ],
    },
    {
        id: "p016",
        title: "Razer Blade 16 2024",
        categoryId: "cat_gaming",
        brand: "Razer",
        variants: [{ id: "v016a", name: "RTX 4080 32GB", price: 79_990_000 }],
    },
    {
        id: "p017",
        title: "Bose QuietComfort 45",
        categoryId: "cat_headphone",
        brand: "Sony",
        variants: [{ id: "v017a", name: "Black", price: 6_290_000 }],
    },
    {
        id: "p018",
        title: "Logitech MX Master 3S",
        categoryId: "cat_accessory",
        brand: "Logitech",
        variants: [
            { id: "v018a", name: "Graphite", price: 2_490_000 },
            { id: "v018b", name: "Pale Gray", price: 2_490_000 },
        ],
    },
    {
        id: "p019",
        title: "Samsung Galaxy Watch 6",
        categoryId: "cat_smartwatch",
        brand: "Samsung",
        variants: [
            { id: "v019a", name: "40mm", price: 6_490_000 },
            { id: "v019b", name: "44mm", price: 7_490_000 },
        ],
    },
    {
        id: "p020",
        title: "JBL Charge 5",
        categoryId: "cat_accessory",
        brand: "JBL",
        variants: [
            { id: "v020a", name: "Black", price: 3_190_000 },
            { id: "v020b", name: "Blue", price: 3_190_000 },
        ],
    },
    {
        id: "p021",
        title: "MSI Katana 15 B13V",
        categoryId: "cat_gaming",
        brand: "MSI",
        variants: [{ id: "v021a", name: "RTX 4050 16GB", price: 24_990_000 }],
    },
    {
        id: "p022",
        title: "Oppo Find X7 Ultra",
        categoryId: "cat_phone",
        brand: "Oppo",
        variants: [{ id: "v022a", name: "16/512GB", price: 24_990_000 }],
    },
    {
        id: "p023",
        title: "Huawei Watch GT 4",
        categoryId: "cat_smartwatch",
        brand: "Huawei",
        variants: [{ id: "v023a", name: "46mm Black", price: 5_990_000 }],
    },
    {
        id: "p024",
        title: "Acer Nitro V 15",
        categoryId: "cat_gaming",
        brand: "Acer",
        variants: [{ id: "v024a", name: "RTX 4060 16GB", price: 22_990_000 }],
    },
    {
        id: "p025",
        title: "Keychron K8 Pro",
        categoryId: "cat_accessory",
        brand: "Logitech",
        variants: [
            { id: "v025a", name: "Brown Switch", price: 2_290_000 },
            { id: "v025b", name: "Red Switch", price: 2_290_000 },
        ],
    },
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
    "laptop văn phòng",
    "chuột không dây",
    "sạc nhanh",
    "điện thoại giá rẻ",
    "tai nghe chống ồn",
    "laptop sinh viên",
    "màn hình gaming",
    "ốp lưng iphone",
    "đồng hồ thông minh",
    "máy ảnh mirrorless",
];

const PAGES_BROWSING = [
    "/home",
    "/products",
    "/home",
    "/home",
    "/home", // weighted toward home
    "/about",
    "/contact",
];

const SOURCES = [
    "google",
    "facebook",
    "direct",
    "tiktok",
    "email",
    "zalo",
    "direct",
    "direct",
];
const DEVICES: Array<"desktop" | "mobile" | "tablet"> = [
    "desktop",
    "mobile",
    "tablet",
];
const DEVICE_WEIGHTS = [35, 55, 10]; // mobile-heavy
const BROWSERS: Record<string, string[]> = {
    desktop: ["Chrome", "Safari", "Firefox", "Edge"],
    mobile: ["Chrome", "Safari", "Samsung Internet"],
    tablet: ["Safari", "Chrome"],
};
const OS_MAP: Record<string, string[]> = {
    desktop: ["Windows", "macOS", "Linux"],
    mobile: ["iOS", "Android"],
    tablet: ["iOS", "Android"],
};

const COUPONS = [
    "SALE10",
    "WELCOME20",
    "FREESHIP",
    "VIP30",
    "FLASH50",
    "NEWYEAR",
    "SUMMER25",
];
const PAYMENT_METHODS = ["cod", "momo", "vnpay", "zalopay", "credit_card"];

const FILTER_KEYS = ["Hãng", "RAM", "Bộ nhớ", "Màu sắc", "Kích thước màn hình"];
const FILTER_VALUES: Record<string, string[]> = {
    Hãng: BRANDS.slice(0, 8),
    RAM: ["4GB", "8GB", "16GB", "32GB", "64GB"],
    "Bộ nhớ": ["128GB", "256GB", "512GB", "1TB"],
    "Màu sắc": ["Đen", "Trắng", "Bạc", "Xanh", "Hồng"],
    "Kích thước màn hình": [
        "13 inch",
        "14 inch",
        "15.6 inch",
        "16 inch",
        "17 inch",
    ],
};

const REFERRERS: Record<string, string> = {
    google: "https://www.google.com/search?q=",
    facebook: "https://www.facebook.com/",
    tiktok: "https://www.tiktok.com/",
    email: "",
    zalo: "https://zalo.me/",
    direct: "",
};

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.51",
];

// ─── User profile (persisted across sessions) ────────────────────────────────

interface UserProfile {
    anonymousId: string;
    userId: string | null;
    device: "desktop" | "mobile" | "tablet";
    browser: string;
    os: string;
    userAgent: string;
    ip: string;
    source: string;
    // Behavioral traits
    isHighIntent: boolean; // likely to purchase
    isBrowser: boolean; // browses a lot but rarely buys
    isReturning: boolean; // visits multiple days
    favoriteCategories: (typeof CATEGORIES)[number][];
}

function createUserProfile(): UserProfile {
    const device = weightedPick(DEVICES, DEVICE_WEIGHTS);
    const browser = pick(BROWSERS[device]);
    const os = pick(OS_MAP[device]);
    const source = pick(SOURCES);

    // Behavioral segments
    const r = Math.random();
    let isHighIntent = false;
    let isBrowser = false;
    let isReturning = false;

    if (r < 0.08) {
        isHighIntent = true;
        isReturning = true; // 8% power buyers
    } else if (r < 0.25) {
        isReturning = true; // 17% returning browsers
    } else if (r < 0.55) {
        isBrowser = true; // 30% casual browsers
    }
    // else 45% one-time visitors

    return {
        anonymousId: uuid(),
        userId: maybe(45) ? uuid() : null,
        device,
        browser,
        os,
        userAgent: pick(USER_AGENTS),
        ip: `${rand(1, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
        source,
        isHighIntent,
        isBrowser,
        isReturning,
        favoriteCategories: pickN(CATEGORIES, rand(1, 3)),
    };
}

// ─── Event builder ───────────────────────────────────────────────────────────

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

class SessionBuilder {
    private events: RawEvent[] = [];
    private ts: number;
    private sessionId: string;
    private profile: UserProfile;
    private referrer: string;

    constructor(profile: UserProfile, dayOffset: number, hourOfDay?: number) {
        this.profile = profile;
        this.sessionId = uuid();
        const hour =
            hourOfDay ??
            weightedPick(
                [
                    7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                    23,
                ],
                [2, 4, 6, 8, 8, 10, 8, 7, 6, 5, 5, 8, 12, 15, 14, 10, 5] // peak evening
            );
        this.ts =
            now -
            dayOffset * msPerDay +
            hour * msPerHour +
            rand(0, msPerHour - 1);
        this.referrer = REFERRERS[profile.source] || "";
        if (this.referrer && profile.source === "google") {
            this.referrer += pick(SEARCH_TERMS).replace(/ /g, "+");
        }
    }

    private advance(minMs: number, maxMs: number) {
        this.ts += rand(minMs, maxMs);
    }

    private emit(eventName: string, params: Record<string, any>, page: string) {
        this.events.push({
            anonymousId: this.profile.anonymousId,
            sessionId: this.sessionId,
            userId: this.profile.userId,
            eventName,
            params: {
                device: this.profile.device,
                browser: this.profile.browser,
                os: this.profile.os,
                source: this.profile.source,
                ...params,
            },
            page,
            referrer: this.referrer,
            userAgent: this.profile.userAgent,
            ip: this.profile.ip,
            timestamp: new Date(this.ts),
        });
        // After first event, referrer becomes internal
        this.referrer = "";
    }

    getEvents(): RawEvent[] {
        return this.events;
    }

    // ── Atomic actions ──

    pageView(page: string) {
        this.emit("page_view", { page, title: this.pageTitle(page) }, page);
        this.advance(1_000, 5_000);
    }

    identify() {
        if (this.profile.userId) {
            this.emit("identify", { userId: this.profile.userId }, "/home");
            this.advance(500, 1_500);
        }
    }

    login() {
        // Sometimes fail first
        if (maybe(15)) {
            this.emit(
                "login_failed",
                { method: "email", error: "Sai mật khẩu" },
                "/login"
            );
            this.advance(3_000, 8_000);
        }
        this.emit("login", { method: "email" }, "/login");
        this.advance(1_000, 3_000);
        this.identify();
    }

    signUp() {
        if (maybe(10)) {
            this.emit(
                "sign_up_failed",
                { method: "email", error: "Email đã tồn tại" },
                "/signup"
            );
            this.advance(5_000, 15_000);
        }
        this.emit("sign_up", { method: "email" }, "/signup");
        this.advance(1_000, 3_000);
        this.identify();
    }

    viewCategory(cat?: (typeof CATEGORIES)[number]) {
        const category = cat || pick(this.profile.favoriteCategories);
        this.emit(
            "view_category",
            {
                categoryId: category.id,
                categoryName: category.name,
                isParent: maybe(60),
            },
            `/categories/${category.id}`
        );
        this.advance(3_000, 15_000);

        // Maybe apply filters
        if (maybe(35)) {
            const filterKey = pick(FILTER_KEYS);
            const filterValue = pick(FILTER_VALUES[filterKey]);
            this.emit(
                "filter_change",
                {
                    categoryId: category.id,
                    filterKey,
                    filterValue,
                    action: "add",
                },
                `/categories/${category.id}`
            );
            this.advance(2_000, 8_000);
        }

        return category;
    }

    search(query?: string) {
        const q = query || pick(SEARCH_TERMS);
        this.emit(
            "search",
            {
                query: q,
                categoryId: maybe(30)
                    ? pick(this.profile.favoriteCategories).id
                    : null,
                categoryName: null,
            },
            "/search"
        );
        this.advance(2_000, 10_000);

        // Load more results
        if (maybe(25)) {
            this.emit(
                "load_more",
                {
                    query: q,
                    categoryId: null,
                    currentPage: 1,
                    nextPage: 2,
                },
                "/search"
            );
            this.advance(3_000, 12_000);
        }

        return q;
    }

    selectItem(product: (typeof PRODUCTS)[number]) {
        this.emit(
            "select_item",
            {
                productId: product.id,
                title: product.title,
                price: product.variants[0].price,
                source: maybe(60) ? "product_card" : "search_result",
            },
            `/products/${product.id}`
        );
        this.advance(500, 2_000);
    }

    viewProduct(product: (typeof PRODUCTS)[number]) {
        const variant = product.variants[0];
        this.emit(
            "view_product",
            {
                productId: product.id,
                title: product.title,
                categoryId: product.categoryId,
                brand: product.brand,
                price: variant.price,
                variantName: variant.name,
            },
            `/products/${product.id}`
        );
        this.advance(8_000, 60_000); // users spend time reading product details

        // Select different variant
        if (product.variants.length > 1 && maybe(45)) {
            const altVariant =
                product.variants[rand(1, product.variants.length - 1)];
            this.emit(
                "select_variant",
                {
                    productId: product.id,
                    variantId: altVariant.id,
                    variantName: altVariant.name,
                    price: altVariant.price,
                },
                `/products/${product.id}`
            );
            this.advance(3_000, 10_000);
            return altVariant;
        }
        return variant;
    }

    addToWishlist(product: (typeof PRODUCTS)[number]) {
        this.emit(
            "add_to_wishlist",
            {
                productId: product.id,
                title: product.title,
                categoryId: product.categoryId,
                price: product.variants[0].price,
            },
            `/products/${product.id}`
        );
        this.advance(1_000, 3_000);
    }

    removeFromWishlist(product: (typeof PRODUCTS)[number]) {
        this.emit(
            "remove_from_wishlist",
            {
                productId: product.id,
                title: product.title,
            },
            `/products/${product.id}`
        );
        this.advance(1_000, 2_000);
    }

    viewWishlist(items: (typeof PRODUCTS)[number][]) {
        this.emit(
            "view_wishlist",
            {
                itemCount: items.length,
                items: items
                    .slice(0, 5)
                    .map((p) => ({ productId: p.id, title: p.title })),
            },
            "/wishlist"
        );
        this.advance(3_000, 15_000);
    }

    addToCart(
        product: (typeof PRODUCTS)[number],
        variant: { id: string; name: string; price: number },
        quantity = 1,
        source = "product_detail"
    ) {
        this.emit(
            "add_to_cart",
            {
                productId: product.id,
                title: product.title,
                variantId: variant.id,
                variantName: variant.name,
                price: variant.price,
                quantity,
                source,
            },
            source === "product_card" ? `/products` : `/products/${product.id}`
        );
        this.advance(1_000, 5_000);
    }

    viewCart(
        items: { product: (typeof PRODUCTS)[number]; quantity: number }[]
    ) {
        this.emit(
            "view_cart",
            {
                itemCount: items.length,
                totalPrice: items.reduce(
                    (s, i) => s + i.product.variants[0].price * i.quantity,
                    0
                ),
                items: items.map((i) => ({
                    productId: i.product.id,
                    title: i.product.title,
                    quantity: i.quantity,
                })),
            },
            "/cart"
        );
        this.advance(3_000, 15_000);
    }

    updateCartQuantity(
        product: (typeof PRODUCTS)[number],
        variant: { id: string },
        oldQty: number,
        newQty: number
    ) {
        this.emit(
            "update_cart_quantity",
            {
                productId: product.id,
                title: product.title,
                variantId: variant.id,
                oldQuantity: oldQty,
                newQuantity: newQty,
            },
            "/cart"
        );
        this.advance(1_000, 3_000);
    }

    removeFromCart(
        product: (typeof PRODUCTS)[number],
        variant: { id: string; name: string; price: number },
        quantity: number
    ) {
        this.emit(
            "remove_from_cart",
            {
                productId: product.id,
                title: product.title,
                variantId: variant.id,
                variantName: variant.name,
                price: variant.price,
                quantity,
            },
            "/cart"
        );
        this.advance(1_000, 3_000);
    }

    beginCheckout(
        items: {
            product: (typeof PRODUCTS)[number];
            variant: { id: string; name: string; price: number };
            quantity: number;
        }[]
    ) {
        this.emit(
            "begin_checkout",
            {
                itemCount: items.length,
                items: items.map((i) => ({
                    productId: i.product.id,
                    title: i.product.title,
                    variantId: i.variant.id,
                    variantName: i.variant.name,
                    price: i.variant.price,
                    quantity: i.quantity,
                })),
                totalValue: items.reduce(
                    (s, i) => s + i.variant.price * i.quantity,
                    0
                ),
            },
            "/checkout"
        );
        this.advance(10_000, 60_000); // filling forms takes time
    }

    applyCoupon(code?: string) {
        const coupon = code || pick(COUPONS);
        this.emit(
            "apply_coupon",
            {
                couponCode: coupon,
                discount: rand(50_000, 2_000_000),
            },
            "/checkout"
        );
        this.advance(2_000, 5_000);
    }

    purchase(
        items: {
            product: (typeof PRODUCTS)[number];
            variant: { id: string; name: string; price: number };
            quantity: number;
        }[],
        couponCode?: string
    ) {
        const totalPrice = items.reduce(
            (s, i) => s + i.variant.price * i.quantity,
            0
        );
        const method = pick(PAYMENT_METHODS);
        this.emit(
            "purchase",
            {
                orderId: `ORD-${Date.now().toString(36).toUpperCase()}-${rand(1000, 9999)}`,
                paymentMethod: method,
                totalPrice,
                couponCode: couponCode || null,
                couponDiscount: couponCode ? rand(50_000, 2_000_000) : 0,
                pointsRedeemed: maybe(20) ? rand(1000, 50000) : 0,
                itemCount: items.length,
                items: items.map((i) => ({
                    productId: i.product.id,
                    title: i.product.title,
                    variantId: i.variant.id,
                    quantity: i.quantity,
                })),
            },
            "/checkout"
        );
        this.advance(2_000, 5_000);
    }

    private pageTitle(page: string): string {
        if (page === "/home" || page === "/") return "Trang chủ";
        if (page.startsWith("/products/")) return "Chi tiết sản phẩm";
        if (page === "/products") return "Tất cả sản phẩm";
        if (page === "/cart") return "Giỏ hàng";
        if (page === "/checkout") return "Thanh toán";
        if (page === "/search") return "Tìm kiếm";
        if (page === "/wishlist") return "Yêu thích";
        if (page.startsWith("/categories/")) return "Danh mục";
        if (page === "/login") return "Đăng nhập";
        if (page === "/signup") return "Đăng ký";
        if (page === "/about") return "Giới thiệu";
        if (page === "/contact") return "Liên hệ";
        if (page === "/orders") return "Đơn hàng";
        return "Trang";
    }
}

// ─── Journey generators ──────────────────────────────────────────────────────

function generateBrowseOnlySession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView(pick(PAGES_BROWSING));

    if (profile.userId && maybe(30)) {
        session.login();
    }

    // Browse a few categories
    const numCategories = rand(1, 3);
    for (let i = 0; i < numCategories; i++) {
        session.viewCategory();
    }

    // Maybe search
    if (maybe(40)) {
        session.search();
    }

    // View some products
    const numProducts = rand(1, 4);
    const viewedProducts: (typeof PRODUCTS)[number][] = [];
    for (let i = 0; i < numProducts; i++) {
        const product = pick(PRODUCTS);
        session.selectItem(product);
        session.viewProduct(product);
        viewedProducts.push(product);
    }

    // Maybe wishlist
    if (maybe(20) && viewedProducts.length > 0) {
        session.addToWishlist(pick(viewedProducts));
    }

    return session.getEvents();
}

function generateSearchToViewSession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView("/home");

    if (profile.userId && maybe(40)) {
        session.login();
    }

    // Search
    session.search();

    // View 1-3 products from search
    const numViewed = rand(1, 3);
    for (let i = 0; i < numViewed; i++) {
        const product = pick(PRODUCTS);
        session.selectItem(product);
        session.viewProduct(product);
    }

    return session.getEvents();
}

function generateAddToCartAbandonSession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView("/home");

    if (profile.userId && maybe(50)) {
        session.login();
    }

    // Browse → find product → add to cart → leave
    const cat = session.viewCategory();
    const product =
        PRODUCTS.find((p) => p.categoryId === cat.id) || pick(PRODUCTS);
    session.selectItem(product);
    const variant = session.viewProduct(product);
    session.addToCart(product, variant);

    // Maybe add another
    if (maybe(30)) {
        const p2 = pick(PRODUCTS);
        session.selectItem(p2);
        const v2 = session.viewProduct(p2);
        session.addToCart(p2, v2);
    }

    // View cart but don't checkout
    session.viewCart([{ product, quantity: 1 }]);

    // Maybe update quantity
    if (maybe(25)) {
        session.updateCartQuantity(product, variant, 1, rand(2, 3));
    }

    // Maybe remove and leave
    if (maybe(15)) {
        session.removeFromCart(product, variant, 1);
    }

    return session.getEvents();
}

function generateFullPurchaseSession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView("/home");

    if (profile.userId) {
        session.login();
    }

    // Discovery phase
    const discoveryMethod = Math.random();
    let mainProduct: (typeof PRODUCTS)[number];

    if (discoveryMethod < 0.4) {
        // Through category
        const cat = session.viewCategory();
        mainProduct =
            PRODUCTS.find((p) => p.categoryId === cat.id) || pick(PRODUCTS);
    } else if (discoveryMethod < 0.7) {
        // Through search
        session.search();
        mainProduct = pick(PRODUCTS);
    } else {
        // Direct from home
        mainProduct = pick(PRODUCTS);
    }

    session.selectItem(mainProduct);
    const mainVariant = session.viewProduct(mainProduct);

    // Add to cart
    const quantity = rand(1, 2);
    session.addToCart(mainProduct, mainVariant, quantity);

    const cartItems: {
        product: (typeof PRODUCTS)[number];
        variant: typeof mainVariant;
        quantity: number;
    }[] = [{ product: mainProduct, variant: mainVariant, quantity }];

    // Maybe add more products
    if (maybe(35)) {
        const p2 = pick(PRODUCTS);
        session.selectItem(p2);
        const v2 = session.viewProduct(p2);
        session.addToCart(p2, v2);
        cartItems.push({ product: p2, variant: v2, quantity: 1 });
    }

    // View cart
    session.viewCart(
        cartItems.map((i) => ({ product: i.product, quantity: i.quantity }))
    );

    // Begin checkout
    session.beginCheckout(cartItems);

    // Apply coupon (some users)
    let couponCode: string | undefined;
    if (maybe(35)) {
        couponCode = pick(COUPONS);
        session.applyCoupon(couponCode);
    }

    // Purchase
    session.purchase(cartItems, couponCode);

    return session.getEvents();
}

function generateSignUpSession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView("/home");
    session.pageView("/signup");
    session.signUp();

    // After signup, browse a bit
    if (maybe(60)) {
        const cat = session.viewCategory();
        const product =
            PRODUCTS.find((p) => p.categoryId === cat.id) || pick(PRODUCTS);
        session.selectItem(product);
        session.viewProduct(product);
        if (maybe(30)) {
            session.addToWishlist(product);
        }
    }

    return session.getEvents();
}

function generateWishlistSession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView("/home");

    if (profile.userId) {
        session.login();
    }

    // View wishlist
    const wishlistProducts = pickN(PRODUCTS, rand(2, 5));
    session.viewWishlist(wishlistProducts);

    // Maybe remove one
    if (maybe(30)) {
        session.removeFromWishlist(pick(wishlistProducts));
    }

    // Maybe add one from wishlist to cart
    if (maybe(40)) {
        const product = pick(wishlistProducts);
        session.addToCart(product, product.variants[0], 1, "product_card");
    }

    return session.getEvents();
}

function generateCheckoutAbandonSession(
    profile: UserProfile,
    dayOffset: number
): RawEvent[] {
    const session = new SessionBuilder(profile, dayOffset);
    session.pageView("/home");

    if (profile.userId) {
        session.login();
    }

    const product = pick(PRODUCTS);
    session.selectItem(product);
    const variant = session.viewProduct(product);
    session.addToCart(product, variant);
    session.viewCart([{ product, quantity: 1 }]);
    session.beginCheckout([{ product, variant, quantity: 1 }]);

    // Abandon at checkout (no purchase event)
    return session.getEvents();
}

// ─── Multi-day user journey orchestrator ─────────────────────────────────────

function generateUserEvents(profile: UserProfile): RawEvent[] {
    const allEvents: RawEvent[] = [];

    // Determine how many sessions this user has
    let numSessions: number;
    if (profile.isHighIntent) {
        numSessions = rand(4, 12); // power buyers visit many times
    } else if (profile.isReturning) {
        numSessions = rand(2, 6);
    } else if (profile.isBrowser) {
        numSessions = rand(1, 3);
    } else {
        numSessions = 1; // one-time visitor
    }

    // Spread sessions across different days
    const sessionDays = Array.from({ length: numSessions }, () =>
        rand(1, DATE_RANGE_DAYS)
    ).sort((a, b) => b - a); // chronological (larger dayOffset = further in the past)

    let hasPurchased = false;

    for (let i = 0; i < sessionDays.length; i++) {
        const day = sessionDays[i];
        const isLastSession = i === sessionDays.length - 1;
        let sessionEvents: RawEvent[];

        if (profile.isHighIntent && isLastSession && !hasPurchased) {
            // High-intent users almost always buy eventually
            sessionEvents = generateFullPurchaseSession(profile, day);
            hasPurchased = true;
        } else if (profile.isHighIntent && maybe(30) && !hasPurchased) {
            // Some high-intent buy earlier
            sessionEvents = generateFullPurchaseSession(profile, day);
            hasPurchased = true;
        } else {
            // Pick a session type based on profile
            const sessionType = Math.random();

            if (!profile.userId && i === 0 && maybe(15)) {
                // First session might be signup
                sessionEvents = generateSignUpSession(profile, day);
                profile.userId = uuid(); // now they have an account
            } else if (sessionType < 0.3) {
                sessionEvents = generateBrowseOnlySession(profile, day);
            } else if (sessionType < 0.45) {
                sessionEvents = generateSearchToViewSession(profile, day);
            } else if (sessionType < 0.6) {
                sessionEvents = generateAddToCartAbandonSession(profile, day);
            } else if (sessionType < 0.7) {
                sessionEvents = generateCheckoutAbandonSession(profile, day);
            } else if (sessionType < 0.8 && profile.userId) {
                sessionEvents = generateWishlistSession(profile, day);
            } else if (sessionType < 0.9 && !hasPurchased && maybe(40)) {
                sessionEvents = generateFullPurchaseSession(profile, day);
                hasPurchased = true;
            } else {
                sessionEvents = generateBrowseOnlySession(profile, day);
            }
        }

        allEvents.push(...sessionEvents);
    }

    return allEvents;
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

    console.log(
        `🚀 Generating events for ${TOTAL_USERS.toLocaleString()} users...`
    );

    for (let i = 0; i < TOTAL_USERS; i++) {
        const profile = createUserProfile();
        const events = generateUserEvents(profile);
        buffer.push(...events);

        if (buffer.length >= BATCH_INSERT) {
            await flushBuffer();
            if ((i + 1) % 1000 === 0) {
                console.log(
                    `   ... ${(i + 1).toLocaleString()}/${TOTAL_USERS.toLocaleString()} users, ${totalInserted.toLocaleString()} events so far`
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
        console.log(
            `   ${String(s._id).padEnd(24)} ${s.count.toLocaleString()}`
        );
    }

    const uniqueUsers = await EventModel.distinct("anonymousId");
    console.log(
        `\n👤 Unique users (anonymousId): ${uniqueUsers.length.toLocaleString()}`
    );

    const uniqueSessions = await EventModel.distinct("sessionId");
    console.log(
        `🔑 Unique sessions: ${uniqueSessions.length.toLocaleString()}`
    );

    const dateRange = await EventModel.aggregate([
        {
            $group: {
                _id: null,
                min: { $min: "$timestamp" },
                max: { $max: "$timestamp" },
            },
        },
    ]);
    if (dateRange[0]) {
        console.log(
            `📅 Date range: ${dateRange[0].min.toISOString().slice(0, 10)} → ${dateRange[0].max.toISOString().slice(0, 10)}`
        );
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
