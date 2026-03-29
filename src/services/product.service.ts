import { Request, Response } from "express";
import mongoose from "mongoose";
import CategoryModel from "../models/category-model.mongo";
import ProductModel from "../models/product-model.mongo";
import BranchInventoryModel from "../models/branch-inventory-model.mongo";
import { Contacts } from "../shared/contacts";
import { IProduct, IProductVariant } from "../shared/models/product-model";
import { UserRole } from "../shared/models/user-model";
import { getArray, setArray, deleteKeysByPattern } from "../cache/redisUtils";
import { notificationService } from "./notification.service";
import { getCategoryAndDescendantIds } from "../utils/category-tree";
import { ElasticSearch } from "../../elasticsearch/elastic.client";
import discountProgramService from "./discount-program.service";
import { IDiscountProgram } from "../shared/models/discount-program-model";

const STATUS_EVALUATION = Contacts.Status.Evaluation;
const LIMIT = 20;
const PRODUCT_ELASTIC_INDEX = "products";

interface AuthenticatedUser {
    id: string;
    role: UserRole;
    email: string;
}

type RequestWithUser = Request & {
    user?: AuthenticatedUser;
};

type ProductListQuery = {
    page?: string;
    sort?: string;
    idCategory?: string;
    minPrice?: string;
    maxPrice?: string;
};

type ProductListOptions = {
    includeHidden: boolean;
};

type ProductWithComputedPrice = IProduct & {
    computedPrice: number | null;
};

interface MongoDuplicateKeyError {
    keyPattern?: Record<string, number>;
    message?: string;
}

const isMongoDuplicateSkuError = (
    error: unknown
): error is MongoDuplicateKeyError => {
    if (!error || typeof error !== "object") {
        return false;
    }

    const maybeError = error as MongoDuplicateKeyError;
    return !!maybeError.keyPattern && "variants.sku" in maybeError.keyPattern;
};

const getVariantEffectivePrice = (variant: IProductVariant): number =>
    variant.salePrice ?? variant.price;

const getProductEffectivePrice = (product: IProduct): number | null => {
    if (!product.variants || product.variants.length === 0) {
        return null;
    }

    return product.variants.reduce<number | null>((minPrice, variant) => {
        const price = getVariantEffectivePrice(variant);
        if (minPrice === null) {
            return price;
        }
        return Math.min(minPrice, price);
    }, null);
};

/**
 * Enrich each variant of a product list with `effectiveDiscountPrice`
 * based on currently active discount programs (single DB query for all programs).
 */
const enrichProductsWithDiscounts = (
    products: IProduct[],
    programs: IDiscountProgram[]
): IProduct[] => {
    if (programs.length === 0) return products;
    return products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => {
            const effectiveDiscountPrice =
                discountProgramService.computeEffectivePrice(
                    String((product as any)._id),
                    String(product.categoryId),
                    variant.price,
                    programs
                );
            if (effectiveDiscountPrice === null) return variant;
            return { ...variant, effectiveDiscountPrice };
        }),
    }));
};

const getAuthenticatedUser = (req: Request): AuthenticatedUser | null => {
    const requestWithUser = req as RequestWithUser;
    if (!requestWithUser.user) {
        return null;
    }
    return requestWithUser.user;
};

const syncProductToElastic = async (product: unknown) => {
    try {
        const normalized = JSON.parse(JSON.stringify(product)) as Record<
            string,
            unknown
        >;
        const id = normalized._id ? String(normalized._id) : "";
        if (!id) {
            return;
        }

        const { _id, ...document } = normalized;
        document.isHide = Number(document.isHide ?? STATUS_EVALUATION.HIDE);

        await ElasticSearch.updateDoc(PRODUCT_ELASTIC_INDEX, id, document);
    } catch (error) {
        // Sync failure should not block core product APIs.
        console.error("Failed to sync product to Elasticsearch", error);
    }
};

export const addProduct = async (req: Request, res: Response) => {
    try {
        const user = getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        const userId = user.id;
        const {
            title,
            brand,
            description,
            descriptionDetail,
            specifications,
            variants,
            categoryId,
            isHide,
            rating,
        } = req.body;

        const category = await CategoryModel.findById(categoryId);
        if (!category) {
            return res.status(400).json({
                success: false,
                message: "Category does not exist",
            });
        }
        // 3. Tạo một instance mới của ProductModel
        const newProduct = new ProductModel({
            title,
            brand,
            description,
            descriptionDetail,
            specifications,
            variants,
            categoryId,
            isHide,
            rating,
        });

        // 4. Lưu vào database
        const savedProduct = await newProduct.save();

        await deleteKeysByPattern("products:base_mapped:*");
        await syncProductToElastic(savedProduct.toObject());

        notificationService.pushNotification(
            "PRODUCT",
            "Product created",
            `ProductId #${savedProduct._id.toString()} created successfully`,
            savedProduct._id.toString(),
            userId
        );

        return res.status(201).json({
            success: true,
            message: "Add product successfully",
            data: savedProduct,
        });
    } catch (error: unknown) {
        if (isMongoDuplicateSkuError(error)) {
            return res.status(409).json({
                // 409 Conflict
                success: false,
                message: "SKU already exists in another product variant.",
            });
        }

        const errorMessage =
            error instanceof Error ? error.message : "Internal Server Error";
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: errorMessage,
        });
    }
};

export const getAllProducts = async (req: Request, res: Response) => {
    return getAllProductsByScope(req, res, { includeHidden: false });
};

export const getAllProductsAdmin = async (req: Request, res: Response) => {
    return getAllProductsByScope(req, res, { includeHidden: true });
};

const getAllProductsByScope = async (
    req: Request,
    res: Response,
    options: ProductListOptions
) => {
    try {
        const query = req.query as ProductListQuery;
        const { page, sort, idCategory, minPrice, maxPrice } = query;
        const idCategoryValue = idCategory;
        if (page && isNaN(Number(page))) {
            return res.status(400).json({ message: "Invalid page number" });
        }
        if (idCategoryValue && !mongoose.isValidObjectId(idCategoryValue)) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        let limitNum = LIMIT;
        const pageNum = Math.max(Number(page) || 1, 1);
        const skip = (Number(pageNum) - 1) * Number(limitNum);

        const visibilityScope = options.includeHidden ? "all_status" : "public";
        const cacheKey = `products:base_mapped:${visibilityScope}:${idCategoryValue || "all"}:sort:${
            sort || "default"
        }`;
        let processProduct = await getArray<ProductWithComputedPrice>(cacheKey);

        if (!processProduct) {
            const filter: { isHide?: number; categoryId?: { $in: string[] } } =
                {};
            if (!options.includeHidden) {
                filter.isHide = STATUS_EVALUATION.PUBLIC;
            }
            if (idCategoryValue) {
                const categoryIds = await getCategoryAndDescendantIds(
                    idCategoryValue.toString()
                );
                filter.categoryId = { $in: categoryIds };
            }

            const products = await ProductModel.find(filter).lean<IProduct[]>();

            processProduct = products.map((product) => ({
                ...product,
                computedPrice: getProductEffectivePrice(product),
            }));

            if (sort === Contacts.Sort.PRICE_ASC) {
                processProduct.sort(
                    (a, b) => (a.computedPrice ?? 0) - (b.computedPrice ?? 0)
                );
            } else if (sort === Contacts.Sort.PRICE_DESC) {
                processProduct.sort(
                    (a, b) => (b.computedPrice ?? 0) - (a.computedPrice ?? 0)
                );
            }
            await setArray<ProductWithComputedPrice>(
                cacheKey,
                processProduct,
                3600
            );
        } else {
            console.log("CACHE HIT - products base mapped");
        }

        if (minPrice) {
            processProduct = processProduct.filter(
                (p) =>
                    p.computedPrice !== null &&
                    p.computedPrice >= Number(minPrice)
            );
        }
        if (maxPrice) {
            processProduct = processProduct.filter(
                (p) =>
                    p.computedPrice !== null &&
                    p.computedPrice <= Number(maxPrice)
            );
        }

        const total = processProduct.length;
        const pageSlice = processProduct
            .slice(skip, skip + limitNum)
            .map(({ computedPrice, ...product }) => product);

        const programs = await discountProgramService.getActivePrograms();
        const pageData = enrichProductsWithDiscounts(pageSlice, programs);

        res.status(200).json({
            data: pageData,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch products", error });
    }
};

export const getProductById = async (req: Request, res: Response) => {
    try {
        const productId = req.params.id;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }
        const product = await ProductModel.findOne({
            _id: productId,
            isHide: STATUS_EVALUATION.PUBLIC,
        }).lean();

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const programs = await discountProgramService.getActivePrograms();
        const [enriched] = enrichProductsWithDiscounts(
            [product as unknown as IProduct],
            programs
        );

        res.status(200).json(enriched);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch product", error });
    }
};

export const getProductAvailability = async (req: Request, res: Response) => {
    try {
        const productId = String(req.params.id);
        const { variantId } = req.query;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }

        if (
            typeof variantId !== "string" ||
            !mongoose.isValidObjectId(variantId)
        ) {
            return res.status(400).json({ message: "Invalid variant id" });
        }

        const productExists = await ProductModel.exists({ _id: productId });
        if (!productExists) {
            return res.status(404).json({ message: "Product not found" });
        }

        const branches = await BranchInventoryModel.aggregate([
            {
                $match: {
                    productId: new mongoose.Types.ObjectId(productId),
                    variantId: new mongoose.Types.ObjectId(variantId),
                    quantity: { $gt: 0 },
                },
            },
            {
                $lookup: {
                    from: "branches",
                    localField: "branchId",
                    foreignField: "_id",
                    as: "branch",
                },
            },
            {
                $addFields: {
                    branch: { $arrayElemAt: ["$branch", 0] },
                },
            },
            {
                $match: {
                    "branch.isActive": true,
                },
            },
            {
                $project: {
                    _id: 0,
                    branchId: "$branch._id",
                    name: "$branch.name",
                    address: "$branch.address",
                    phone: "$branch.phone",
                    quantity: 1,
                },
            },
            {
                $sort: {
                    quantity: -1,
                    name: 1,
                },
            },
        ]);

        return res.status(200).json({
            productId,
            variantId,
            totalBranches: branches.length,
            branches,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch product availability",
            error,
        });
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
        const productId = req.params.id;
        const user = getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        const userId = user.id;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }

        const updateData = req.body;
        const updatedProduct = await ProductModel.findByIdAndUpdate(
            productId,
            updateData,
            {
                new: true,
                runValidators: true,
                context: "query",
            }
        ).lean();

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        await deleteKeysByPattern("products:base_mapped:*");
        await syncProductToElastic(
            updatedProduct as unknown as Record<string, unknown>
        );
        notificationService.pushNotification(
            "PRODUCT",
            "Product Update",
            `ProductId #${updatedProduct._id.toString()} updated successfully`,
            updatedProduct._id.toString(),
            userId
        );
        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: "Failed to update product", error });
    }
};

export const changeProductStatus = async (req: Request, res: Response) => {
    try {
        const productId = req.params.id;
        const user = getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        const userId = user.id;

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }

        const { to } = req.body;

        const allowedStatuses = [
            Contacts.Status.Evaluation.CREATE,
            Contacts.Status.Evaluation.PUBLIC,
            Contacts.Status.Evaluation.HIDE,
        ];
        const reverseStatus = (statusGroup: Record<string, number>) =>
            Object.fromEntries(
                Object.entries(statusGroup).map(([k, v]) => [v, k])
            );

        const EvaluationStatusName = reverseStatus(Contacts.Status.Evaluation);
        // Kiểm tra "to" có hợp lệ không
        if (!allowedStatuses.includes(to)) {
            return res.status(400).json({
                message: "Invalid status value",
                allowed: allowedStatuses,
            });
        }

        const status = EvaluationStatusName[to];

        // Cập nhật trực tiếp
        const updatedProduct = await ProductModel.findByIdAndUpdate(
            productId,
            { isHide: to },
            { new: true, runValidators: true, context: "query" }
        ).lean();
        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }
        await deleteKeysByPattern("products:base_mapped:*");
        await syncProductToElastic(
            updatedProduct as unknown as Record<string, unknown>
        );
        notificationService.pushNotification(
            "PRODUCT",
            "Product Update",
            `ProductId #${updatedProduct._id.toString()} updated successfully`,
            updatedProduct._id.toString(),
            userId
        );

        res.status(200).json({
            message: `Change status to ${status} successfully`,
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to change status", error });
    }
};
