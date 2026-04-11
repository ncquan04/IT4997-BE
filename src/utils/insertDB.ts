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
import { AttendanceStatus } from "../shared/models/attendance-model";

const DATA_DIR = resolve(__dirname, "../../data");

function loadJSON(fileName: string) {
    const filePath = resolve(DATA_DIR, fileName);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}

async function insertBatch(model: any, data: any[], batchSize: number, label: string) {
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
        ['7ee778226d4a12b53b7802b2', '7370d15897ce9527f6334460'],
        ['3bd34499ccfa01ec65d75439', 'b1535794468a478872242f51'],
        ['497b1921cb00b69a1e0273ca', 'e218fabec8956151d776124b'],
        ['fd5117dfc6c86692f172134a', '963eef8789b0be807cb88e11'],
        ['a4bf5a0a09b539d3915b8abd', '8a000c98ba8e8866d64c5f6b'],
        ['95306fbe83a4c67e68a2c634', 'b1535794468a478872242f51'],
        ['6a847728212e485140d94838', 'e218fabec8956151d776124b'],
        ['1b14f456a68c570207b35ec3', '1b23add5a73dd240b68a5f8b'],
        ['517c2d342e06f9902ab76af9', '963eef8789b0be807cb88e11'],
        ['49c98d1638e31b72aacb8d80', '7370d15897ce9527f6334460'],
        ['d9c90bd45165bd92ebb49490', '4bd3d096c6d0c94b6333cdfb'],
        ['b8dd7f7bd936648871fbe052', '007b30895b28e6cfa86e5d61'],
        ['bd923128c73ce1e71deefac6', '4e8c45f9e8d8c1738f97e7e8'],
        ['208e0c604e431ba385aa4efa', '4add55c8509acece7dec15cb'],
        ['ba1529a0f5e240323b22d06d', '4bb0ef5a36e2585b36066d89'],
        ['0359492ef975eb065d023e2b', '169a65fa5062af2ca064eaf4'],
        ['a51240de2eb87a3856ed72d4', '9fc20d0aa4dd596d4884d9f0'],
        ['a3d41ec66ee4ee5b13ebd9bc', '7bb93955dfa4cb2b5d1ca46f'],
    ];

    // Working days (Mon–Sat, skip public holidays)
    const workDays: Record<number, number[]> = {
        1: [2,3,5,6,7,8,9,10,12,13,14,15,16,17,19,20,21,22,23,24,26,27,28,29,30,31], // Jan: skip Jan 1
        2: [2,3,4,5,6,7,9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28],        // Feb
        3: [2,3,4,5,6,7,9,10,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28,30,31],  // Mar
    };

    // Special statuses: 'empIndex_month_day' → status
    // Covers all 5 statuses across employees & months
    const specials: Record<string, AttendanceStatus> = {
        // LATE – phạt 50k/lần
        '0_1_9': AttendanceStatus.LATE,   '0_2_16': AttendanceStatus.LATE,   '0_3_16': AttendanceStatus.LATE,
        '2_1_14': AttendanceStatus.LATE,  '2_2_11': AttendanceStatus.LATE,
        '4_1_7':  AttendanceStatus.LATE,  '4_1_23': AttendanceStatus.LATE,   '4_3_9':  AttendanceStatus.LATE,
        '9_1_20': AttendanceStatus.LATE,  '9_2_14': AttendanceStatus.LATE,
        '13_1_17':AttendanceStatus.LATE,  '13_3_10':AttendanceStatus.LATE,
        '17_2_18':AttendanceStatus.LATE,  '17_3_25':AttendanceStatus.LATE,
        // LEAVE – nghỉ phép có lương
        '1_2_10': AttendanceStatus.LEAVE, '1_2_17': AttendanceStatus.LEAVE,
        '3_2_23': AttendanceStatus.LEAVE, '3_2_24': AttendanceStatus.LEAVE,
        '8_3_18': AttendanceStatus.LEAVE,
        '14_1_26':AttendanceStatus.LEAVE,
        '15_2_25':AttendanceStatus.LEAVE, '15_2_26':AttendanceStatus.LEAVE,
        // HALF_DAY – nửa ngày
        '6_1_28': AttendanceStatus.HALF_DAY, '6_2_5':  AttendanceStatus.HALF_DAY,
        '7_3_4':  AttendanceStatus.HALF_DAY,
        '11_1_15':AttendanceStatus.HALF_DAY, '11_3_21':AttendanceStatus.HALF_DAY,
        '16_1_29':AttendanceStatus.HALF_DAY,
        // ABSENT – vắng không phép
        '5_2_19': AttendanceStatus.ABSENT, '5_3_5':  AttendanceStatus.ABSENT,
        '10_2_21':AttendanceStatus.ABSENT,
        '12_1_22':AttendanceStatus.ABSENT, '12_3_14':AttendanceStatus.ABSENT,
    };

    const records: any[] = [];

    for (let ei = 0; ei < employees.length; ei++) {
        const [empId, branchId] = employees[ei];
        for (const month of [1, 2, 3]) {
            for (const day of workDays[month]) {
                const key = `${ei}_${month}_${day}`;
                const status: AttendanceStatus = (specials[key] as AttendanceStatus) ?? AttendanceStatus.PRESENT;
                const date = `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const rec: any = { employeeId: empId, branchId, date, status };

                if (status === AttendanceStatus.PRESENT) {
                    rec.checkInTime  = new Date(`${date}T08:30:00+07:00`).getTime();
                    rec.checkOutTime = new Date(`${date}T17:30:00+07:00`).getTime();
                    rec.workingHours = 9;
                } else if (status === AttendanceStatus.LATE) {
                    rec.checkInTime  = new Date(`${date}T09:30:00+07:00`).getTime();
                    rec.checkOutTime = new Date(`${date}T17:30:00+07:00`).getTime();
                    rec.workingHours = 8;
                    rec.note = 'Late check-in';
                } else if (status === AttendanceStatus.HALF_DAY) {
                    rec.checkInTime  = new Date(`${date}T08:30:00+07:00`).getTime();
                    rec.checkOutTime = new Date(`${date}T12:30:00+07:00`).getTime();
                    rec.workingHours = 4;
                    rec.note = 'Half day';
                } else if (status === AttendanceStatus.LEAVE) {
                    rec.workingHours = 0;
                    rec.note = 'Approved leave';
                } else if (status === AttendanceStatus.ABSENT) {
                    rec.note = 'Absent without notice';
                }

                records.push(rec);
            }
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
        const inventoryCount = await insertBatch(BranchInventoryModel, inventory, 5000, "BranchInventory");
        console.log(`   ✅ Đã import ${inventoryCount} branch inventory records\n`);

        // 7. Payroll
        console.log("7. Xoá & import Payroll...");
        await PayrollModel.deleteMany({});
        const payrolls = loadJSON("payroll.json");
        await PayrollModel.insertMany(payrolls);
        console.log(`   ✅ Đã import ${payrolls.length} payroll records\n`);

        // 8. Attendance (generated inline)
        console.log("8. Xoá & insert Attendance (generated)...");
        await AttendanceModel.deleteMany({});
        const attendanceRecords = buildAttendanceRecords();
        await insertBatch(AttendanceModel, attendanceRecords, 500, "Attendance");
        console.log(`   ✅ Đã insert ${attendanceRecords.length} attendance records\n`);

        console.log("=== THÀNH CÔNG: Đã import xong toàn bộ dữ liệu ===");
        process.exit(0);
    } catch (error) {
        console.error("❌ Lỗi import:", error);
        process.exit(1);
    }
}

main();
