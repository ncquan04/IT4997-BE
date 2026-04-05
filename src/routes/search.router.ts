import express from "express";
import mongoose from "mongoose";
import { ElasticSearch } from "../../elasticsearch/elastic.client";
import { getCategoryAndDescendantIds } from "../utils/category-tree";

const SearchProductRouter = express.Router();

SearchProductRouter.get("/search/products", async (req, res) => {
    const {
        query,
        brand,
        categoryId,
        specKey,
        specValue,
        minPrice,
        maxPrice,
        page,
        sortBy,
    } = req.query;

    try {
        const categoryIdValue = Array.isArray(categoryId)
            ? categoryId[0]
            : categoryId;

        if (
            categoryIdValue &&
            !mongoose.isValidObjectId(categoryIdValue.toString())
        ) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        const categoryIds = categoryIdValue
            ? await getCategoryAndDescendantIds(categoryIdValue.toString())
            : undefined;

        // Build specFilters from repeated specKey/specValue params (array when multiple)
        const specKeyArr = Array.isArray(specKey)
            ? specKey
            : specKey
              ? [specKey]
              : [];
        const specValueArr = Array.isArray(specValue)
            ? specValue
            : specValue
              ? [specValue]
              : [];
        const specFilters = specKeyArr
            .map((k, i) => ({
                key: k.toString(),
                value: (specValueArr[i] ?? "").toString(),
            }))
            .filter((f) => f.key && f.value);

        const results = await ElasticSearch.searchProductsAdvanced({
            query: query?.toString(),
            brand: brand?.toString(),
            categoryIds,
            specFilters: specFilters.length > 0 ? specFilters : undefined,
            // keep backward-compat single params for non-CategoryPage callers
            specKey: specFilters.length === 0 ? specKey?.toString() : undefined,
            specValue:
                specFilters.length === 0 ? specValue?.toString() : undefined,
            minPrice: minPrice ? Number(minPrice) : undefined,
            maxPrice: maxPrice ? Number(maxPrice) : undefined,
            page: page ? Number(page) : undefined,
            sortBy: sortBy?.toString(),
        });

        res.json(results);
    } catch (err) {
        console.error("Search API error:", err);
        res.status(500).json("Search failed");
    }
});

export default SearchProductRouter;
