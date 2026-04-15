import connectDatabase from "./connectDB";
import { readFileSync } from "fs";
import { resolve } from "path";

import CategoryModel from "../models/category-model.mongo";
import ProductModel from "../models/product-model.mongo";
import UserModel from "../models/user-model.mongo";
import BranchModel from "../models/branch-model.mongo";
import SupplierModel from "../models/supplier-model.mongo";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";
import PayrollModel from "../models/payroll-model.mongo";
import AttendanceModel from "../models/attendance-model.mongo";
import OrderModel from "../models/order-model.mongo";
import PaymentModel from "../models/payment-model.mongo";
import { AttendanceStatus } from "../shared/models/attendance-model";

const DATA_DIR = resolve(__dirname, "../../data");

function loadJSON(fileName: string) {
    const filePath = resolve(DATA_DIR, fileName);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}

async function insertBatch(
    model: any,
    data: any[],
    batchSize: number,
    label: string
) {
    let inserted = 0;
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await model.insertMany(batch, { ordered: false });
        inserted += batch.length;
        if (inserted % (batchSize * 10) === 0 || inserted === data.length) {
            console.log(`  [${label}] ${inserted}/${data.length} ...`);
        }
    }
    return inserted;
}

// ─── Attendance generator ────────────────────────────────────────────────────
function buildAttendanceRecords() {
    // [employeeId, branchId]
    const employees = [
        ["7ee778226d4a12b53b7802b2", "7370d15897ce9527f6334460"],
        ["3bd34499ccfa01ec65d75439", "b1535794468a478872242f51"],
        ["497b1921cb00b69a1e0273ca", "e218fabec8956151d776124b"],
        ["fd5117dfc6c86692f172134a", "963eef8789b0be807cb88e11"],
        ["a4bf5a0a09b539d3915b8abd", "8a000c98ba8e8866d64c5f6b"],
        ["95306fbe83a4c67e68a2c634", "b1535794468a478872242f51"],
        ["6a847728212e485140d94838", "e218fabec8956151d776124b"],
        ["1b14f456a68c570207b35ec3", "1b23add5a73dd240b68a5f8b"],
        ["517c2d342e06f9902ab76af9", "963eef8789b0be807cb88e11"],
        ["49c98d1638e31b72aacb8d80", "7370d15897ce9527f6334460"],
        ["d9c90bd45165bd92ebb49490", "4bd3d096c6d0c94b6333cdfb"],
        ["b8dd7f7bd936648871fbe052", "007b30895b28e6cfa86e5d61"],
        ["bd923128c73ce1e71deefac6", "4e8c45f9e8d8c1738f97e7e8"],
        ["208e0c604e431ba385aa4efa", "4add55c8509acece7dec15cb"],
        ["ba1529a0f5e240323b22d06d", "4bb0ef5a36e2585b36066d89"],
        ["0359492ef975eb065d023e2b", "169a65fa5062af2ca064eaf4"],
        ["a51240de2eb87a3856ed72d4", "9fc20d0aa4dd596d4884d9f0"],
        ["a3d41ec66ee4ee5b13ebd9bc", "7bb93955dfa4cb2b5d1ca46f"],
    ];

    // Working days (Mon–Sat, skip public holidays)
    const workDays: Record<number, number[]> = {
        1: [
            2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23,
            24, 26, 27, 28, 29, 30, 31,
        ], // Jan: skip Jan 1
        2: [
            2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23,
            24, 25, 26, 27, 28,
        ], // Feb
        3: [
            2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23,
            24, 25, 26, 27, 28, 30, 31,
        ], // Mar
    };

    // Special statuses: 'empIndex_month_day' → status
    // Covers all 5 statuses across employees & months
    const specials: Record<string, AttendanceStatus> = {
        // LATE – phạt 50k/lần
        "0_1_9": AttendanceStatus.LATE,
        "0_2_16": AttendanceStatus.LATE,
        "0_3_16": AttendanceStatus.LATE,
        "2_1_14": AttendanceStatus.LATE,
        "2_2_11": AttendanceStatus.LATE,
        "4_1_7": AttendanceStatus.LATE,
        "4_1_23": AttendanceStatus.LATE,
        "4_3_9": AttendanceStatus.LATE,
        "9_1_20": AttendanceStatus.LATE,
        "9_2_14": AttendanceStatus.LATE,
        "13_1_17": AttendanceStatus.LATE,
        "13_3_10": AttendanceStatus.LATE,
        "17_2_18": AttendanceStatus.LATE,
        "17_3_25": AttendanceStatus.LATE,
        // LEAVE – nghỉ phép có lương
        "1_2_10": AttendanceStatus.LEAVE,
        "1_2_17": AttendanceStatus.LEAVE,
        "3_2_23": AttendanceStatus.LEAVE,
        "3_2_24": AttendanceStatus.LEAVE,
        "8_3_18": AttendanceStatus.LEAVE,
        "14_1_26": AttendanceStatus.LEAVE,
        "15_2_25": AttendanceStatus.LEAVE,
        "15_2_26": AttendanceStatus.LEAVE,
        // HALF_DAY – nửa ngày
        "6_1_28": AttendanceStatus.HALF_DAY,
        "6_2_5": AttendanceStatus.HALF_DAY,
        "7_3_4": AttendanceStatus.HALF_DAY,
        "11_1_15": AttendanceStatus.HALF_DAY,
        "11_3_21": AttendanceStatus.HALF_DAY,
        "16_1_29": AttendanceStatus.HALF_DAY,
        // ABSENT – vắng không phép
        "5_2_19": AttendanceStatus.ABSENT,
        "5_3_5": AttendanceStatus.ABSENT,
        "10_2_21": AttendanceStatus.ABSENT,
        "12_1_22": AttendanceStatus.ABSENT,
        "12_3_14": AttendanceStatus.ABSENT,
    };

    const records: any[] = [];

    for (let ei = 0; ei < employees.length; ei++) {
        const [empId, branchId] = employees[ei];
        for (const month of [1, 2, 3]) {
            for (const day of workDays[month]) {
                const key = `${ei}_${month}_${day}`;
                const status: AttendanceStatus =
                    (specials[key] as AttendanceStatus) ??
                    AttendanceStatus.PRESENT;
                const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const rec: any = { employeeId: empId, branchId, date, status };

                if (status === AttendanceStatus.PRESENT) {
                    rec.checkInTime = new Date(
                        `${date}T08:30:00+07:00`
                    ).getTime();
                    rec.checkOutTime = new Date(
                        `${date}T17:30:00+07:00`
                    ).getTime();
                    rec.workingHours = 9;
                } else if (status === AttendanceStatus.LATE) {
                    rec.checkInTime = new Date(
                        `${date}T09:30:00+07:00`
                    ).getTime();
                    rec.checkOutTime = new Date(
                        `${date}T17:30:00+07:00`
                    ).getTime();
                    rec.workingHours = 8;
                    rec.note = "Late check-in";
                } else if (status === AttendanceStatus.HALF_DAY) {
                    rec.checkInTime = new Date(
                        `${date}T08:30:00+07:00`
                    ).getTime();
                    rec.checkOutTime = new Date(
                        `${date}T12:30:00+07:00`
                    ).getTime();
                    rec.workingHours = 4;
                    rec.note = "Half day";
                } else if (status === AttendanceStatus.LEAVE) {
                    rec.workingHours = 0;
                    rec.note = "Approved leave";
                } else if (status === AttendanceStatus.ABSENT) {
                    rec.note = "Absent without notice";
                }

                records.push(rec);
            }
        }
    }

    return records;
}

// ─── Order + Payment generator ───────────────────────────────────────────────
function buildOrderRecords() {
    // Catalog: { productId, variantId, title, variantName, price, costPrice }
    const catalog = [
        {
            productId: "599a195990401a4eee3f023b",
            variantId: "2277d3ecfa728538325781f2",
            title: "Apple iPhone 16",
            variantName: "128GB",
            price: 19980000,
            costPrice: 14740000,
        },
        {
            productId: "599a195990401a4eee3f023b",
            variantId: "c4947b8907bf23d3857146d8",
            title: "Apple iPhone 16",
            variantName: "256GB",
            price: 21230000,
            costPrice: 14400000,
        },
        {
            productId: "601c5641575deebfe5eb909d",
            variantId: "86192c4e32dce8cad5132f02",
            title: "Apple iPhone 16 Plus",
            variantName: "128GB",
            price: 22480000,
            costPrice: 16560000,
        },
        {
            productId: "601c5641575deebfe5eb909d",
            variantId: "15c77122472dc5f4c79e7b48",
            title: "Apple iPhone 16 Plus",
            variantName: "256GB",
            price: 23730000,
            costPrice: 15480000,
        },
        {
            productId: "2c8431a64c985b353a5a7d76",
            variantId: "5099f4da968dfa4f36504072",
            title: "Apple iPhone 16 Pro",
            variantName: "128GB",
            price: 24980000,
            costPrice: 18180000,
        },
        {
            productId: "2c8431a64c985b353a5a7d76",
            variantId: "6e2eac4e9a2ab2cca986eeab",
            title: "Apple iPhone 16 Pro",
            variantName: "256GB",
            price: 26230000,
            costPrice: 19240000,
        },
        {
            productId: "bd94d6dcad667f4c0dc30d04",
            variantId: "558c2f24b13c2ff16274c06c",
            title: "Apple iPhone 16 Pro Max",
            variantName: "128GB",
            price: 27480000,
            costPrice: 20060000,
        },
        {
            productId: "bd94d6dcad667f4c0dc30d04",
            variantId: "85519203559b9ce3c0b9e8a4",
            title: "Apple iPhone 16 Pro Max",
            variantName: "256GB",
            price: 29980000,
            costPrice: 21040000,
        },
        {
            productId: "d451902130ab16b20aa19ccd",
            variantId: "809e297d0d2a215bed442945",
            title: "Apple iPhone 15",
            variantName: "128GB",
            price: 19980000,
            costPrice: 14220000,
        },
        {
            productId: "d451902130ab16b20aa19ccd",
            variantId: "21dc74ad71b1ab11af6cc54d",
            title: "Apple iPhone 15",
            variantName: "256GB",
            price: 21230000,
            costPrice: 14200000,
        },
        {
            productId: "18a495b662044798183b095f",
            variantId: "9272f40763020524734c8888",
            title: "Apple iPhone 15 Pro",
            variantName: "128GB",
            price: 27480000,
            costPrice: 18960000,
        },
        {
            productId: "18a495b662044798183b095f",
            variantId: "269ff5002b35162da25a9d82",
            title: "Apple iPhone 15 Pro",
            variantName: "256GB",
            price: 29980000,
            costPrice: 21440000,
        },
        {
            productId: "68abc5cffe233b72a93e1a65",
            variantId: "aaeae76d57dcee13aede3384",
            title: "Apple iPhone 15 Pro Max",
            variantName: "256GB",
            price: 32480000,
            costPrice: 21290000,
        },
        {
            productId: "00a26902c56778113c4a0751",
            variantId: "6c90719b03bfcbd8f126401a",
            title: "Apple iPhone 14 Pro",
            variantName: "128GB",
            price: 27480000,
            costPrice: 19870000,
        },
        {
            productId: "7c2682ed52750acbd2841764",
            variantId: "44e660cf6dbd51cb9abdacd1",
            title: "Apple iPhone 11",
            variantName: "64GB",
            price: 17480000,
            costPrice: 13080000,
        },
        {
            productId: "cf052177c9204a048c025986",
            variantId: "3ad222fb0d967318b5f1ec61",
            title: "Apple iPad Pro 11-inch",
            variantName: "128GB",
            price: 19980000,
            costPrice: 13090000,
        },
        {
            productId: "cf052177c9204a048c025986",
            variantId: "9e93d1114bb2180ca0bb5de3",
            title: "Apple iPad Pro 11-inch",
            variantName: "256GB",
            price: 22480000,
            costPrice: 15710000,
        },
        {
            productId: "3b818fad6c567d285fddfe1a",
            variantId: "d21a1e4fc641c2001694f312",
            title: "Samsung Galaxy S22+",
            variantName: "128GB",
            price: 19980000,
            costPrice: 13540000,
        },
        {
            productId: "3b818fad6c567d285fddfe1a",
            variantId: "834e1a86621e4e40212f15a0",
            title: "Samsung Galaxy S22+",
            variantName: "256GB",
            price: 22480000,
            costPrice: 14680000,
        },
        {
            productId: "1806900b540a753fefe2a7c7",
            variantId: "5e2fd27ef678b3bacc93daac",
            title: "Samsung Galaxy A04",
            variantName: "64GB",
            price: 4980000,
            costPrice: 3680000,
        },
        {
            productId: "1806900b540a753fefe2a7c7",
            variantId: "a8f044cace377266432a449f",
            title: "Samsung Galaxy A04",
            variantName: "128GB",
            price: 6230000,
            costPrice: 4210000,
        },
        {
            productId: "0079fe72ee53714b29b36ad3",
            variantId: "ea3900bddbe3100be6f8e5d8",
            title: "OnePlus 9 Pro",
            variantName: "256GB",
            price: 17480000,
            costPrice: 12320000,
        },
        {
            productId: "233c0d080a5e0628f1cb28e2",
            variantId: "5ad569fc1bb9f84e23388438",
            title: "Oppo Find N3",
            variantName: "512GB",
            price: 34980000,
            costPrice: 23650000,
        },
    ];

    const customers = [
        {
            userId: "70c05d3afe3d361d23e5713a",
            userName: "Nguyễn Văn An",
            numberPhone: "0945000001",
            toAddress: "15 Trần Hưng Đạo, Q. Hoàn Kiếm, Hà Nội",
        },
        {
            userId: "bcb0bcc8aecab6db39acb5af",
            userName: "Trần Thị Bích",
            numberPhone: "0945000002",
            toAddress: "78 Lò Đúc, Q. Hai Bà Trưng, Hà Nội",
        },
        {
            userId: "c6f08178fc0eeeb9ed356aad",
            userName: "Lê Văn Cường",
            numberPhone: "0945000003",
            toAddress: "45 Hoàng Hoa Thám, Q. Ba Đình, Hà Nội",
        },
        {
            userId: "c16df0152b0c8d0304b28ee5",
            userName: "Phạm Thị Diễm",
            numberPhone: "0945000004",
            toAddress: "120 Đê La Thành, Q. Đống Đa, Hà Nội",
        },
        {
            userId: "55ec13a110b1fec8616e3153",
            userName: "Hoàng Văn Em",
            numberPhone: "0945000005",
            toAddress: "300 Lạc Long Quân, Q. Tây Hồ, Hà Nội",
        },
    ];

    const branchIds = [
        "7370d15897ce9527f6334460",
        "8a000c98ba8e8866d64c5f6b",
        "4bd3d096c6d0c94b6333cdfb",
        "007b30895b28e6cfa86e5d61",
        "7bb93955dfa4cb2b5d1ca46f",
        "4e8c45f9e8d8c1738f97e7e8",
        "b1535794468a478872242f51",
        "4add55c8509acece7dec15cb",
        "4bb0ef5a36e2585b36066d89",
        "e218fabec8956151d776124b",
        "963eef8789b0be807cb88e11",
        "1b23add5a73dd240b68a5f8b",
    ];

    // Status weights: DELIVERED×5, SHIPPED×2, PROCESSING×1, ORDERED×1, CANCELLED×1
    const statusPool = [13, 13, 13, 13, 13, 12, 12, 11, 10, 14];

    // Date range: 2026-01-02 to 2026-04-14
    const startMs = new Date("2026-01-02T08:00:00+07:00").getTime();
    const endMs = new Date("2026-04-14T22:00:00+07:00").getTime();
    const span = endMs - startMs;

    // Deterministic "random" via LCG so the data is reproducible
    let seed = 42;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
        return seed / 0x7fffffff;
    };

    const records: any[] = [];

    for (let i = 0; i < 1500; i++) {
        const customer = customers[i % customers.length];
        const branch = branchIds[i % branchIds.length];
        const status = statusPool[i % statusPool.length];

        // 1–2 items per order
        const numItems = rand() < 0.3 ? 2 : 1;
        const listProduct: any[] = [];
        for (let j = 0; j < numItems; j++) {
            const entry = catalog[(i * 3 + j * 7) % catalog.length];
            const hasDiscount = rand() < 0.15;
            const discount = hasDiscount ? Math.round(entry.price * 0.05) : 0;
            listProduct.push({
                productId: entry.productId,
                variantId: entry.variantId,
                variantName: entry.variantName,
                image: "",
                title: entry.title,
                description: "",
                price: entry.price,
                costPrice: entry.costPrice,
                quantity: 1,
                discount,
                totalMoney: entry.price - discount,
            });
        }

        const sumPrice = listProduct.reduce((s, p) => s + p.totalMoney, 0);
        const createdAt = new Date(startMs + Math.floor(rand() * span));

        // Order statuses that correspond to a paid/completed payment:
        // DELIVERED(13), SHIPPING(12), PROCESSING(11) → PAID
        // ORDERED(10) → PENDING
        // CANCELLED(14) → CANCELLED payment
        const isCancelled = status === 14;
        const paymentStatus = isCancelled ? 27 : status === 10 ? 21 : 23; // 27=CANCELLED, 21=PENDING, 23=PAID
        const deliveryPool = ["STANDARD", "EXPRESS", "PICKUP"];
        const delivery = deliveryPool[i % deliveryPool.length];
        const methodPool = ["cod", "momo", "stripe"];
        const method = methodPool[(i * 7) % methodPool.length];

        records.push({
            listProduct,
            userId: customer.userId,
            sumPrice,
            note: "",
            toAddress: customer.toAddress,
            userName: customer.userName,
            numberPhone: customer.numberPhone,
            statusOrder: status,
            branchId: branch,
            createdAt,
            updatedAt: createdAt,
            _paymentMeta: {
                userId: customer.userId,
                totalMoney: sumPrice,
                status: paymentStatus,
                delivery,
                method,
                createdAt,
            },
        });
    }

    return records;
}

// ─── Payroll generator (BH + Thuế TNCN Việt Nam 2024-2026) ──────────────────
function buildPayrollRecords() {
    const INSURANCE_CAP = 46_800_000; // 20 × lương cơ sở 2.34tr
    const EMP_INS_RATE = 0.105; // NLĐ: BHXH 8% + BHYT 1.5% + BHTN 1%
    const ER_INS_RATE = 0.215; // NSDLĐ: BHXH 17.5% + BHYT 3% + BHTN 1%
    const PERSONAL_DED = 11_000_000; // Giảm trừ bản thân
    const DEP_DED = 4_400_000; // Giảm trừ mỗi người phụ thuộc

    const calcIns = (gross: number) => {
        const base = Math.min(gross, INSURANCE_CAP);
        return {
            insuranceBase: base,
            employeeInsurance: Math.round(base * EMP_INS_RATE),
            employerInsurance: Math.round(base * ER_INS_RATE),
        };
    };

    const calcPIT = (taxable: number): number => {
        if (taxable <= 0) return 0;
        const brackets: [number, number][] = [
            [5_000_000, 0.05],
            [5_000_000, 0.1],
            [8_000_000, 0.15],
            [14_000_000, 0.2],
            [20_000_000, 0.25],
            [28_000_000, 0.3],
            [Infinity, 0.35],
        ];
        let tax = 0,
            rem = taxable;
        for (const [lim, rate] of brackets) {
            if (rem <= 0) break;
            const t = lim === Infinity ? rem : Math.min(rem, lim);
            tax += t * rate;
            rem -= t;
        }
        return Math.round(tax);
    };

    // [empId, branchId, baseSalary, allowances, dependants]
    type EmpRow = [string, string, number, number, number];
    const employees: EmpRow[] = [
        [
            "7ee778226d4a12b53b7802b2",
            "7370d15897ce9527f6334460",
            18000000,
            500000,
            2,
        ],
        [
            "3bd34499ccfa01ec65d75439",
            "b1535794468a478872242f51",
            18000000,
            500000,
            2,
        ],
        [
            "497b1921cb00b69a1e0273ca",
            "e218fabec8956151d776124b",
            18000000,
            500000,
            1,
        ],
        [
            "fd5117dfc6c86692f172134a",
            "963eef8789b0be807cb88e11",
            18000000,
            500000,
            1,
        ],
        [
            "a4bf5a0a09b539d3915b8abd",
            "8a000c98ba8e8866d64c5f6b",
            10000000,
            300000,
            1,
        ],
        [
            "95306fbe83a4c67e68a2c634",
            "b1535794468a478872242f51",
            10000000,
            300000,
            0,
        ],
        [
            "6a847728212e485140d94838",
            "e218fabec8956151d776124b",
            10000000,
            300000,
            0,
        ],
        [
            "1b14f456a68c570207b35ec3",
            "1b23add5a73dd240b68a5f8b",
            10000000,
            300000,
            1,
        ],
        [
            "517c2d342e06f9902ab76af9",
            "963eef8789b0be807cb88e11",
            10000000,
            300000,
            0,
        ],
        [
            "49c98d1638e31b72aacb8d80",
            "7370d15897ce9527f6334460",
            9000000,
            300000,
            0,
        ],
        [
            "d9c90bd45165bd92ebb49490",
            "4bd3d096c6d0c94b6333cdfb",
            9000000,
            300000,
            1,
        ],
        [
            "b8dd7f7bd936648871fbe052",
            "007b30895b28e6cfa86e5d61",
            9000000,
            300000,
            0,
        ],
        [
            "bd923128c73ce1e71deefac6",
            "4e8c45f9e8d8c1738f97e7e8",
            9000000,
            300000,
            0,
        ],
        [
            "208e0c604e431ba385aa4efa",
            "4add55c8509acece7dec15cb",
            9000000,
            300000,
            2,
        ],
        [
            "ba1529a0f5e240323b22d06d",
            "4bb0ef5a36e2585b36066d89",
            9000000,
            300000,
            1,
        ],
        [
            "0359492ef975eb065d023e2b",
            "169a65fa5062af2ca064eaf4",
            9000000,
            300000,
            0,
        ],
        [
            "a51240de2eb87a3856ed72d4",
            "9fc20d0aa4dd596d4884d9f0",
            9000000,
            300000,
            0,
        ],
        [
            "a3d41ec66ee4ee5b13ebd9bc",
            "7bb93955dfa4cb2b5d1ca46f",
            11000000,
            300000,
            1,
        ],
    ];

    const workDays: Record<number, number[]> = {
        1: [
            2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23,
            24, 26, 27, 28, 29, 30, 31,
        ],
        2: [
            2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23,
            24, 25, 26, 27, 28,
        ],
        3: [
            2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 23,
            24, 25, 26, 27, 28, 30, 31,
        ],
    };

    const specials: Record<string, AttendanceStatus> = {
        "0_1_9": AttendanceStatus.LATE,
        "0_2_16": AttendanceStatus.LATE,
        "0_3_16": AttendanceStatus.LATE,
        "2_1_14": AttendanceStatus.LATE,
        "2_2_11": AttendanceStatus.LATE,
        "4_1_7": AttendanceStatus.LATE,
        "4_1_23": AttendanceStatus.LATE,
        "4_3_9": AttendanceStatus.LATE,
        "9_1_20": AttendanceStatus.LATE,
        "9_2_14": AttendanceStatus.LATE,
        "13_1_17": AttendanceStatus.LATE,
        "13_3_10": AttendanceStatus.LATE,
        "17_2_18": AttendanceStatus.LATE,
        "17_3_25": AttendanceStatus.LATE,
        "1_2_10": AttendanceStatus.LEAVE,
        "1_2_17": AttendanceStatus.LEAVE,
        "3_2_23": AttendanceStatus.LEAVE,
        "3_2_24": AttendanceStatus.LEAVE,
        "8_3_18": AttendanceStatus.LEAVE,
        "14_1_26": AttendanceStatus.LEAVE,
        "15_2_25": AttendanceStatus.LEAVE,
        "15_2_26": AttendanceStatus.LEAVE,
        "6_1_28": AttendanceStatus.HALF_DAY,
        "6_2_5": AttendanceStatus.HALF_DAY,
        "7_3_4": AttendanceStatus.HALF_DAY,
        "11_1_15": AttendanceStatus.HALF_DAY,
        "11_3_21": AttendanceStatus.HALF_DAY,
        "16_1_29": AttendanceStatus.HALF_DAY,
        "5_2_19": AttendanceStatus.ABSENT,
        "5_3_5": AttendanceStatus.ABSENT,
        "10_2_21": AttendanceStatus.ABSENT,
        "12_1_22": AttendanceStatus.ABSENT,
        "12_3_14": AttendanceStatus.ABSENT,
    };

    const ADMIN_ID = "4431ab2682c8792f16513233";
    const stdDays = 26;

    // Month-3 status pattern (matches original seed data)
    const m3Status: Record<number, string> = {
        0: "CONFIRMED",
        1: "CONFIRMED",
        2: "CONFIRMED",
        3: "CONFIRMED",
        4: "CONFIRMED",
        5: "DRAFT",
        6: "DRAFT",
        7: "CONFIRMED",
        8: "DRAFT",
        9: "CONFIRMED",
        10: "DRAFT",
        11: "DRAFT",
        12: "CONFIRMED",
        13: "CONFIRMED",
        14: "DRAFT",
        15: "DRAFT",
        16: "CONFIRMED",
        17: "CONFIRMED",
    };

    const idPrefixes: Record<number, string> = { 1: "1a", 2: "2a", 3: "3a" };
    const idSuffixes = [
        "b00001",
        "b00002",
        "b00003",
        "b00004",
        "b00005",
        "b00006",
        "b00007",
        "b00008",
        "b00009",
        "b0000a",
        "b0000b",
        "b0000c",
        "b0000d",
        "b0000e",
        "b0000f",
        "b00010",
        "b00011",
        "b00012",
    ];

    const records: any[] = [];

    for (const month of [1, 2, 3]) {
        for (let ei = 0; ei < employees.length; ei++) {
            const [empId, branchId, baseSalary, allowances, dependants] =
                employees[ei];
            let workingDays = 0,
                leaveDays = 0,
                deductions = 0;

            for (const day of workDays[month]) {
                const s =
                    specials[`${ei}_${month}_${day}`] ??
                    AttendanceStatus.PRESENT;
                if (s === AttendanceStatus.PRESENT) workingDays++;
                else if (s === AttendanceStatus.LATE) {
                    workingDays++;
                    deductions += 50_000;
                } else if (s === AttendanceStatus.HALF_DAY) workingDays += 0.5;
                else if (s === AttendanceStatus.LEAVE) leaveDays++;
                // ABSENT: không tính ngày công
            }

            const paidDays = workingDays + leaveDays;
            const grossSalary = Math.max(
                0,
                Math.round((baseSalary * paidDays) / stdDays) +
                    allowances -
                    deductions
            );
            const { insuranceBase, employeeInsurance, employerInsurance } =
                calcIns(grossSalary);
            const taxableIncome = Math.max(
                0,
                grossSalary -
                    employeeInsurance -
                    PERSONAL_DED -
                    dependants * DEP_DED
            );
            const personalIncomeTax = calcPIT(taxableIncome);
            const actualSalary = Math.max(
                0,
                grossSalary - employeeInsurance - personalIncomeTax
            );

            const status = month < 3 ? "PAID" : m3Status[ei];
            const confirmedBy = status !== "DRAFT" ? ADMIN_ID : undefined;

            const rec: any = {
                _id: `${idPrefixes[month]}0000000000000000${idSuffixes[ei]}`,
                employeeId: empId,
                branchId,
                month,
                year: 2026,
                standardDays: stdDays,
                workingDays,
                leaveDays,
                baseSalary,
                allowances,
                deductions,
                grossSalary,
                dependants,
                insuranceBase,
                employeeInsurance,
                employerInsurance,
                taxableIncome,
                personalIncomeTax,
                actualSalary,
                status,
            };
            if (confirmedBy) rec.confirmedBy = confirmedBy;
            records.push(rec);
        }
    }

    return records;
}

async function main() {
    try {
        await connectDatabase();
        console.log("=== BẮT ĐẦU IMPORT DỮ LIỆU ===\n");

        // 1. Categories
        console.log("1. Xoá & import Categories...");
        await CategoryModel.deleteMany({});
        const categories = loadJSON("categories.json");
        await CategoryModel.insertMany(categories);
        console.log(`   ✅ Đã import ${categories.length} categories\n`);

        // 2. Products
        console.log("2. Xoá & import Products...");
        await ProductModel.deleteMany({});
        const products = loadJSON("products.json");
        await ProductModel.insertMany(products);
        console.log(`   ✅ Đã import ${products.length} products\n`);

        // 3. Suppliers
        console.log("3. Xoá & import Suppliers...");
        await SupplierModel.deleteMany({});
        const suppliers = loadJSON("suppliers.json");
        await SupplierModel.insertMany(suppliers);
        console.log(`   ✅ Đã import ${suppliers.length} suppliers\n`);

        // 4. Users
        console.log("4. Xoá & import Users...");
        await UserModel.deleteMany({});
        const users = loadJSON("users.json");
        await UserModel.insertMany(users);
        console.log(`   ✅ Đã import ${users.length} users\n`);

        // 5. Branches
        console.log("5. Xoá & import Branches...");
        await BranchModel.deleteMany({});
        const branches = loadJSON("branches.json");
        await BranchModel.insertMany(branches);
        console.log(`   ✅ Đã import ${branches.length} branches\n`);

        // 6. Branch Inventory (lớn ~55MB, insert theo batch)
        console.log("6. Xoá & import Branch Inventory (batch mode)...");
        await BranchInventoryModel.deleteMany({});
        const inventory = loadJSON("branch-inventory.json");
        const inventoryCount = await insertBatch(
            BranchInventoryModel,
            inventory,
            5000,
            "BranchInventory"
        );
        console.log(
            `   ✅ Đã import ${inventoryCount} branch inventory records\n`
        );

        // 7. Payroll (generated inline with BH + Thuế TNCN)
        console.log("7. Xoá & insert Payroll (generated – BH + Thuế TNCN)...");
        await PayrollModel.deleteMany({});
        const payrolls = buildPayrollRecords();
        await PayrollModel.insertMany(payrolls);
        console.log(`   ✅ Đã insert ${payrolls.length} payroll records\n`);

        // 8. Attendance (generated inline)
        console.log("8. Xoá & insert Attendance (generated)...");
        await AttendanceModel.deleteMany({});
        const attendanceRecords = buildAttendanceRecords();
        await insertBatch(
            AttendanceModel,
            attendanceRecords,
            500,
            "Attendance"
        );
        console.log(
            `   ✅ Đã insert ${attendanceRecords.length} attendance records\n`
        );

        // 9. Orders + Payments (generated inline)
        console.log("9. Xoá & insert Orders + Payments (generated)...");
        await OrderModel.deleteMany({});
        await PaymentModel.deleteMany({});
        const orderRecords = buildOrderRecords();
        // Strip _paymentMeta before inserting orders
        const ordersToInsert = orderRecords.map(
            ({ _paymentMeta: _, ...o }) => o
        );
        const insertedOrders = await OrderModel.insertMany(ordersToInsert, {
            ordered: true,
        });
        console.log(`   ✅ Đã insert ${insertedOrders.length} order records`);
        // Build payment records using the real _id from inserted orders
        const paymentsToInsert = insertedOrders.map(
            (order: any, idx: number) => {
                const meta = orderRecords[idx]._paymentMeta;
                return {
                    orderId: order._id,
                    userId: meta.userId,
                    totalMoney: meta.totalMoney,
                    discount: 0,
                    method: meta.method,
                    delivery: meta.delivery,
                    status: meta.status,
                    couponDiscount: 0,
                    memberDiscount: 0,
                    pointsEarned: 0,
                    pointsRedeemed: 0,
                    pointsDiscount: 0,
                    createdAt: meta.createdAt,
                    updatedAt: meta.createdAt,
                };
            }
        );
        await PaymentModel.insertMany(paymentsToInsert, { ordered: false });
        console.log(
            `   ✅ Đã insert ${paymentsToInsert.length} payment records\n`
        );

        console.log("=== THÀNH CÔNG: Đã import xong toàn bộ dữ liệu ===");
        process.exit(0);
    } catch (error) {
        console.error("❌ Lỗi import:", error);
        process.exit(1);
    }
}

main();
