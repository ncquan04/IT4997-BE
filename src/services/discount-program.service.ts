import DiscountProgramModel from "../models/discount-program-model.mongo";
import { IDiscountProgram } from "../shared/models/discount-program-model";

class DiscountProgramService {
    async createProgram(
        data: Omit<IDiscountProgram, "_id">
    ): Promise<IDiscountProgram> {
        const program = await DiscountProgramModel.create(data);
        return program.toObject();
    }

    async getAllPrograms(): Promise<IDiscountProgram[]> {
        const programs = await DiscountProgramModel.find().sort({
            createdAt: -1,
        });
        return programs.map((p) => p.toObject());
    }

    async updateProgram(
        id: string,
        data: Partial<IDiscountProgram>
    ): Promise<IDiscountProgram | null> {
        const program = await DiscountProgramModel.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true,
        });
        return program ? program.toObject() : null;
    }

    async deleteProgram(id: string): Promise<boolean> {
        const result = await DiscountProgramModel.findByIdAndDelete(id);
        return !!result;
    }

    /** Fetch all currently active programs from DB (one query per request). */
    async getActivePrograms(): Promise<IDiscountProgram[]> {
        const now = Date.now();
        const docs = await DiscountProgramModel.find({
            isActive: true,
            startAt: { $lte: now },
            endAt: { $gte: now },
        }).lean<IDiscountProgram[]>();
        return docs;
    }

    /**
     * Pure in-memory computation — no DB call.
     * Priority: product > category > all.
     * Among same-scope matches, picks the program that gives the most discount.
     *
     * @returns effectivePrice after discount, or null if no program applies
     */
    computeEffectivePrice(
        productId: string,
        categoryId: string,
        price: number,
        programs: IDiscountProgram[]
    ): number | null {
        if (programs.length === 0) return null;

        const byScope: Record<string, IDiscountProgram[]> = {
            product: [],
            category: [],
            all: [],
        };

        for (const prog of programs) {
            if (
                prog.scope === "product" &&
                prog.applicableIds.includes(productId)
            ) {
                byScope.product.push(prog);
            } else if (
                prog.scope === "category" &&
                prog.applicableIds.includes(categoryId)
            ) {
                byScope.category.push(prog);
            } else if (prog.scope === "all") {
                byScope.all.push(prog);
            }
        }

        const candidates =
            byScope.product.length > 0
                ? byScope.product
                : byScope.category.length > 0
                  ? byScope.category
                  : byScope.all;

        if (candidates.length === 0) return null;

        let bestPrice = price;
        for (const prog of candidates) {
            let discounted: number;
            if (prog.type === "percent") {
                const rawDiscount = (price * prog.value) / 100;
                const cappedDiscount =
                    prog.maxDiscount > 0
                        ? Math.min(rawDiscount, prog.maxDiscount)
                        : rawDiscount;
                discounted = price - cappedDiscount;
            } else {
                discounted = price - prog.value;
            }
            discounted = Math.max(0, discounted);
            if (discounted < bestPrice) bestPrice = discounted;
        }

        return bestPrice === price ? null : bestPrice;
    }

    /** Convenience: fetch active programs then compute (for one-off calls). */
    async getEffectivePrice(
        productId: string,
        categoryId: string,
        price: number
    ): Promise<number | null> {
        const programs = await this.getActivePrograms();
        return this.computeEffectivePrice(
            productId,
            categoryId,
            price,
            programs
        );
    }
}

export default new DiscountProgramService();
