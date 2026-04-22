/**
 * Migration: bổ sung grossSalary, dependants, insuranceBase,
 * employeeInsurance, employerInsurance, taxableIncome, personalIncomeTax
 * cho các bản ghi Payroll cũ còn thiếu các trường đó.
 *
 * Chạy: node tmp/migrate_payroll_insurance.js
 * (Đứng ở thư mục IT4997-BE, hoặc điều chỉnh DB_URL / DB_NAME bên dưới)
 */

const mongoose = require("mongoose");
require("dotenv").config();

const DB_URL = `mongodb://${process.env.IP_DB || "localhost"}:${process.env.PORT_DB || 27017}`;
const DB_NAME = process.env.DATABASE_NAME || "IT4409";

// ─── Hằng số BH & Thuế TNCN ──────────────────────────────────────────────────
const INSURANCE_SALARY_CAP    = 46_800_000;
const EMPLOYEE_INSURANCE_RATE = 0.105;  // NLĐ: BHXH 8% + BHYT 1.5% + BHTN 1%
const EMPLOYER_INSURANCE_RATE = 0.215;  // NSDLĐ: BHXH 17.5% + BHYT 3% + BHTN 1%
const PERSONAL_DEDUCTION      = 11_000_000;
const DEPENDENT_DEDUCTION     = 4_400_000;

function calcInsurance(grossSalary) {
  const base = Math.min(grossSalary, INSURANCE_SALARY_CAP);
  return {
    insuranceBase:      base,
    employeeInsurance:  Math.round(base * EMPLOYEE_INSURANCE_RATE),
    employerInsurance:  Math.round(base * EMPLOYER_INSURANCE_RATE),
  };
}

function calcPIT(taxableIncome) {
  if (taxableIncome <= 0) return 0;
  const brackets = [
    [5_000_000,  0.05],
    [5_000_000,  0.10],
    [8_000_000,  0.15],
    [14_000_000, 0.20],
    [20_000_000, 0.25],
    [28_000_000, 0.30],
    [Infinity,   0.35],
  ];
  let tax = 0, remaining = taxableIncome;
  for (const [limit, rate] of brackets) {
    if (remaining <= 0) break;
    const taxed = Math.min(remaining, limit);
    tax += taxed * rate;
    remaining -= taxed;
  }
  return Math.round(tax);
}

(async () => {
  try {
    await mongoose.connect(DB_URL, {
      dbName: DB_NAME,
      replicaSet: process.env.REPLICA_SET || "rs0",
      directConnection: true,
      ...(process.env.USER_DB ? {
        auth: { username: process.env.USER_DB, password: process.env.PASS_DB },
        authSource: process.env.AUTH_DATABASE || DB_NAME,
      } : {}),
    });
    console.log(`Connected to ${DB_URL}/${DB_NAME}`);

    const col = mongoose.connection.db.collection("payrolls");

    // Lấy các bản ghi thiếu ít nhất một trong các trường mới
    const docs = await col.find({
      $or: [
        { grossSalary:        { $exists: false } },
        { insuranceBase:      { $exists: false } },
        { employeeInsurance:  { $exists: false } },
        { employerInsurance:  { $exists: false } },
        { taxableIncome:      { $exists: false } },
        { personalIncomeTax:  { $exists: false } },
        { dependants:         { $exists: false } },
      ],
    }).toArray();

    console.log(`Found ${docs.length} payroll records to migrate`);
    if (docs.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    let updated = 0;
    for (const doc of docs) {
      // grossSalary = actualSalary cũ (chưa trừ BH/thuế)
      const grossSalary = doc.grossSalary ?? doc.actualSalary ?? 0;
      const dependants  = doc.dependants  ?? 0;

      const { insuranceBase, employeeInsurance, employerInsurance } =
        calcInsurance(grossSalary);

      const taxableIncome = Math.max(
        0,
        grossSalary - employeeInsurance - PERSONAL_DEDUCTION - dependants * DEPENDENT_DEDUCTION
      );
      const personalIncomeTax = calcPIT(taxableIncome);
      const actualSalary = Math.max(
        0,
        grossSalary - employeeInsurance - personalIncomeTax
      );

      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            grossSalary,
            dependants,
            insuranceBase,
            employeeInsurance,
            employerInsurance,
            taxableIncome,
            personalIncomeTax,
            actualSalary,
          },
        }
      );
      updated++;
    }

    console.log(`✅ Migrated ${updated} records successfully.`);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
